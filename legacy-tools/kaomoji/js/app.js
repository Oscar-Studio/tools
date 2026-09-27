// =====================================================
// 颜文字大全 —— UI 层
//
// 搜索是混合式的：本地过滤 0 延迟先出结果，语义搜索在后台跑完再补进来。
// 这里最需要小心的是**竞态**——用户连续输入时，先发的语义请求可能后到，
// ��果渲染出来就会把已经过时的结果盖掉新结果。用单调递增的 token 判定。
// =====================================================
import {
  SUGGESTIONS,
  buildCategoryIndex,
  emptyHint,
  escapeHtml,
  filterByScore,
  filterItems,
  formatScore,
  highlightText,
  mergeResults,
  normalizeQuery,
  shouldRunSemantic,
} from './kaomoji-core.js';

const API_BASE = 'https://api.oscarstudio.cn/api';
const DEBOUNCE_MS = 260;
const MIN_SEMANTIC_SCORE = 0.45;

const $ = (id) => document.getElementById(id);
const dom = {
  searchInput: $('searchInput'),
  clearBtn: $('clearBtn'),
  suggestRow: $('suggestRow'),
  catRow: $('catRow'),
  totalCount: $('totalCount'),
  resultTitle: $('resultTitle'),
  semanticState: $('semanticState'),
  resultMeta: $('resultMeta'),
  grid: $('grid'),
  empty: $('empty'),
  globalError: $('globalError'),
  themeBtn: $('themeBtn'),
  toast: $('toast'),
};

const state = {
  all: [],          // 全量元数据
  category: '',
  query: '',
  semantic: null,   // 当前 query 的语义结果（未完成时为 null）
  token: 0,         // 竞态令牌，单调递增
  loaded: false,
};

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
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 1600);
}

function showError(msg) {
  dom.globalError.textContent = msg || '';
  dom.globalError.hidden = !msg;
}

// ============ 载入数据 ============
async function loadAll() {
  try {
    const res = await fetch(`${API_BASE}/kaomoji?limit=2000`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || '接口返回失败');
    state.all = json.items || [];
    state.loaded = true;
    dom.totalCount.textContent = `共 ${json.total || state.all.length} 条`;
    renderCategories();
    render();
  } catch (err) {
    dom.totalCount.textContent = '载入失败';
    showError(`颜文字库载入失败：${err.message}。请稍后重试。`);
    dom.empty.hidden = false;
    dom.empty.textContent = '暂时拿不到颜文字数据';
  }
}

// ============ 分类 ============
function renderCategories() {
  const idx = buildCategoryIndex(state.all);
  const parts = [];

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'cat-chip is-all' + (state.category ? '' : ' is-active');
  allBtn.innerHTML = `全部<span class="cat-count">${state.all.length}</span>`;
  allBtn.addEventListener('click', () => {
    state.category = '';
    renderCategories();
    render();
  });
  parts.push(allBtn);

  for (const c of idx) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-chip' + (state.category === c.category ? ' is-active' : '');
    btn.innerHTML = `${escapeHtml(c.category)}<span class="cat-count">${c.count}</span>`;
    btn.addEventListener('click', () => {
      // 再点一次已选中的分类 = 取消筛选
      state.category = state.category === c.category ? '' : c.category;
      renderCategories();
      render();
    });
    parts.push(btn);
  }

  dom.catRow.replaceChildren(...parts);
}

// ============ 建议词 ============
function renderSuggestions() {
  const parts = SUGGESTIONS.map((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggest-chip';
    btn.textContent = s;
    btn.addEventListener('click', () => {
      dom.searchInput.value = s;
      onInput();
      dom.searchInput.focus();
    });
    return btn;
  });
  dom.suggestRow.replaceChildren(...parts);
}

// ============ 渲染结果 ============
function cardHtml(item, q) {
  const sim = item.viaSemantic && typeof item.score === 'number'
    ? `<span class="face-sim${item.score < 0.58 ? ' is-weak' : ''}">${escapeHtml(formatScore(item.score))}</span>`
    : '';
  const tags = (item.tags || []).slice(0, 3)
    .map((t) => `<span class="face-tag">#${escapeHtml(t)}</span>`).join('');

  return (
    '<button class="face-card" type="button" data-face="' + escapeHtml(item.face) + '">' +
      `<div class="face">${escapeHtml(item.face)}</div>` +
      `<div class="face-desc">${highlightText(item.desc, q)}</div>` +
      '<div class="face-foot">' +
        `<span class="face-cat">${escapeHtml(item.category)}</span>` +
        tags +
        sim +
      '</div>' +
    '</button>'
  );
}

