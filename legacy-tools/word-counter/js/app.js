import { countText, formatReadingTime } from './stats.js';
import { segment } from './segment.js';

const $ = (id) => document.getElementById(id);
const ids = ['charactersWithoutSpaces', 'englishWords', 'chineseCharacters', 'readingMinutes', 'charactersWithSpaces', 'digits', 'punctuation', 'lines', 'paragraphs', 'utf8Bytes'];
const SAMPLE = `好的文字，不只是把想法写下来，更是把想法整理清楚。\n\n当我们删去多余的修饰，留下准确、真诚而有力量的句子，读者才更容易抵达我们真正想表达的地方。\n\nGood writing is clear thinking made visible.`;
let documents = [];
let highlightWord = '';
let highlightRange = { start: 0, end: 0 };
let highlightIndex = 0;
let highlightMatches = [];
let activeId = '';
let dirty = false;
let detailed = false;
let updateFrame = 0;

const makeDocument = (title = '未命名文稿', content = '') => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title, content, stats: countText(content), snapshots: [{ timestamp: Date.now(), charactersWithoutSpaces: countText(content).charactersWithoutSpaces, words: countText(content).englishWords }] });
const activeDocument = () => documents.find((document) => document.id === activeId);
const formatNumber = (number) => new Intl.NumberFormat('zh-CN').format(number);

function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function renderDocuments() {
  const list = $('documentList'); list.innerHTML = '';
  documents.forEach((doc) => {
    const item = document.createElement('button'); item.type = 'button'; item.className = `document-item ${doc.id === activeId ? 'is-active' : ''}`; item.setAttribute('role', 'listitem'); item.dataset.id = doc.id;
    const iconEl = document.createElement('span');
    iconEl.className = 'document-item-icon';
    iconEl.textContent = doc.id === activeId ? '✦' : '◦';
    const copyEl = document.createElement('span');
    copyEl.className = 'document-item-copy';
    const strongEl = document.createElement('strong');
    strongEl.textContent = doc.title || '未命名文稿';
    const smallEl = document.createElement('small');
    smallEl.textContent = `${formatNumber(doc.stats.charactersWithoutSpaces)} 字 · ${formatTime(doc.stats.readingMinutes)}`;
    copyEl.appendChild(strongEl);
    copyEl.appendChild(smallEl);
    item.appendChild(iconEl);
    item.appendChild(copyEl);
    item.addEventListener('click', () => switchDocument(doc.id)); list.appendChild(item);
  }); $('docCount').textContent = `${documents.length} 篇`;
}

let wordRange = 20;
function renderWordCloud(doc) {
  const cloud = $('wordcloud'); const empty = $('wordcloudEmpty'); const summary = $('wordcloudSummary');
  const { entries, total } = segment(doc.content);
  const limit = wordRange || entries.length; const shown = entries.slice(0, limit);
  if (!shown.length) { cloud.hidden = true; cloud.innerHTML = ''; empty.hidden = false; summary.textContent = '— 个不同词汇'; return; }
  empty.hidden = true; cloud.hidden = false; cloud.innerHTML = '';
  const max = shown[0].count; const min = shown.at(-1).count; const range = Math.max(max - min, 1);
  for (const entry of shown) {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'cloud-chip'; chip.setAttribute('role', 'listitem');
    chip.title = `${entry.word} · ${entry.count} 次`;
    const ratio = (entry.count - min) / range; const scale = 0.85 + ratio * 0.65; const weight = entry.count === max ? 700 : ratio > 0.5 ? 600 : 500;
    chip.style.setProperty('--scale', scale.toFixed(2));
    chip.style.setProperty('--weight', String(weight));
    chip.style.setProperty('--opacity', (0.7 + ratio * 0.3).toFixed(2));
    const wordEl = document.createElement('span');
    wordEl.className = 'cloud-word';
    wordEl.textContent = entry.word;
    const countEl = document.createElement('span');
    countEl.className = 'cloud-count';
    countEl.textContent = formatNumber(entry.count);
    chip.appendChild(wordEl);
    chip.appendChild(countEl);
    chip.addEventListener('click', () => locateInEditor(entry.word));
    cloud.appendChild(chip);
  }
  summary.textContent = `${formatNumber(entries.length)} 个不同词汇 · ${formatNumber(total.tokens)} 次出现`;
}

function locateInEditor(word) {
  const matches = findAllMatches(word);
  if (!matches.length) { showToast(`未找到“${word}”`); return; }
  setHighlight(word, { resetIndex: true });
  showToast(`高亮“${word}” · ${matches.length} 处`);
}

