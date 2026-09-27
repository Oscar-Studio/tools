// =====================================================
// 图片压缩器 —— UI 层
// 尺寸/体积/格式/命名的判定都在 image-core.js（已过 Node 测试），
// 这里负责 canvas 解码编码、DOM 渲染与文件读写。
// 全部本地完成：File → createImageBitmap → canvas → toBlob，不发任何请求。
// =====================================================
import {
  calcSavings,
  clampQuality,
  exceedsCanvasLimit,
  extForType,
  fitDimensions,
  formatBytes,
  isAcceptedImage,
  outputFilename,
  parseDimensionInput,
  qualityApplies,
  resolveOutputFormat,
  summarize,
} from './image-core.js';

const $ = (id) => document.getElementById(id);
const dom = {
  fileInput: $('fileInput'),
  dropzone: $('dropzone'),
  dropEmpty: $('dropEmpty'),
  formatRow: $('formatRow'),
  formatHint: $('formatHint'),
  qualitySlider: $('qualitySlider'),
  qualityVal: $('qualityVal'),
  maxWidth: $('maxWidth'),
  maxWidthVal: $('maxWidthVal'),
  recompressBtn: $('recompressBtn'),
  downloadAllBtn: $('downloadAllBtn'),
  clearBtn: $('clearBtn'),
  summary: $('summary'),
  sumCount: $('sumCount'),
  sumOriginal: $('sumOriginal'),
  sumCompressed: $('sumCompressed'),
  sumSaved: $('sumSaved'),
  resultsPanel: $('resultsPanel'),
  resultList: $('resultList'),
  globalError: $('globalError'),
  themeBtn: $('themeBtn'),
  toast: $('toast'),
};

const state = {
  format: 'image/webp',
  quality: 0.8,
  items: [],          // { id, file, name, status, error, previewUrl, ... }
  busy: false,
  seq: 0,
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
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 1800);
}

function showError(msg) {
  if (!msg) {
    dom.globalError.hidden = true;
    dom.globalError.textContent = '';
    return;
  }
  dom.globalError.textContent = msg;
  dom.globalError.hidden = false;
}

// ============ 能力探测 ============
function detectCapabilities() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const caps = {};
  for (const type of ['image/jpeg', 'image/webp', 'image/avif', 'image/png']) {
    try {
      caps[type] = canvas.toDataURL(type).startsWith(`data:${type}`);
    } catch (_) {
      caps[type] = false;
    }
  }
  return caps;
}
const CAPS = detectCapabilities();

// ============ 解码 ============
async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation: from-image 会按 EXIF 自动转正，省得竖拍照片躺倒
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) {
      try { return await createImageBitmap(file); } catch (_) {}
    }
  }
  // 老浏览器回退：<img> + objectURL
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('浏览器无法解码该图片')); };
    img.src = url;
  });
}

// ============ 编码 ============
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('编码失败，可能是图片过大'))),
      type,
      quality
    );
  });
}

async function compressItem(item) {
  item.status = 'working';
  item.error = null;
  item.previewUrl = null;
  render();

  let source = null;
  try {
    source = await decode(item.file);
    const sw = source.width;
    const sh = source.height;
    const dim = parseDimensionInput(dom.maxWidth.value);
    const fitted = fitDimensions(sw, sh, dim?.width ?? null, dim?.height ?? null);

    if (exceedsCanvasLimit(fitted.width, fitted.height)) {
      item.status = 'error';
      item.error = `缩放后仍有 ${fitted.width}×${fitted.height}，超出画布上限，请在「最大尺寸」里限制一下`;
      item.originalWidth = sw;
      item.originalHeight = sh;
      return;
    }

    const { type, fellBack } = resolveOutputFormat(state.format, CAPS);
    const canvas = document.createElement('canvas');
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布上下文');
    // JPEG 没有背景色，透明区域会变黑，先铺白
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, fitted.width, fitted.height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, fitted.width, fitted.height);

    const blob = await canvasToBlob(canvas, type, clampQuality(state.quality));
    // 释放画布显存
    canvas.width = 0;
    canvas.height = 0;

    item.blob = blob;
    item.outputType = type;
    item.fellBack = fellBack;
    item.width = fitted.width;
    item.height = fitted.height;
    item.originalWidth = sw;
    item.originalHeight = sh;
    item.originalBytes = item.file.size;
    item.compressedBytes = blob.size;
    item.filename = outputFilename(item.name, type, fitted.width, fitted.height, sw, sh);
    item.previewUrl = URL.createObjectURL(blob);
    item.status = 'done';
  } catch (err) {
    item.status = 'error';
    item.error = err && err.message ? err.message : '处理失败';
  } finally {
    if (source && typeof source.close === 'function') source.close();
  }
}

