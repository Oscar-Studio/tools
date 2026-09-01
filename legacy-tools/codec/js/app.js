/**
 * 编解码器 - 浏览器主入口。
 * Tabs、输入防抖、复制按钮、主题切换、hex 大小写、JWT 渲染都集中在这一份里。
 */
import {
  b64Encode, b64Decode,
  pctEncode, pctDecode,
  hexEncode, hexDecode,
  unicodeEscape, unicodeUnescape,
  htmlEntitiesEncode, htmlEntitiesDecode,
  rot13,
  punycodeEncode, punycodeDecode,
  toAsciiDump,
} from './encoders.js';
import {
  md5Hex, sha1Hex, sha256Hex, sha384Hex, sha512Hex,
  hmacSha256Hex, hmacSha512Hex,
} from './hashes.js';
import { parseJwt } from './jwt.js';

// ---------- helpers ----------
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

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '已复制';
      btn.classList.add('is-ok');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('is-ok'); }, 1200);
    } else {
      showToast('已复制');
    }
  } catch {
    // 回退：选中文本
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('已复制'); } finally { document.body.removeChild(ta); }
  }
}

function setOutput(name, value, { error = false } = {}) {
  const els = $$(`[data-out="${name}"]`);
  for (const el of els) {
    el.textContent = value;
    el.classList.toggle('is-error', !!error);
  }
}

function setError(name, msg) {
  setOutput(name, msg || '解码失败', { error: true });
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeBtn').textContent = theme === 'dark' ? '☾' : '☼';
  try { localStorage.setItem('codec_theme', theme); } catch {}
}
function initTheme() {
  let theme;
  try { theme = localStorage.getItem('codec_theme'); } catch {}
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
    });
  });
}

// ---------- Encode tab ----------
function bindCopyButtons() {
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.copy-btn');
    if (!btn) return;
    const card = btn.closest('.output-card, .hash-card, .jwt-card');
    if (!card) return;
    let text = '';
    if (card.classList.contains('jwt-card')) {
      const pre = card.querySelector('pre');
      text = pre ? pre.textContent : '';
    } else {
      const out = card.querySelector('[data-out], output, code');
      text = out ? out.textContent : '';
    }
    if (text && !text.startsWith('等待') && !text.startsWith('无法')) {
      copyToClipboard(text, btn);
    } else {
      showToast('无可复制内容');
    }
  });
}

const SAMPLE_TEXT = 'Hello, 世界! 🐱 Special chars: +/= ?&%# 🚀';
const SAMPLE_B64 = 'SGVsbG8sIOS4nQ==';
const SAMPLES = { encode: SAMPLE_TEXT, decode: SAMPLE_B64 };

function renderEncode() {
  const input = $('#modeInput').value;
  const opts = {
    urlSafe: $('#b64UrlSafe').checked,
    xhh: $('#unicodeXhh').checked,
  };
  if (!input) {
    setOutput('base64', ''); setOutput('url', ''); setOutput('hex', '');
    setOutput('unicode', ''); setOutput('html', ''); setOutput('rot13', '');
    setOutput('punycode', ''); setOutput('ascii', '');
    return;
  }
  try { setOutput('base64', b64Encode(input, opts.urlSafe)); } catch (e) { setError('base64', e.message); }
  try { setOutput('url', pctEncode(input)); } catch (e) { setError('url', e.message); }
  try { setOutput('hex', hexEncode(input)); } catch (e) { setError('hex', e.message); }
  try { setOutput('unicode', unicodeEscape(input, { xhh: opts.xhh })); } catch (e) { setError('unicode', e.message); }
  try { setOutput('html', htmlEntitiesEncode(input)); } catch (e) { setError('html', e.message); }
  try { setOutput('rot13', rot13(input)); } catch (e) { setError('rot13', e.message); }
  try { setOutput('punycode', punycodeEncode(input)); } catch (e) { setError('punycode', e.message); }
  try { setOutput('ascii', toAsciiDump(input)); } catch { setOutput('ascii', ''); }
}