function renderStats(document) {
  const stats = document.stats;
  ids.forEach((id) => { const element = $(id); if (element) element.textContent = id === 'readingMinutes' ? formatReadingTime(stats.readingMinutes) : formatNumber(stats[id]); });
  $('liveCount').textContent = `${formatNumber(stats.charactersWithoutSpaces)} 字`;
  $('editorHint').textContent = dirty ? '编辑中 · 仅本地' : '准备就绪';
  $('detailStats').hidden = !detailed;
  $('viewToggle').textContent = detailed ? '简洁' : '详细'; $('viewToggle').setAttribute('aria-pressed', String(detailed));
  renderTrend(document.snapshots); renderWordCloud(document);
}

function renderTrend(snapshots) {
  const line = $('trendChart').querySelector('.trend-line'); const area = $('trendChart').querySelector('.trend-area');
  const values = snapshots.slice(-18).map((snapshot) => snapshot.charactersWithoutSpaces); const max = Math.max(...values, 1); const min = Math.min(...values, 0); const range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 300},${66 - ((value - min) / range) * 55}`);
  if (points.length === 1) points.push('300,66');
  const path = `M${points.join(' L')}`; line.setAttribute('d', path); area.setAttribute('d', `${path} L300 68 L0 68 Z`);
  const delta = values.length > 1 ? values[values.length - 1] - values[0] : 0; $('trendDelta').textContent = delta > 0 ? `+${formatNumber(delta)} 字` : delta < 0 ? `${formatNumber(delta)} 字` : '暂无变化'; $('trendDelta').classList.toggle('is-positive', delta > 0);
}

function updateContent(content) {
  const document = activeDocument(); if (!document) return;
  document.content = content; document.stats = countText(content); dirty = true;
  if (highlightWord) { highlightMatches = findAllMatches(highlightWord); if (highlightIndex >= highlightMatches.length) highlightIndex = 0; highlightRange = highlightMatches[highlightIndex] || { start: 0, end: 0 }; const label = $('highlightLabel'); if (label) label.textContent = highlightMatches.length ? `${highlightIndex + 1} / ${highlightMatches.length}` : '未找到'; }
  const last = document.snapshots.at(-1); const now = Date.now();
  if (!last || now - last.timestamp > 700 || last.charactersWithoutSpaces !== document.stats.charactersWithoutSpaces) document.snapshots.push({ timestamp: now, charactersWithoutSpaces: document.stats.charactersWithoutSpaces, words: document.stats.englishWords });
  renderStats(document); renderDocuments();
}

function switchDocument(id) { if (id === activeId) return; activeId = id; const document = activeDocument(); $('editor').value = document.content; $('documentTitle').value = document.title; dirty = false; clearHighlight(); renderDocuments(); renderStats(document); }
function newDocument(content = '', title = '未命名文稿') { const document = makeDocument(title, content); documents.push(document); activeId = document.id; $('editor').value = content; $('documentTitle').value = title; dirty = false; clearHighlight(); renderDocuments(); renderStats(document); $('documentTitle').focus(); $('documentTitle').select(); }
function closeDocument() { if (documents.length === 1) { if ($('editor').value && !window.confirm('清空当前文稿并关闭吗？')) return; documents[0] = makeDocument(); activeId = documents[0].id; } else { const index = documents.findIndex((document) => document.id === activeId); documents = documents.filter((document) => document.id !== activeId); activeId = documents[Math.max(0, index - 1)].id; } const document = activeDocument(); $('editor').value = document.content; $('documentTitle').value = document.title; dirty = false; clearHighlight(); renderDocuments(); renderStats(document); }

function exportDocument() { const doc = activeDocument(); if (!doc) return; const safeTitle = (doc.title || '未命名文稿').replace(/[\\/:*?"<>|]/g, '-'); const extension = $('exportFormat').value; const blob = new Blob([doc.content], { type: `${extension === 'md' ? 'text/markdown' : 'text/plain'};charset=utf-8` }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${safeTitle}.${extension}`; link.click(); URL.revokeObjectURL(link.href); dirty = false; renderStats(doc); showToast('文稿已导出'); }
function importFile(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => newDocument(String(reader.result ?? ''), file.name.replace(/\.(markdown|md|txt)$/iu, '') || '导入文稿'); reader.readAsText(file); }
function copyText(text, message) { if (!navigator.clipboard?.writeText) { showToast('当前浏览器不支持自动复制'); return; } navigator.clipboard.writeText(text).then(() => showToast(message)).catch(() => showToast('复制失败，请检查浏览器权限')); }
function copySummary() { const document = activeDocument(); const s = document.stats; copyText(`《${document.title}》\n不含空格字符：${s.charactersWithoutSpaces}\n中文字符：${s.chineseCharacters}\n英文单词：${s.englishWords}\n段落：${s.paragraphs}\n预计阅读：${formatReadingTime(s.readingMinutes)}`, '统计摘要已复制'); }
function formatTime(minutes) { return minutes ? formatReadingTime(minutes) : '未开始'; }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'); }

