/**
 * 密码生成器 - 浏览器主入口。
 * - 主题切换 / tab 切换 / 复制按钮 / toast
 * - 强密码 / 助记密码 / 强度评估 / 批量生成 / 历史记录
 * 全部 UI 绑定集中在这里;业务逻辑在 js/* 模块里。
 */
import { generateStrong } from './strong.js';
import { generatePassphrase, getDictSize } from './passphrase.js';
import { assessStrength, SCORE_LABELS, humanCrackTime } from './strength.js';
import * as history from './history.js';
import { randomInt, randomChar } from './random.js';

// ---------- DOM helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function showToast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove('is-visible'), 1600);
}

async function copyToClipboard(text, btn, opts = {}) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // 回退：选中文本
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }
  if (!ok) { showToast('复制失败'); return false; }
  if (btn) {
    if (opts.countdown) {
      startClipboardCountdown(btn);
    } else {
      flashCopyBtn(btn, '已复制');
    }
  } else {
    showToast(opts.countdown ? '已复制（30s 后自动清除）' : '已复制');
  }
  return true;
}

function flashCopyBtn(btn, text) {
  const orig = btn.dataset.origText || btn.textContent;
  btn.dataset.origText = orig;
  btn.textContent = text;
  btn.classList.add('is-ok');
  setTimeout(() => {
    if (btn.dataset.origText) {
      btn.textContent = orig;
      btn.classList.remove('is-ok');
    }
  }, 1500);
}

// ---------- Clipboard countdown ----------
const COUNTDOWN_SECONDS = 30;
let countdownTimer = null;
let countdownEnd = 0;
let countdownBtn = null;

function clearClipboardCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (countdownBtn) {
    const orig = countdownBtn.dataset.origText || '复制';
    countdownBtn.textContent = orig;
    countdownBtn.classList.remove('is-counting', 'is-ok');
  }
  countdownBtn = null;
}

function startClipboardCountdown(btn) {
  // 同一按钮:重置；不同按钮:接管旧的
  if (countdownBtn && countdownBtn !== btn) clearClipboardCountdown();
  countdownBtn = btn;
  if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
  countdownEnd = Date.now() + COUNTDOWN_SECONDS * 1000;
  btn.classList.add('is-counting');
  countdownTimer = setInterval(() => {
    const remain = Math.max(0, Math.ceil((countdownEnd - Date.now()) / 1000));
    if (remain <= 0) {
      // 自动清空剪贴板(覆盖空字符串)
      try { navigator.clipboard.writeText(''); } catch {}
      clearClipboardCountdown();
      showToast('已自动清空剪贴板');
    } else if (countdownBtn === btn) {
      btn.textContent = `已复制 (${remain}s)`;
    }
  }, 250);
}

// 暴露给 UI 按钮用
async function copyNowClear() {
  try { await navigator.clipboard.writeText(''); } catch {}
  clearClipboardCountdown();
  showToast('已清除剪贴板');
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('#themeBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☾' : '☼';
  try { localStorage.setItem('password_theme', theme); } catch {}
}
function initTheme() {
  let theme;
  try { theme = localStorage.getItem('password_theme'); } catch {}
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(theme);
}

// ---------- Tabs ----------
function initTabs() {
  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach((b) => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-selected', b === btn); });
      const target = btn.dataset.tab;
      $$('.tab-panel').forEach((p) => {
        const on = p.id === `panel-${target}`;
        p.classList.toggle('is-active', on);
        p.toggleAttribute('hidden', !on);
      });
      // 切到 strength tab 自动渲染（否则 textarea 不会触发）
      if (target === 'strength') renderStrengthTab();
      if (target === 'batch') renderBatch();
      if (target === 'history') renderHistory();
    });
  });
}

// ---------- Strong password tab ----------
let lastStrong = { password: '', charsetSize: 0, entropy: 0 };

function readStrongOpts() {
  return {
    length: parseInt($('#strongLengthRange').value, 10),
    upper: $('#strongOptUpper').checked,
    lower: $('#strongOptLower').checked,
    digits: $('#strongOptDigits').checked,
    symbols: $('#strongOptSymbols').checked,
    excludeAmbiguous: $('#strongOptExclude').checked,
  };
}

