// 二维码生成器主控脚本：DOM 绑定 + 实时预览 + 容错/Logo 联动 + 下载触发。
// 渲染细节（矩阵生成、canvas/SVG 绘制）都在 qr-render.js 里。
import {
  createMatrix,
  renderToCanvas,
  renderToSVG,
  prepareLogoImage,
  downloadBlob,
  downloadString,
  canvasToBlob,
} from './qr-render.js';

// ============ 状态 ============
const state = {
  text: '',
  ecl: 'M',              // 'L' | 'M' | 'Q' | 'H'
  fg: '#101418',
  bg: '#ffffff',
  shape: 'square',       // 'square' | 'dot'
  gradient: {
    enabled: false,
    color: '#3a3f4b',
    direction: 45,
  },
  size: 512,             // 导出尺寸（px）
  previewSize: 280,      // 预览固定 280（节省重渲）
  logo: null,            // { dataUrl, image, naturalWidth, naturalHeight } | null
  hasLogo: false,        // 上传后强制容错到 H
  matrix: null,          // 缓存的 QR 矩阵（文本+ECL 变化才重建）
  matrixKey: '',         // 用于判断是否需要重算矩阵
};

let renderTimer = null;
function scheduleRender(delay = 150) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { render(); }, delay);
}

// ============ DOM 引用 ============
const $ = (id) => document.getElementById(id);
const dom = {
  textInput: $('textInput'),
  sampleBtn: $('sampleBtn'),
  clearBtn: $('clearBtn'),
  segEcl: document.querySelectorAll('[data-ecl]'),
  segShape: document.querySelectorAll('[data-shape]'),
  segDir: document.querySelectorAll('[data-dir]'),
  fgColor: $('fgColor'),
  fgHex: $('fgHex'),
  bgColor: $('bgColor'),
  bgHex: $('bgHex'),
  gradEnabled: $('gradEnabled'),
  gradBody: $('gradBody'),
  gradColor: $('gradColor'),
  gradHex: $('gradHex'),
  sizeSlider: $('sizeSlider'),
  sizeVal: $('sizeVal'),
  canvas: $('qrCanvas'),
  dlPng: $('dlPng'),
  dlSvg: $('dlSvg'),
  logoInput: $('logoInput'),
  logoDrop: $('logoDrop'),
  logoEmpty: $('logoEmpty'),
  logoPreview: $('logoPreview'),
  logoClear: $('logoClear'),
  eclHint: $('eclHint'),
  themeBtn: $('themeBtn'),
};

// ============ 主题 ============
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
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

// ============ 渲染 ============
async function getMatrix() {
  const key = state.text + '\0' + state.ecl;
  if (!state.matrix || state.matrixKey !== key) {
    try {
      state.matrix = await createMatrix(state.text, state.ecl);
      state.matrixKey = key;
    } catch (err) {
      // 容错 H + 文本过长可能失败；退回到 M
      state.ecl = 'M';
      state.matrix = await createMatrix(state.text, 'M');
      state.matrixKey = state.text + '\0M';
    }
  }
  return state.matrix;
}

function currentStyle(overrides = {}) {
  return {
    fg: state.fg,
    bg: state.bg,
    gradient: { ...state.gradient },
    shape: state.shape,
    size: state.previewSize,
    logo: state.hasLogo ? { dataUrl: state.logo?.dataUrl, image: state.logo?.image, size: 0.22 } : null,
    margin: 2,
    ...overrides,
  };
}

async function render() {
  if (!state.text) {
    // 空文本：清空 canvas（不报错）
    const ctx = dom.canvas.getContext('2d');
    ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
    return;
  }
  const matrix = await getMatrix();
  renderToCanvas(dom.canvas, matrix, currentStyle());
}

async function downloadPng() {
  if (!state.text) return;
  const matrix = await getMatrix();
  // 用导出尺寸单独渲染到内存 canvas
  const off = document.createElement('canvas');
  renderToCanvas(off, matrix, currentStyle({ size: state.size }));
  try {
    const blob = await canvasToBlob(off, 'image/png');
    downloadBlob(blob, `qrcode-${Date.now()}.png`);
  } catch (err) {
    console.error('PNG export failed:', err);
  }
}

function downloadSvg() {
  if (!state.text) return;
  getMatrix().then((matrix) => {
    const svg = renderToSVG(matrix, currentStyle({ size: state.size }));
    downloadString(svg, `qrcode-${Date.now()}.svg`, 'image/svg+xml');
  });
}