function renderDecode() {
  const raw = $('#modeInput').value.trim();
  const root = $('#decodeResults');
  root.innerHTML = '';
  if (!raw) return;
  const tries = [
    { name: 'Base64',  fn: () => b64Decode(raw) },
    { name: 'Base64 URL-safe', fn: () => b64Decode(raw, true) },
    { name: 'URL %xx', fn: () => pctDecode(raw) },
    { name: 'Hex',     fn: () => hexDecode(raw) },
    { name: 'Unicode', fn: () => unicodeUnescape(raw) },
    { name: 'HTML',    fn: () => htmlEntitiesDecode(raw) },
    { name: 'ROT13',   fn: () => rot13(raw) },
    { name: 'Punycode',fn: () => punycodeDecode(raw) },
  ];
  for (const { name, fn } of tries) {
    const card = document.createElement('div');
    card.className = 'decoder-result';
    let ok = true;
    let val = '';
    try { val = fn(); } catch (e) { ok = false; val = ''; }
    if (!ok || val === raw) { card.classList.add('is-fail'); }
    const labelEl = document.createElement('div');
    labelEl.className = 'label';
    labelEl.textContent = name;
    const valueEl = document.createElement('div');
    valueEl.className = 'value';
    valueEl.textContent = val;
    card.appendChild(labelEl);
    card.appendChild(valueEl);
    root.appendChild(card);
  }
}

let mode = 'encode';
function setMode(next) {
  mode = next;
  const isEnc = mode === 'encode';
  $('#modeLabel').textContent = isEnc ? 'ENCODE' : 'DECODE';
  $('#modeTitle').textContent = isEnc ? '输入文本' : '输入已编码文本';
  $('#modeSwapText').textContent = isEnc ? '切换到解码' : '切换到编码';
  $('#modeInput').placeholder = isEnc
    ? '输入要转换的文本，左下方会同时输出 8 种编码…'
    : '粘贴已编码的文本（SGVsbG8=、%E4%B8%AD…），下方会同时尝试多种格式解码';
  $('#encodeOutputs').toggleAttribute('hidden', !isEnc);
  $('#decodeResults').toggleAttribute('hidden', isEnc);
  $('#decodeHint').toggleAttribute('hidden', isEnc);
  // 重置失败行高亮（每次切到 decode 重新评估）
  $('#encodeOutputs').querySelectorAll('.output-card').forEach((c) => c.classList.remove('is-error'));
  // 立即渲染新模式的内容
  renderMode();
}

function renderMode() {
  if (mode === 'encode') renderEncode();
  else renderDecode();
}
// ---------- Hash tab ----------
function renderHashes() {
  const input = $('#hashInput').value;
  if (!input) {
    ['md5','sha1','sha256','sha384','sha512'].forEach((n) => setOutput(n, ''));
    return;
  }
  const upper = $('#hashUppercase').checked;
  // 同步函数一次算完（Web Crypto 也快），统一刷新
  Promise.allSettled([
    Promise.resolve(md5Hex(input)),
    sha1Hex(input),
    sha256Hex(input),
    sha384Hex(input),
    sha512Hex(input),
  ]).then(([md5r, s1, s256, s384, s512]) => {
    const fmt = upper ? (s) => s.toUpperCase() : (s) => s;
    const set = (n, r) => r.status === 'fulfilled'
      ? setOutput(n, fmt(r.value))
      : setError(n, r.reason && r.reason.message || String(r.reason));
    set('md5', md5r);
    set('sha1', s1);
    set('sha256', s256);
    set('sha384', s384);
    set('sha512', s512);
  });
}

// ---------- HMAC tab ----------
async function renderHmac() {
  const key = $('#hmacKey').value;
  const msg = $('#hmacMsg').value;
  const fmt = $('#hmacFormat').value;
  if (!key || !msg) {
    setOutput('hmac256', ''); setOutput('hmac512', '');
    return;
  }
  try {
    const hex256 = await hmacSha256Hex(key, msg);
    const hex512 = await hmacSha512Hex(key, msg);
    if (fmt === 'base64') {
      const b64 = (hex) => {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin);
      };
      setOutput('hmac256', b64(hex256));
      setOutput('hmac512', b64(hex512));
    } else {
      setOutput('hmac256', hex256.toLowerCase());
      setOutput('hmac512', hex512.toLowerCase());
    }
  } catch (e) {
    setError('hmac256', e.message || String(e));
    setError('hmac512', e.message || String(e));
  }
}