// 逐张串行处理：并发解码大图容易把内存打爆
async function processAll(items) {
  state.busy = true;
  syncButtons();
  for (const item of items) {
    await compressItem(item);
  }
  state.busy = false;
  syncButtons();
  render();
}

// ============ 渲染 ============
function syncButtons() {
  const has = state.items.length > 0;
  const done = state.items.filter((i) => i.status === 'done').length;
  dom.recompressBtn.disabled = state.busy || !has;
  dom.clearBtn.disabled = state.busy || !has;
  dom.downloadAllBtn.disabled = state.busy || done === 0;
}

function badgeFor(item) {
  if (item.status === 'working') return '<span class="badge is-neutral">处理中…</span>';
  if (item.status === 'error') return '<span class="badge is-error">失败</span>';
  const s = calcSavings(item.originalBytes, item.compressedBytes);
  if (s.grew) {
    return `<span class="badge is-warn">反而大了 ${formatBytes(Math.abs(s.savedBytes))}</span>`;
  }
  if (s.savedPercent >= 0.05) return `<span class="badge">省 ${s.savedPercent}%</span>`;
  return '<span class="badge is-neutral">几乎没变化</span>';
}

function render() {
  // 汇总
  const done = state.items.filter((i) => i.status === 'done');
  if (done.length) {
    const s = summarize(done);
    dom.summary.hidden = false;
    dom.sumCount.textContent = String(s.count);
    dom.sumOriginal.textContent = formatBytes(s.originalBytes);
    dom.sumCompressed.textContent = formatBytes(s.compressedBytes);
    dom.sumSaved.textContent = s.grew
      ? `变大 ${Math.abs(s.savedPercent)}%`
      : `${s.savedPercent}%`;
    dom.sumSaved.className = 'summary-value ' + (s.grew ? 'is-warn' : 'is-green');
  } else {
    dom.summary.hidden = true;
  }

  // 列表
  if (!state.items.length) {
    dom.resultsPanel.hidden = true;
    dom.dropzone.classList.remove('has-files');
    syncButtons();
    return;
  }
  dom.resultsPanel.hidden = false;
  dom.dropzone.classList.add('has-files');
  dom.dropEmpty.innerHTML = state.items.length === 1
    ? '<span class="drop-title">已选择 1 张图片</span><span class="drop-hint">继续拖入可追加，或点击重新选择</span>'
    : `<span class="drop-title">已选择 ${state.items.length} 张图片</span><span class="drop-hint">继续拖入可追加，或点击重新选择</span>`;

  dom.resultList.innerHTML = state.items.map((item) => {
    const thumb = item.previewUrl
      ? `<img src="${item.previewUrl}" alt="">`
      : `<span class="result-err" style="font-size:11px">${item.status === 'working' ? '…' : '无预览'}</span>`;

    let stats;
    if (item.status === 'done') {
      const dimChanged = item.width !== item.originalWidth || item.height !== item.originalHeight;
      stats =
        `<span><b>${formatBytes(item.originalBytes)}</b> → <b>${formatBytes(item.compressedBytes)}</b></span>` +
        `<span>${item.originalWidth}×${item.originalHeight}` +
        (dimChanged ? ` → <b>${item.width}×${item.height}</b>` : '') +
        '</span>' +
        `<span>${extForType(item.outputType).toUpperCase()}` +
        (item.fellBack ? '（已回退）' : '') +
        (qualityApplies(item.outputType) ? ` · 质量 ${Math.round(state.quality * 100)}%` : '') +
        '</span>' +
        badgeFor(item);
    } else if (item.status === 'error') {
      stats = `<span class="result-err">${escapeText(item.error || '处理失败')}</span>`;
    } else {
      stats = '<span>处理中…</span>';
    }

    return (
      '<div class="result-item">' +
        `<div class="result-thumb">${thumb}</div>` +
        '<div class="result-info">' +
          `<div class="result-name" title="${escapeText(item.name)}">${escapeText(item.name)}</div>` +
          `<div class="result-stats">${stats}</div>` +
        '</div>' +
        '<div class="result-actions">' +
          (item.status === 'done'
            ? `<button class="dl-btn" data-download="${item.id}" type="button">⬇ 下载</button>`
            : '') +
        '</div>' +
      '</div>'
    );
  }).join('');

  syncButtons();
}

