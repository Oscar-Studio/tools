// =====================================================
// 正则表达式工作台 —— UI 层
// 所有判定逻辑都在 regex-core.js（已过 Node 测试），这里只做事件与渲染。
// =====================================================
import {
  FLAG_INFO,
  SNIPPETS,
  SAMPLE_FLAGS,
  SAMPLE_PATTERN,
  SAMPLE_TEXT,
  buildRegex,
  collectMatches,
  decodeState,
  encodeState,
  escapeHtml,
  expandReplacement,
  normalizeFlags,
  renderHighlight,
} from './regex-core.js';

const $ = (id) => document.getElementById(id);
const dom = {
  patternInput: $('patternInput'),
  patternEditor: document.querySelector('.pattern-editor'),
  patternStatus: $('patternStatus'),
  flagRow: $('flagRow'),
  sampleBtn: $('sampleBtn'),
  clearBtn: $('clearBtn'),
  textInput: $('textInput'),
  matchCounter: $('matchCounter'),
  matchList: $('matchList'),
  replaceInput: $('replaceInput'),
  replaceHint: $('replaceHint'),
  replacePreview: $('replacePreview'),
  copyResultBtn: $('copyResultBtn'),
  snippetGroups: $('snippetGroups'),
  shareBtn: $('shareBtn'),
  themeBtn: $('themeBtn'),
  toast: $('toast'),
};

const state = { flags: '', replacement: '' };

// ============ 主题 ============
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.body.dataset.theme = t;
  try { localStorage.setItem('oscar-theme', t); } catch (_) {}
  if (dom.themeBtn) dom.themeBtn.textContent = t === 'dark' ? '☾' : '☼';
}
(function initTheme() {
  let t;
  try { t = localStorage.getItem('oscar-theme'); } catch (_) {}
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(t);
})();
dom.themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

// ============ Toast ============
let toastTimer = null;
function toast(msg) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 1800);
}

// ============ 标志位 chips ============
function renderFlags() {
  dom.flagRow.innerHTML = '';
  for (const info of FLAG_INFO) {
    const on = state.flags.includes(info.flag);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'flag-chip';
    chip.setAttribute('aria-pressed', String(on));
    chip.title = info.desc;
    chip.innerHTML = `<b>${info.flag}</b><span class="flag-tip">${escapeHtml(info.label)}</span>`;
    chip.addEventListener('click', () => {
      state.flags = state.flags.includes(info.flag)
        ? state.flags.replace(info.flag, '')
        : state.flags + info.flag;
      renderFlags();
      run();
    });
    dom.flagRow.appendChild(chip);
  }
}

// ============ 片段库 ============
function renderSnippets() {
  dom.snippetGroups.innerHTML = '';
  for (const group of SNIPPETS) {
    const wrap = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'snippet-group-title';
    title.textContent = group.group;
    const row = document.createElement('div');
    row.className = 'snippet-row';

    for (const item of group.items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'snippet-btn';
      btn.title = item.note;
      btn.innerHTML =
        `<b>${escapeHtml(item.label)}</b>` +
        `<code>/${escapeHtml(item.pattern)}/${escapeHtml(item.flags)}</code>` +
        `<small>${escapeHtml(item.note)}</small>`;
      btn.addEventListener('click', () => {
        dom.patternInput.value = item.pattern;
        state.flags = normalizeFlags(item.flags);
        // 带 replacement 的片段（如「去 HTML 标签」）直接把替换框也填上，否则看不出效果
        dom.replaceInput.value = item.replacement !== undefined ? item.replacement : '';
        state.replacement = dom.replaceInput.value;
        renderFlags();
        run();
        dom.patternInput.focus();
        toast(`已填入「${item.label}」`);
      });
      row.appendChild(btn);
    }
    wrap.appendChild(title);
    wrap.appendChild(row);
    dom.snippetGroups.appendChild(wrap);
  }
}

// ============ 匹配列表 ============
const MAX_VALUE_CHARS = 160;