function renderStrong() {
  const out = $('#strongOutput');
  const err = $('#strongError');
  out.classList.remove('is-error');
  try {
    const opts = readStrongOpts();
    const result = generateStrong(opts);
    lastStrong = result;
    out.textContent = result.password;
    err.hidden = true;
    // 同步字符集熵（基于 N^L  上限熵）到强度卡的字符集熵字段
    const charsetSizeEl = $('#strongCharsetEntropy');
    if (charsetSizeEl) charsetSizeEl.textContent = result.entropy.toFixed(1);
    renderStrengthCard('strong', result.password, { charsetEntropy: result.entropy, charsetSize: result.charsetSize });
  } catch (e) {
    out.textContent = '';
    lastStrong = { password: '', charsetSize: 0, entropy: 0 };
    err.textContent = e.message || '生成失败';
    err.hidden = false;
    out.classList.add('is-error');
    renderStrengthCard('strong', '', { charsetEntropy: 0, charsetSize: 0 });
  }
}

/**
 * 渲染强度卡（强密码 / 助记密码 / 独立评估三个 tab 共用）。
 * @param {'strong'|'pass'|'str'} prefix
 * @param {string} pwd
 * @param {{ charsetEntropy?: number, charsetSize?: number, dictEntropy?: number, guesses?: number }} [extra]
 */
function renderStrengthCard(prefix, pwd, extra = {}) {
  const labelEl = $(`#${prefix}StrengthLabel`);
  const bar = $(`#${prefix}StrengthBar`);
  const scoreEl = $(`#${prefix}StrengthScore`);
  const entropyEl = $(`#${prefix}StrengthEntropy`);
  const crackEl = $(`#${prefix}StrengthCrack`);
  const fbEl = $(`#${prefix}StrengthFeedback`);
  const guessesEl = $(`#${prefix}StrengthGuesses`);
  if (!labelEl || !bar) return;
  const segs = bar.querySelectorAll('.strength-seg');

  if (!pwd) {
    labelEl.textContent = '—';
    labelEl.className = 'strength-label';
    segs.forEach((s) => s.className = 'strength-seg');
    if (scoreEl) scoreEl.textContent = '—';
    if (entropyEl) entropyEl.textContent = '—';
    if (crackEl) crackEl.textContent = '—';
    if (fbEl) fbEl.innerHTML = '';
    if (guessesEl) guessesEl.textContent = '—';
    return;
  }

  let score, entropy, warning = null, suggestions = [], crackSlow = null;
  try {
    const r = assessStrength(pwd);
    if (r) {
      score = r.score;
      entropy = r.entropy;
      warning = r.warning;
      suggestions = r.suggestions || [];
      crackSlow = r.crackTimesDisplay.offlineSlow;
    } else {
      score = 0; entropy = 0; crackSlow = '—';
    }
  } catch (err) {
    // zxcvbn 不可用（极少见,如 importmap 失效）
    score = 0; entropy = 0; crackSlow = '—';
    console.warn('[strength] zxcvbn failed:', err);
  }

  labelEl.textContent = SCORE_LABELS[score];
  labelEl.className = `strength-label is-${score}`;
  segs.forEach((s, i) => s.className = `strength-seg${i <= score ? ` is-on-${score}` : ''}`);
  if (scoreEl) scoreEl.textContent = String(score);
  if (entropyEl) entropyEl.textContent = entropy.toFixed(1);
  if (crackEl) crackEl.textContent = crackSlow || '—';
  if (guessesEl) guessesEl.textContent = (extra.guesses ?? Math.pow(2, entropy)).toExponential(2);

  if (fbEl) {
    fbEl.innerHTML = '';
    if (warning) {
      const li = document.createElement('li');
      li.className = 'is-warning';
      li.textContent = warning;
      fbEl.appendChild(li);
    }
    for (const s of suggestions) {
      const li = document.createElement('li');
      li.textContent = s;
      fbEl.appendChild(li);
    }
  }
}