function escapeText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============ 下载 ============
function downloadItem(item) {
  if (item.status !== 'done' || !item.blob) return;
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 会让部分浏览器下载失败，延后释放
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

dom.resultList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-download]');
  if (!btn) return;
  const item = state.items.find((i) => String(i.id) === btn.dataset.download);
  if (item) downloadItem(item);
});

dom.downloadAllBtn.addEventListener('click', async () => {
  const done = state.items.filter((i) => i.status === 'done');
  if (!done.length) return;
  for (let i = 0; i < done.length; i++) {
    downloadItem(done[i]);
    // 连续触发下载，部分浏览器会拦，间隔一下
    if (i < done.length - 1) await new Promise((r) => setTimeout(r, 220));
  }
  toast(`已下载 ${done.length} 张`);
});

dom.recompressBtn.addEventListener('click', () => {
  if (!state.items.length || state.busy) return;
  processAll(state.items);
});

dom.clearBtn.addEventListener('click', () => {
  if (state.busy) return;
  for (const item of state.items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
  state.items = [];
  dom.fileInput.value = '';
  showError('');
  render();
  toast('已清空');
});

// ============ 选项 ============
dom.formatRow.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-format]');
  if (!btn) return;
  state.format = btn.dataset.format;
  for (const b of dom.formatRow.querySelectorAll('.seg')) {
    const on = b === btn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  }
  updateFormatHint();
});

function updateFormatHint() {
  const { fellBack } = resolveOutputFormat(state.format, CAPS);
  const parts = [];
  if (fellBack) {
    parts.push(`当前浏览器不支持 ${extForType(state.format).toUpperCase()}，已自动回退到 ${extForType(resolveOutputFormat(state.format, CAPS).type).toUpperCase()}`);
  }
  if (!qualityApplies(state.format)) {
    parts.push('PNG 是无损格式，质量滑块对它无效（想变小请限制尺寸或改用 WebP）');
  }
  dom.formatHint.textContent = parts.join('；') || 'WebP 压缩率通常优于 JPEG。';
  dom.formatHint.classList.toggle('is-warn', !qualityApplies(state.format) || fellBack);
  dom.qualitySlider.disabled = !qualityApplies(state.format);
  dom.qualitySlider.style.opacity = dom.qualitySlider.disabled ? '0.45' : '1';
}

dom.qualitySlider.addEventListener('input', () => {
  state.quality = clampQuality(Number(dom.qualitySlider.value) / 100);
  dom.qualityVal.textContent = `${dom.qualitySlider.value}%`;
});

dom.maxWidth.addEventListener('input', () => {
  const raw = dom.maxWidth.value.trim();
  if (!raw) {
    dom.maxWidth.classList.remove('is-error');
    dom.maxWidthVal.textContent = '不限';
    return;
  }
  const dim = parseDimensionInput(raw);
  dom.maxWidth.classList.toggle('is-error', dim === null);
  if (dim === null) {
    dom.maxWidthVal.textContent = '格式无效';
  } else if (dim.height) {
    dom.maxWidthVal.textContent = `≤ ${dim.width}×${dim.height}`;
  } else {
    dom.maxWidthVal.textContent = `宽度 ≤ ${dim.width}`;
  }
});

// ============ 收文件 ============
async function acceptFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const accepted = files.filter(isAcceptedImage);
  const rejected = files.length - accepted.length;

  if (rejected) {
    showError(`已跳过 ${rejected} 个不支持的文件（HEIC 等格式浏览器无法解码，请先转成 JPEG 或 PNG）`);
  } else {
    showError('');
  }
  if (!accepted.length) return;

  for (const file of accepted) {
    state.items.push({
      id: ++state.seq,
      file,
      name: file.name || `image-${state.seq}`,
      status: 'pending',
      error: null,
      previewUrl: null,
      blob: null,
    });
  }
  render();
  await processAll(state.items);
}

dom.fileInput.addEventListener('change', () => {
  acceptFiles(dom.fileInput.files);
  // 允许重复选同一个文件
  dom.fileInput.value = '';
});

// 拖拽
['dragenter', 'dragover'].forEach((evt) => {
  dom.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dom.dropzone.classList.add('is-drag');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dom.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    if (evt === 'dragleave' && dom.dropzone.contains(e.relatedTarget)) return;
    dom.dropzone.classList.remove('is-drag');
  });
});
dom.dropzone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  if (dt && dt.files && dt.files.length) acceptFiles(dt.files);
});
// 避免拖到页面别处时浏览器直接打开图片
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// ============ 启动 ============
updateFormatHint();
dom.qualityVal.textContent = `${dom.qualitySlider.value}%`;
render();