// Mirror strategy: a hidden <div> cloned from the textarea sits inside editor-surface.
// For each match, we Range over its text node and read getClientRects() — the browser
// gives us real viewport coordinates using the mirror's own layout. We then convert
// those into coordinates relative to editor-surface and subtract the textarea's
// scrollTop / scrollLeft so the overlay lands exactly where the textarea's text is.
let mirrorEl = null;
let mirrorTextNode = null;
let overlayEl = null;

function setupMirror() {
  if (mirrorEl) return;
  const editor = $('editor'); const surface = $('editorSurface'); if (!editor || !surface) return;
  const cs = getComputedStyle(editor);
  mirrorEl = document.createElement('div');
  mirrorEl.setAttribute('aria-hidden', 'true');
  mirrorEl.style.cssText = (
    'position:absolute;top:0;left:0;width:100%;' +
    'box-sizing:' + cs.boxSizing + ';' +
    'padding:' + cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft + ';' +
    'margin:0;border:0;' +
    'font-family:' + cs.fontFamily + ';' +
    'font-size:' + cs.fontSize + ';' +
    'font-weight:' + cs.fontWeight + ';' +
    'line-height:' + cs.lineHeight + ';' +
    'letter-spacing:' + cs.letterSpacing + ';' +
    'tab-size:' + cs.tabSize + ';' +
    'white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;' +
    'scrollbar-gutter:stable;' +
    'visibility:hidden;pointer-events:none;'
  );
  surface.appendChild(mirrorEl);
  mirrorTextNode = document.createTextNode('');
  mirrorEl.appendChild(mirrorTextNode);

  overlayEl = document.createElement('div');
  overlayEl.className = 'editor-highlight-overlay';
  overlayEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
  surface.appendChild(overlayEl);
}