function bindStrongTab() {
  const lengthRange = $('#strongLengthRange');
  const lengthValue = $('#strongLengthValue');
  const trigger = () => {
    lengthValue.textContent = lengthRange.value;
    renderStrong();
  };
  lengthRange.addEventListener('input', trigger);
  ['strongOptUpper', 'strongOptLower', 'strongOptDigits', 'strongOptSymbols', 'strongOptExclude'].forEach((id) => {
    $(`#${id}`).addEventListener('change', renderStrong);
  });
  $('#strongRegenBtn').addEventListener('click', renderStrong);
  $('#strongCopyBtn').addEventListener('click', async () => {
    if (!lastStrong.password) { showToast('请先生成密码'); return; }
    await copyToClipboard(lastStrong.password, $('#strongCopyBtn'), { countdown: true });
  });
  $('#strongSaveBtn').addEventListener('click', () => {
    if (!lastStrong.password) { showToast('请先生成密码'); return; }
    saveLastStrong();
  });
  // 首次进入：生成一次
  renderStrong();
}

// ---------- Passphrase (Diceware) tab ----------
let lastPassphrase = { passphrase: '', entropy: 0, dictSize: 0, words: [] };

function readPassOpts() {
  return {
    count: parseInt($('#passCountRange').value, 10),
    lang: $('#passLang').value,
    separator: $('#passSeparator').value,
    capitalize: $('#passCapitalize').checked,
    includeNumber: $('#passIncludeNumber').checked,
    includeSymbol: $('#passIncludeSymbol').checked,
  };
}

function renderPassphrase() {
  const out = $('#passOutput');
  out.classList.remove('is-error');
  try {
    const opts = readPassOpts();
    const result = generatePassphrase(opts);
    lastPassphrase = result;
    out.textContent = result.passphrase;
    // 词表熵(不含 number/symbol 后缀)
    let dictEntropy = result.entropy;
    if (opts.includeNumber) dictEntropy -= Math.log2(10);
    if (opts.includeSymbol) dictEntropy -= Math.log2(12);
    const dictEntropyEl = $('#passDictEntropy');
    if (dictEntropyEl) dictEntropyEl.textContent = dictEntropy.toFixed(1);
    renderStrengthCard('pass', result.passphrase, { dictEntropy });
  } catch (e) {
    out.textContent = '';
    lastPassphrase = { passphrase: '', entropy: 0, dictSize: 0, words: [] };
    out.classList.add('is-error');
    out.textContent = e.message || '生成失败';
    renderStrengthCard('pass', '', {});
  }
}

function bindPassphraseTab() {
  const countRange = $('#passCountRange');
  const countValue = $('#passCountValue');
  const trigger = () => {
    countValue.textContent = countRange.value;
    renderPassphrase();
  };
  countRange.addEventListener('input', trigger);
  ['passLang', 'passSeparator', 'passCapitalize', 'passIncludeNumber', 'passIncludeSymbol'].forEach((id) => {
    $(`#${id}`).addEventListener('change', renderPassphrase);
  });
  $('#passRegenBtn').addEventListener('click', renderPassphrase);
  $('#passCopyBtn').addEventListener('click', async () => {
    if (!lastPassphrase.passphrase) { showToast('请先生成助记密码'); return; }
    await copyToClipboard(lastPassphrase.passphrase, $('#passCopyBtn'), { countdown: true });
  });
  $('#passSaveBtn').addEventListener('click', () => {
    if (!lastPassphrase.passphrase) { showToast('请先生成助记密码'); return; }
    saveLastPassphrase();
  });
  renderPassphrase();
}

// ---------- 独立强度评估 tab ----------
function renderStrengthTab() {
  const pwd = $('#strInput').value;
  if (!pwd) {
    renderStrengthCard('str', '', {});
    return;
  }
  renderStrengthCard('str', pwd, {});
}

function bindStrengthTab() {
  const input = $('#strInput');
  const debouncedRender = debounce(renderStrengthTab, 80);
  input.addEventListener('input', debouncedRender);
  $('#strSampleBtn').addEventListener('click', () => {
    input.value = 'correct horse battery staple';
    renderStrengthTab();
  });
  $('#strClearBtn').addEventListener('click', () => {
    input.value = '';
    renderStrengthTab();
  });
}

// ---------- Batch tab ----------
let lastBatch = []; // [{ type, value, score, entropy, guesses }]