// ============ 容错 + Logo 联动 ============
function applyEcl(value, opts = {}) {
  state.ecl = value;
  dom.segEcl.forEach((b) => {
    const active = b.dataset.ecl === value;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-checked', active ? 'true' : 'false');
    // 上传 Logo 后：禁用 L/M/Q
    const locked = state.hasLogo && value !== 'H' && !opts.allowAny;
    b.disabled = locked;
  });
  // 矩阵需要重建（因为 ECL 变了）
  state.matrix = null;
  scheduleRender(0);
}

function onLogoAdded() {
  state.hasLogo = true;
  dom.logoEmpty.hidden = true;
  dom.logoPreview.hidden = false;
  dom.logoClear.hidden = false;
  dom.logoPreview.src = state.logo.dataUrl;
  // 强制容错到 H
  applyEcl('H');
  dom.eclHint.textContent = '已为 Logo 提升到 H（30% 容错，保证可扫）';
}

function onLogoRemoved() {
  state.hasLogo = false;
  state.logo = null;
  dom.logoEmpty.hidden = false;
  dom.logoPreview.hidden = true;
  dom.logoPreview.removeAttribute('src');
  dom.logoClear.hidden = true;
  // 重置容错到默认 M，并允许用户再选 L/M/Q
  state.ecl = 'M';
  applyEcl('M', { allowAny: true });
  dom.eclHint.textContent = '默认 M；上传 Logo 后自动提升到 H（最高 30%）';
}

// ============ 事件绑定 ============

// 文本输入
dom.textInput.addEventListener('input', (e) => {
  state.text = e.target.value;
  // 文本变了 → 矩阵可能不同 → 清缓存
  state.matrix = null;
  scheduleRender();
});

// 示例 / 清空
dom.sampleBtn.addEventListener('click', () => {
  dom.textInput.value = 'https://oscarstudio.cn';
  state.text = dom.textInput.value;
  state.matrix = null;
  scheduleRender(0);
});
dom.clearBtn.addEventListener('click', () => {
  dom.textInput.value = '';
  state.text = '';
  state.matrix = null;
  render();
});

// 容错级别
dom.segEcl.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    applyEcl(btn.dataset.ecl);
  });
});

// 形状
dom.segShape.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.shape = btn.dataset.shape;
    dom.segShape.forEach((b) => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    scheduleRender(0);
  });
});

// 颜色
dom.fgColor.addEventListener('input', (e) => {
  state.fg = e.target.value;
  dom.fgHex.textContent = state.fg;
  scheduleRender(0);
});
dom.bgColor.addEventListener('input', (e) => {
  state.bg = e.target.value;
  dom.bgHex.textContent = state.bg;
  scheduleRender(0);
});

// 渐变开关
dom.gradEnabled.addEventListener('change', (e) => {
  state.gradient.enabled = e.target.checked;
  dom.gradBody.hidden = !e.target.checked;
  scheduleRender(0);
});
dom.gradColor.addEventListener('input', (e) => {
  state.gradient.color = e.target.value;
  dom.gradHex.textContent = state.gradient.color;
  scheduleRender(0);
});
dom.segDir.forEach((btn) => {
  btn.addEventListener('click', () => {
    const dir = parseInt(btn.dataset.dir, 10);
    state.gradient.direction = dir;
    dom.segDir.forEach((b) => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    scheduleRender(0);
  });
});

// 尺寸
dom.sizeSlider.addEventListener('input', (e) => {
  state.size = parseInt(e.target.value, 10);
  dom.sizeVal.textContent = `${state.size} px`;
});
// 尺寸只影响下载，不影响预览，所以 input 时不重渲

// 下载
dom.dlPng.addEventListener('click', downloadPng);
dom.dlSvg.addEventListener('click', downloadSvg);

// Logo 上传（点击 + 拖拽）
async function handleLogoFile(file) {
  if (!file) return;
  try {
    const logo = await prepareLogoImage(file);
    state.logo = logo;
    onLogoAdded();
  } catch (err) {
    console.error('logo load failed:', err);
  }
}
dom.logoInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  handleLogoFile(file);
  // 清空 value，允许重复上传同一文件
  e.target.value = '';
});
dom.logoDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.logoDrop.classList.add('is-drag');
});
dom.logoDrop.addEventListener('dragleave', () => {
  dom.logoDrop.classList.remove('is-drag');
});
dom.logoDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.logoDrop.classList.remove('is-drag');
  const file = e.dataTransfer?.files?.[0];
  handleLogoFile(file);
});
// 让 label 点击不触发两次（label for= 已经够，但保留 keyboard 支持）
dom.logoDrop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    dom.logoInput.click();
  }
});
dom.logoClear.addEventListener('click', onLogoRemoved);

// ============ 启动 ============
// 初始空文本 → canvas 留空，不报错