function findAllMatches(word) {
  const editor = $('editor'); if (!editor || !word) return [];
  const safe = escapeRegExp(word);
  let pattern; try { pattern = new RegExp(safe, 'gi'); } catch { return []; }
  const matches = []; let m;
  while ((m = pattern.exec(editor.value)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return matches;
}

function clearHighlights() { if (overlayEl) overlayEl.innerHTML = ''; }

function applyHighlights() {
  clearHighlights();
  setupMirror();
  if (!overlayEl || !mirrorTextNode) return;
  if (!highlightWord || !highlightMatches.length) return;
  const surface = $('editorSurface'); const editor = $('editor');
  if (!surface || !editor) return;
  const surfaceRect = surface.getBoundingClientRect();
  const scrollTop = editor.scrollTop; const scrollLeft = editor.scrollLeft;
  for (let i = 0; i < highlightMatches.length; i++) {
    const { start, end } = highlightMatches[i];
    const range = document.createRange();
    range.setStart(mirrorTextNode, start); range.setEnd(mirrorTextNode, end);
    const rects = range.getClientRects();
    const isCurrent = i === highlightIndex;
    for (const rect of rects) {
      const node = document.createElement('div');
      node.className = isCurrent ? 'editor-highlight is-current' : 'editor-highlight';
      node.style.cssText = (
        'position:absolute;' +
        'left:' + (rect.left - surfaceRect.left - scrollLeft) + 'px;' +
        'top:' + (rect.top - surfaceRect.top - scrollTop) + 'px;' +
        'width:' + rect.width + 'px;' +
        'height:' + rect.height + 'px;'
      );
      overlayEl.appendChild(node);
    }
  }
}

function measureScrollTo(position) {
  const editor = $('editor'); if (!editor) return 0;
  const probe = document.createElement('div');
  const cs = getComputedStyle(editor);
  probe.style.cssText = (
    'position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;' +
    'width:' + editor.clientWidth + 'px;' +
    'box-sizing:' + cs.boxSizing + ';' +
    'padding:0;margin:0;border:0;' +
    'font-family:' + cs.fontFamily + ';' +
    'font-size:' + cs.fontSize + ';' +
    'font-weight:' + cs.fontWeight + ';' +
    'line-height:' + cs.lineHeight + ';' +
    'letter-spacing:' + cs.letterSpacing + ';' +
    'tab-size:' + cs.tabSize + ';' +
    'white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;'
  );
  probe.textContent = editor.value.slice(0, position);
  document.body.appendChild(probe);
  const top = probe.offsetHeight;
  document.body.removeChild(probe);
  return top;
}

function setHighlight(word, { resetIndex = true } = {}) {
  highlightWord = word || '';
  highlightMatches = word ? findAllMatches(word) : [];
  if (!highlightMatches.length) { highlightIndex = 0; highlightRange = { start: 0, end: 0 }; }
  else if (resetIndex) { highlightIndex = 0; highlightRange = highlightMatches[0]; }
  else { highlightIndex = Math.max(0, Math.min(highlightIndex, highlightMatches.length - 1)); highlightRange = highlightMatches[highlightIndex] || { start: 0, end: 0 }; }
  const nav = $('highlightNav'); if (nav) nav.hidden = !word;
  if (word) $('highlightLabel').textContent = highlightMatches.length ? `${highlightIndex + 1} / ${highlightMatches.length}` : '未找到';
  mirrorTextNode && (mirrorTextNode.data = $('editor').value);
  applyHighlights();
  if (word && highlightMatches.length) focusHighlight();
}

function focusHighlight() {
  const editor = $('editor'); if (!editor) return;
  const cs = getComputedStyle(editor);
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const offset = measureScrollTo(highlightRange.start) + paddingTop;
  editor.scrollTop = Math.max(0, offset - editor.clientHeight / 3);
  applyHighlights();
}

function stepHighlight(direction) {
  if (!highlightMatches.length) return;
  highlightIndex = (highlightIndex + direction + highlightMatches.length) % highlightMatches.length;
  highlightRange = highlightMatches[highlightIndex];
  $('highlightLabel').textContent = `${highlightIndex + 1} / ${highlightMatches.length}`;
  focusHighlight();
}

function clearHighlight() { setHighlight(''); }


$('editor').addEventListener('input', (event) => { cancelAnimationFrame(updateFrame); updateFrame = requestAnimationFrame(() => updateContent(event.target.value)); });
$('editor').addEventListener('scroll', applyHighlights);
$('documentTitle').addEventListener('input', (event) => { const document = activeDocument(); if (!document) return; document.title = event.target.value || '未命名文稿'; dirty = true; renderDocuments(); });
$('newDocBtn').addEventListener('click', () => newDocument()); $('closeDocBtn').addEventListener('click', closeDocument); $('importBtn').addEventListener('click', () => $('fileInput').click()); $('copyBtn').addEventListener('click', () => copyText($('editor').value, '全文已复制')); $('clearBtn').addEventListener('click', () => { if (!$('editor').value || window.confirm('确定清空当前文稿吗？')) { $('editor').value = ''; updateContent(''); } }); $('sampleBtn').addEventListener('click', () => { $('editor').value = SAMPLE; updateContent(SAMPLE); }); $('exportBtn').addEventListener('click', exportDocument); $('copySummaryBtn').addEventListener('click', copySummary);   $('highlightPrev').addEventListener('click', () => stepHighlight(-1));
  $('highlightNext').addEventListener('click', () => stepHighlight(1));
  $('highlightClear').addEventListener('click', clearHighlight);
$('viewToggle').addEventListener('click', () => { detailed = !detailed; renderStats(activeDocument()); });
document.querySelectorAll('.wordcloud-tabs .tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.wordcloud-tabs .tab').forEach((other) => { other.classList.remove('is-active'); other.setAttribute('aria-selected', 'false'); });
  tab.classList.add('is-active'); tab.setAttribute('aria-selected', 'true');
  wordRange = Number(tab.dataset.range) || 0;
  renderWordCloud(activeDocument());
})); $('fileInput').addEventListener('change', (event) => { importFile(event.target.files[0]); event.target.value = ''; });
$('shortcutBtn').addEventListener('click', () => { $('shortcutModal').hidden = false; $('modalClose').focus(); }); $('modalClose').addEventListener('click', () => { $('shortcutModal').hidden = true; }); $('shortcutModal').addEventListener('click', (event) => { if (event.target === $('shortcutModal')) $('shortcutModal').hidden = true; });
$('themeBtn').addEventListener('click', () => { const root = document.documentElement; const next = root.dataset.theme === 'dark' ? 'light' : 'dark'; root.dataset.theme = next; $('themeBtn').textContent = next === 'dark' ? '☾' : '☼'; });
window.addEventListener('keydown', (event) => { const mod = event.metaKey || event.ctrlKey; if (!mod) { if (event.key === 'Escape') $('shortcutModal').hidden = true; return; } if (event.key.toLowerCase() === 'n') { event.preventDefault(); newDocument(); } if (event.key.toLowerCase() === 'o') { event.preventDefault(); $('fileInput').click(); } if (event.key.toLowerCase() === 's') { event.preventDefault(); exportDocument(); } if (event.shiftKey && event.key.toLowerCase() === 'c') { event.preventDefault(); copySummary(); } });
window.addEventListener('beforeunload', (event) => { if (dirty && $('editor').value) { event.preventDefault(); event.returnValue = ''; } });

const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
$('themeBtn').textContent = prefersDark ? '☾' : '☼';
newDocument();

const editorResizeObserver = ('ResizeObserver' in window) ? new ResizeObserver(() => { setupMirror(); if (mirrorTextNode) mirrorTextNode.data = $('editor').value; applyHighlights(); }) : null;
if (editorResizeObserver) editorResizeObserver.observe($('editor'));