function batchGenerate() {
  const type = $('#batchType').value;
  const n = Math.max(1, Math.min(200, parseInt($('#batchCount').value, 10) || 10));
  const results = [];
  for (let i = 0; i < n; i++) {
    try {
      if (type === 'strong') {
        const opts = readStrongOpts();
        const r = generateStrong(opts);
        let score = 0, entropy = r.entropy, guesses = Math.pow(2, r.entropy);
        try {
          const a = assessStrength(r.password);
          if (a) { score = a.score; entropy = a.entropy; guesses = a.guesses; }
        } catch {}
        results.push({ type: 'strong', value: r.password, score, entropy, guesses });
      } else {
        const opts = readPassOpts();
        const r = generatePassphrase(opts);
        let score = 0, entropy = r.entropy, guesses = Math.pow(2, r.entropy);
        try {
          const a = assessStrength(r.passphrase);
          if (a) { score = a.score; entropy = a.entropy; guesses = a.guesses; }
        } catch {}
        results.push({ type: 'passphrase', value: r.passphrase, score, entropy, guesses });
      }
    } catch (e) {
      // 单条失败跳过,继续生成
      console.warn('[batch] generate failed:', e);
    }
  }
  lastBatch = results;
  renderBatch();
}

function renderBatch() {
  const table = $('#batchTable');
  const tbody = $('#batchTableBody');
  const summary = $('#batchSummary');
  const empty = $('#batchTable').parentElement.querySelector('.batch-empty');
  if (!table || !tbody) return;

  if (lastBatch.length === 0) {
    table.hidden = true;
    summary.hidden = true;
    if (!empty) {
      const div = document.createElement('div');
      div.className = 'batch-empty';
      div.style.cssText = 'padding:36px 22px;text-align:center;color:var(--muted);font-size:13px';
      div.textContent = '设置数量后点击"生成"开始批量';
      table.parentElement.appendChild(div);
    }
    return;
  }

  // 删除旧的 empty 提示
  table.parentElement.querySelectorAll('.batch-empty').forEach((el) => el.remove());

  summary.hidden = false;
  const min = Math.min(...lastBatch.map((x) => x.score));
  const avg = (lastBatch.reduce((s, x) => s + x.entropy, 0) / lastBatch.length).toFixed(1);
  summary.innerHTML = `共 <strong>${lastBatch.length}</strong> 条 · 平均熵 <strong>${avg}</strong> bit · 最弱评分 <strong>${min}</strong>/4`;

  table.hidden = false;
  tbody.innerHTML = '';
  for (let i = 0; i < lastBatch.length; i++) {
    const item = lastBatch[i];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="pwd-cell"></td>
      <td class="score-cell"></td>
      <td></td>
      <td><button class="copy-btn" type="button">复制</button></td>
    `;
    tr.children[1].textContent = item.value;
    tr.children[2].textContent = `${item.score}/4`;
    tr.children[3].textContent = item.entropy.toFixed(1);
    tr.children[4].querySelector('.copy-btn').addEventListener('click', async (ev) => {
      await copyToClipboard(item.value, ev.currentTarget);
    });
    tbody.appendChild(tr);
  }
}

function batchCopyAll() {
  if (!lastBatch.length) { showToast('请先生成批量'); return; }
  copyToClipboard(lastBatch.map((x) => x.value).join('\n'));
}

function batchExport(fmt) {
  if (!lastBatch.length) { showToast('请先生成批量'); return; }
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  let content, mime, ext;
  if (fmt === 'txt') {
    content = lastBatch.map((x) => x.value).join('\n') + '\n';
    mime = 'text/plain';
    ext = 'txt';
  } else if (fmt === 'csv') {
    const head = '#,type,password,score,entropy(bit)\n';
    content = head + lastBatch.map((x, i) =>
      `${i + 1},${x.type},"${x.value.replace(/"/g, '""')}",${x.score},${x.entropy.toFixed(1)}`
    ).join('\n') + '\n';
    mime = 'text/csv';
    ext = 'csv';
  } else if (fmt === 'json') {
    content = JSON.stringify({
      exportedAt: new Date().toISOString(),
      generator: 'Oscar Studio password-generator',
      count: lastBatch.length,
      items: lastBatch,
    }, null, 2) + '\n';
    mime = 'application/json';
    ext = 'json';
  } else {
    return;
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `passwords-${ts}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`已导出 ${ext.toUpperCase()}`);
}

function bindBatchTab() {
  $('#batchGenBtn').addEventListener('click', batchGenerate);
  $('#batchCopyAllBtn').addEventListener('click', batchCopyAll);
  $('#batchExportFmt').addEventListener('change', (e) => {
    const fmt = e.target.value;
    if (fmt) {
      batchExport(fmt);
      e.target.value = '';
    }
  });
  // 切到 batch tab 时如果还没生成,显示提示
  renderBatch();
}

// ---------- History tab ----------
function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function saveLastStrong() {
  if (!lastStrong.password) { showToast('请先生成密码'); return; }
  let score = null, entropy = lastStrong.entropy;
  try {
    const r = assessStrength(lastStrong.password);
    if (r) { score = r.score; entropy = r.entropy; }
  } catch {}
  history.addEntry({
    type: 'strong',
    value: lastStrong.password,
    options: readStrongOpts(),
    score,
    entropy,
  });
  showToast('已保存到历史');
}

function saveLastPassphrase() {
  if (!lastPassphrase.passphrase) { showToast('请先生成助记密码'); return; }
  let score = null, entropy = lastPassphrase.entropy;
  try {
    const r = assessStrength(lastPassphrase.passphrase);
    if (r) { score = r.score; entropy = r.entropy; }
  } catch {}
  history.addEntry({
    type: 'passphrase',
    value: lastPassphrase.passphrase,
    options: readPassOpts(),
    score,
    entropy,
  });
  showToast('已保存到历史');
}

function renderHistory() {
  const list = $('#historyList');
  const empty = $('#historyEmpty');
  const meta = $('#historyMeta');
  if (!list || !empty || !meta) return;
  const state = history.getState();
  const items = state.items;
  if (items.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    meta.innerHTML = `<strong>0</strong> 条 · 上限 <strong>${history.getMaxHistory()}</strong>`;
    return;
  }
  empty.hidden = true;
  meta.innerHTML = `共 <strong>${items.length}</strong> 条 · 上限 <strong>${history.getMaxHistory()}</strong>`;
  list.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'history-item';
    const typeLabel = it.type === 'passphrase' ? '助记' : '强密码';
    li.innerHTML = `
      <span class="type-chip is-${it.type}">${typeLabel}</span>
      <span class="pwd"></span>
      <span class="meta"></span>
      <span class="actions">
        <button class="copy-btn" type="button">复制</button>
        <button class="text-button is-danger" type="button">删除</button>
      </span>
    `;
    li.querySelector('.pwd').textContent = it.value;
    const scoreTxt = it.score != null ? `评分 ${it.score}/4 · ` : '';
    const entTxt = it.entropy != null ? `${it.entropy.toFixed(1)} bit · ` : '';
    li.querySelector('.meta').textContent = `${scoreTxt}${entTxt}${fmtTime(it.createdAt)}`;
    const btns = li.querySelectorAll('button');
    btns[0].addEventListener('click', async (e) => {
      await copyToClipboard(it.value, e.currentTarget);
    });
    btns[1].addEventListener('click', () => {
      history.deleteEntry(it.id);
    });
    list.appendChild(li);
  }
}

function bindHistoryTab() {
  history.subscribe(renderHistory);
  $('#histClearBtn').addEventListener('click', () => {
    if (!history.getState().items.length) { showToast('历史为空'); return; }
    if (!confirm('确定清空全部历史？此操作不可撤销。')) return;
    history.clearAll();
    showToast('已清空');
  });
  $('#histExportBtn').addEventListener('click', () => {
    const text = history.exportJson();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `password-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('已导出 JSON');
  });
  $('#histImportInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const r = history.importJson(text);
    if (r.ok) showToast(`导入成功: ${r.imported} 条`);
    else showToast('导入失败: ' + (r.error || '未知错误'));
    e.target.value = ''; // 允许再次选同一文件
  });
  renderHistory();
}

// ---------- Bootstrap ----------
function init() {
  initTheme();
  initTabs();
  bindStrongTab();
  bindPassphraseTab();
  bindStrengthTab();
  bindBatchTab();
  bindHistoryTab();

  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'light' ? 'dark' : 'light');
  });
  $('#clearClipboardBtn').addEventListener('click', copyNowClear);

  // crypto.getRandomValues 不可用时显眼提示
  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.getRandomValues !== 'function') {
    const warning = document.createElement('div');
    warning.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);background:var(--error);color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.18)';
    warning.textContent = '⚠ 当前环境不支持 Web Crypto,无法生成密码学安全的随机数。';
    document.body.appendChild(warning);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();