// ---------- JWT tab ----------
function renderJwt() {
  const raw = $('#jwtInput').value.trim();
  const status = $('#jwtStatus');
  status.classList.remove('is-error', 'is-ok', 'is-warn');
  setOutput('jwtHeader', ''); setOutput('jwtPayload', ''); setOutput('jwtSig', ''); setOutput('jwtMeta', '');
  if (!raw) { status.textContent = '粘贴一个 JWT 字符串开始解析…'; status.classList.add('is-warn'); return; }

  const r = parseJwt(raw);
  if (r.error) {
    status.textContent = '✦ ' + r.error;
    status.classList.add('is-error');
    return;
  }
  // Header
  setOutput('jwtHeader', JSON.stringify(r.header, null, 2));
  setOutput('jwtSig', r.signatureB64 || '');

  // Payload + 时间标注
  const payloadLines = [JSON.stringify(r.payload, null, 2)];
  const meta = [];
  if (r.iatISO) meta.push(`iat: ${r.iatISO}`);
  if (r.expISO) meta.push(`exp: ${r.expISO}`);
  if (r.nbfISO) meta.push(`nbf: ${r.nbfISO}`);
  if (r.remains) meta.push(r.remains);
  setOutput('jwtMeta', meta.join(' · '));

  const payloadEl = document.querySelector('[data-out="jwtPayload"]');
  payloadEl.innerHTML = '';
  // Pre-like rendering with highlight
  const jsonText = JSON.stringify(r.payload, null, 2);
  const pre = document.createElement('span');
  pre.textContent = jsonText;
  payloadEl.appendChild(pre);

  let statusMsg = '✦ 已解析（未校验签名）';
  if (r.status === 'expired') statusMsg += ' · 已过期';
  else if (r.status === 'active-soon') statusMsg += ' · 即将过期';
  status.textContent = statusMsg;
  status.classList.add(r.status === 'expired' ? 'is-warn' : 'is-ok');
}

// ---------- bootstrap ----------
function init() {
  initTheme();
  initTabs();
  bindCopyButtons();
  setMode('encode'); // 初始化 swap UI 默认状态（无输入时不渲染）

  // Theme toggle
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'light' ? 'dark' : 'light');
  });

  // Encode / Decode tab（共用同一个 textarea + swap 切换模式）
  const modeRender = debounce(renderMode, 120);
  $('#modeInput').addEventListener('input', modeRender);
  $('#modeToggleBtn').addEventListener('click', () => setMode(mode === 'encode' ? 'decode' : 'encode'));
  // Shortcut: Cmd/Ctrl + Shift + E toggles mode
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      const inEncodeTab = !$('#panel-encode').hasAttribute('hidden');
      if (inEncodeTab) { e.preventDefault(); setMode(mode === 'encode' ? 'decode' : 'encode'); }
    }
  });
  ['b64UrlSafe', 'unicodeXhh'].forEach((id) => $(`#${id}`).addEventListener('change', modeRender));
  $('#encodeSampleBtn').addEventListener('click', () => {
    $('#modeInput').value = SAMPLES[mode] ?? '';
    modeRender();
  });
  $('#encodeClearBtn').addEventListener('click', () => { $('#modeInput').value = ''; modeRender(); });

  // Hash tab
  const hashRender = debounce(renderHashes, 150);
  $('#hashInput').addEventListener('input', hashRender);
  $('#hashUppercase').addEventListener('change', hashRender);
  $('#hashSampleBtn').addEventListener('click', () => { $('#hashInput').value = 'The quick brown fox jumps over the lazy dog'; hashRender(); });
  $('#hashClearBtn').addEventListener('click', () => { $('#hashInput').value = ''; hashRender(); });

  // HMAC tab
  const hmacRender = debounce(renderHmac, 200);
  ['hmacKey', 'hmacMsg', 'hmacFormat'].forEach((id) => $(`#${id}`).addEventListener('input', hmacRender));
  $('#hmacSampleBtn').addEventListener('click', () => {
    $('#hmacKey').value = 'secret-key';
    $('#hmacMsg').value = 'message to sign';
    hmacRender();
  });
  $('#hmacClearBtn').addEventListener('click', () => {
    $('#hmacKey').value = ''; $('#hmacMsg').value = '';
    hmacRender();
  });

  // JWT tab
  const SAMPLE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const jwtRender = debounce(renderJwt, 150);
  $('#jwtInput').addEventListener('input', jwtRender);
  $('#jwtSampleBtn').addEventListener('click', () => { $('#jwtInput').value = SAMPLE_JWT; jwtRender(); });
  $('#jwtClearBtn').addEventListener('click', () => { $('#jwtInput').value = ''; jwtRender(); });

  // Initial status (lightweight)
  $('#jwtStatus').textContent = '粘贴一个 JWT 字符串开始解析…';
  $('#jwtStatus').classList.add('is-warn');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