function render() {
  const q = normalizeQuery(state.query);
  const exact = filterItems(state.all, { category: state.category, q });

  // 语义结果只在「查询词没变」且「没选具体分类」时参与合并：
  // 选了分类就说明用户要的就是那一类，混进别的分类是噪音
  const useSemantic =
    q && state.semantic && !state.category && state.semantic.token === state.token;

  const semantic = useSemantic ? filterByScore(state.semantic.items, MIN_SEMANTIC_SCORE) : [];

  const merged = useSemantic ? mergeResults(exact, semantic) : exact;

  // 标题
  if (state.category && q) dom.resultTitle.textContent = `${state.category} · 搜「${q}」`;
  else if (state.category) dom.resultTitle.textContent = state.category;
  else if (q) dom.resultTitle.textContent = `搜「${q}」`;
  else dom.resultTitle.textContent = '全部';

  // 语义状态
  if (useSemantic || state.semanticPending) {
    dom.semanticState.hidden = false;
    dom.semanticState.classList.remove('is-failed');
    dom.semanticState.innerHTML = '<span class="spinner" aria-hidden="true"></span>语义搜索中…';
  } else if (state.semanticFailed) {
    dom.semanticState.hidden = false;
    dom.semanticState.classList.add('is-failed');
    dom.semanticState.textContent = '语义搜索暂不可用';
  } else {
    dom.semanticState.hidden = true;
  }

  // 说明行
  if (useSemantic && semantic.length) {
    dom.resultMeta.hidden = false;
    dom.resultMeta.textContent =
      `直接匹配 ${exact.length} 条，另有 ${semantic.length} 条意思相近 · 语义检索耗时约 ${(state.semantic.embedMs / 1000).toFixed(1)}s`;
  } else {
    dom.resultMeta.hidden = true;
  }

  // 列表
  if (!merged.length) {
    dom.grid.replaceChildren();
    dom.empty.hidden = false;
    dom.empty.textContent = emptyHint(q, !!(useSemantic && semantic.length));
  } else {
    dom.empty.hidden = true;
    dom.grid.innerHTML = merged.slice(0, 120).map((it) => cardHtml(it, q)).join('');
  }
}

// ============ 语义搜索 ============
async function runSemantic(q, token) {
  state.semanticPending = true;
  render();
  try {
    const res = await fetch(`${API_BASE}/kaomoji/semantic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, limit: 40 }),
    });
    const json = await res.json();

    // 竞态：请求返回时用户可能已经改了查询词或选了分类，丢弃过期结果
    if (token !== state.token) return;

    state.semanticPending = false;
    if (!json.success) {
      state.semanticFailed = true;
      state.semantic = null;
    } else {
      state.semanticFailed = false;
      state.semantic = { items: json.items || [], embedMs: json.embedMs || 0, token };
    }
    render();
  } catch (_) {
    if (token !== state.token) return;
    state.semanticPending = false;
    state.semanticFailed = true;
    state.semantic = null;
    render();
  }
}

// ============ 输入处理 ============
let debounceTimer = null;

function onInput() {
  const raw = dom.searchInput.value;
  state.query = raw;
  dom.clearBtn.hidden = !raw;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // 每次输入都换令牌：让在途的语义请求作废
    state.token++;
    const q = normalizeQuery(raw);
    state.semantic = null;
    state.semanticFailed = false;
    state.semanticPending = false;

    if (shouldRunSemantic(q)) {
      void runSemantic(q, state.token);
    } else {
      render();
    }
  }, DEBOUNCE_MS);
}

dom.searchInput.addEventListener('input', onInput);

dom.clearBtn.addEventListener('click', () => {
  dom.searchInput.value = '';
  onInput();
  dom.searchInput.focus();
});

// ============ 复制 ============
dom.grid.addEventListener('click', async (e) => {
  const card = e.target.closest('[data-face]');
  if (!card) return;
  const face = card.dataset.face;
  if (!face) return;

  try {
    await navigator.clipboard.writeText(face);
  } catch (_) {
    // 非安全上下文下 clipboard 不可用，退回 execCommand
    const ta = document.createElement('textarea');
    ta.value = face;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (__) {}
    ta.remove();
    if (!ok) { toast('复制失败，请手动选择'); return; }
  }

  card.classList.add('is-copied');
  setTimeout(() => card.classList.remove('is-copied'), 700);
  toast('已复制');
});

// ============ 启动 ============
renderSuggestions();
render();
loadAll();