function clampText(s) {
  const str = String(s ?? '');
  if (str.length <= MAX_VALUE_CHARS) return escapeHtml(str);
  return escapeHtml(str.slice(0, MAX_VALUE_CHARS)) +
    `<span class="clamp">… 共 ${str.length} 字符</span>`;
}

function renderMatches(matches, groupCount) {
  if (!matches.length) {
    dom.matchList.innerHTML =
      '<div class="match-item"><span class="match-value clamp">暂无匹配</span></div>';
    return;
  }
  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const chips = [];
    // 数字组
    for (const g of m.groups) {
      if (g.name !== null) continue;
      chips.push(
        `<span class="group-chip${g.text == null ? ' is-null' : ''}" title="第 ${g.index} 个捕获组 $${g.index}">` +
        `$$${g.index}=${g.text == null ? '未参与' : clampText(g.text)}</span>`
      );
    }
    // 命名组
    for (const g of m.groups) {
      if (g.name === null) continue;
      chips.push(
        `<span class="group-chip${g.text == null ? ' is-null' : ''}" title="命名组 $&lt;${escapeHtml(g.name)}&gt;">` +
        `${escapeHtml(g.name)}=${g.text == null ? '未参与' : clampText(g.text)}</span>`
      );
    }
    parts.push(
      '<div class="match-item">' +
        `<div class="match-head">` +
          `<span class="match-no">#${i + 1}</span>` +
          `<span class="match-pos">位置 ${m.index}–${m.end}</span>` +
        '</div>' +
        `<div class="match-value">${clampText(m.text)}</div>` +
        (chips.length ? `<div class="group-row">${chips.join('')}</div>` : '') +
      '</div>'
    );
  }
  if (!groupCount) {
    parts.push(
      '<div class="match-item"><span class="match-value clamp">这条正则没有捕获组，用 ( ) 包起来就能引用 $1</span></div>'
    );
  }
  dom.matchList.innerHTML = parts.join('');
}

// ============ 替换预览 ============
function renderReplace(text, matches, hasReplacement) {
  if (!hasReplacement) {
    dom.replacePreview.classList.add('is-empty');
    dom.replacePreview.textContent = '留空则只显示高亮，不做替换。';
    dom.copyResultBtn.disabled = true;
    return;
  }
  if (!matches.length) {
    dom.replacePreview.classList.add('is-empty');
    dom.replacePreview.textContent = '没有匹配，原文照旧。';
    dom.copyResultBtn.disabled = true;
    return;
  }
  // 预览展示「替换后的结果」，命中处用绿色标出
  dom.replacePreview.classList.remove('is-empty');
  dom.replacePreview.innerHTML = renderHighlight(text, matches, { replacement: state.replacement });
  dom.copyResultBtn.disabled = false;
}

// ============ 主渲染 ============
let current = { output: text0(), matches: [] };
function text0() { return dom.textInput.value; }

function run() {
  const source = dom.patternInput.value;
  const text = dom.textInput.value;
  const built = buildRegex(source, state.flags);

  if (!built.ok) {
    dom.patternEditor.classList.add('is-error');
    dom.patternStatus.className = 'pattern-status is-error';
    dom.patternStatus.textContent = `✕ ${built.error}`;
    dom.matchCounter.textContent = '—';
    dom.matchCounter.classList.remove('is-hit');
    dom.matchList.innerHTML =
      '<div class="match-item"><span class="match-value clamp">正则有语法错误，修正后即可匹配</span></div>';
    dom.replacePreview.classList.add('is-empty');
    dom.replacePreview.textContent = '正则有语法错误。';
    dom.copyResultBtn.disabled = true;
    return;
  }
  dom.patternEditor.classList.remove('is-error');

  const { matches, truncated, groupCount } = collectMatches(built.regex, text);

  // 状态行
  if (!source) {
    dom.patternStatus.className = 'pattern-status';
    dom.patternStatus.textContent = '输入一个正则开始。';
  } else if (!text) {
    dom.patternStatus.className = 'pattern-status is-ok';
    dom.patternStatus.textContent = `✓ 正则有效 · ${countCapturingGroupsLabel(groupCount)}`;
  } else {
    dom.patternStatus.className = matches.length ? 'pattern-status is-ok' : 'pattern-status';
    const tail = truncated ? '（已截断，只列出前若干条）' : '';
    dom.patternStatus.textContent =
      `✓ 正则有效 · ${matches.length} 处匹配 · ${countCapturingGroupsLabel(groupCount)}${tail}`;
  }

  dom.matchCounter.textContent = matches.length ? `${matches.length} 处匹配` : '无匹配';
  dom.matchCounter.classList.toggle('is-hit', matches.length > 0);

  renderMatches(matches, groupCount);
  renderReplace(text, matches, state.replacement !== '');

  // 缓存「纯文本替换结果」供复制
  if (state.replacement !== '' && matches.length) {
    let out = '';
    let cursor = 0;
    for (const m of matches) {
      if (m.index < cursor) continue;
      out += text.slice(cursor, m.index);
      out += expandReplacement(m, state.replacement);
      cursor = m.end;
    }
    out += text.slice(cursor);
    current.output = out;
  } else {
    current.output = text;
  }
  current.matches = matches;

  syncHash(source, state.flags);
}

function countCapturingGroupsLabel(n) {
  if (!n) return '无捕获组';
  return n === 1 ? '1 个捕获组' : `${n} 个捕获组`;
}

// ============ 分享链接 ============
let hashTimer = null;
function syncHash(source, flags) {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const hash = encodeState(source, flags);
    const url = hash ? `${location.origin}${location.pathname}#${hash}` : location.origin + location.pathname;
    history.replaceState(null, '', url);
  }, 400);
}

dom.shareBtn.addEventListener('click', async () => {
  const hash = encodeState(dom.patternInput.value, state.flags);
  const url = hash ? `${location.origin}${location.pathname}#${hash}` : `${location.origin}${location.pathname}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('分享链接已复制');
  } catch (_) {
    // 剪贴板不可用（非 https / 无权限）时退回到直接改地址栏
    history.replaceState(null, '', url);
    toast('已写入地址栏，可手动复制');
  }
});

dom.copyResultBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(current.output);
    toast('替换结果已复制');
  } catch (_) {
    toast('复制失败，请手动选择文本');
  }
});

// ============ 事件绑定 ============
let textTimer = null;
dom.patternInput.addEventListener('input', run);

dom.textInput.addEventListener('input', () => {
  clearTimeout(textTimer);
  textTimer = setTimeout(run, 120);
});

dom.replaceInput.addEventListener('input', () => {
  state.replacement = dom.replaceInput.value;
  run();
});

dom.sampleBtn.addEventListener('click', () => {
  dom.patternInput.value = SAMPLE_PATTERN;
  dom.textInput.value = SAMPLE_TEXT;
  dom.replaceInput.value = '';
  state.flags = normalizeFlags(SAMPLE_FLAGS);
  state.replacement = '';
  renderFlags();
  run();
  toast('已填入示例');
});

dom.clearBtn.addEventListener('click', () => {
  dom.patternInput.value = '';
  dom.textInput.value = '';
  dom.replaceInput.value = '';
  state.flags = '';
  state.replacement = '';
  renderFlags();
  run();
  dom.patternInput.focus();
});

// ============ 启动：优先从 hash 恢复，否则用示例 ============
(function init() {
  const fromHash = decodeState(location.hash);
  if (fromHash.source) {
    dom.patternInput.value = fromHash.source;
    state.flags = fromHash.flags;
    dom.textInput.value = SAMPLE_TEXT;
  } else {
    dom.patternInput.value = SAMPLE_PATTERN;
    dom.textInput.value = SAMPLE_TEXT;
    state.flags = normalizeFlags(SAMPLE_FLAGS);
  }
  renderFlags();
  renderSnippets();
  run();
})();
