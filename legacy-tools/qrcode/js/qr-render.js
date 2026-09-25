// 二维码渲染核心：基于 qrcode 库（prebuild 打包为 ESM，见 scripts/copy-qrcode.mjs）
// 负责：QR 矩阵生成 + canvas/SVG 自定义渲染（方点/圆点、纯色/渐变、Logo 嵌入）。
// 不负责：UI 绑定、下载触发、容错级别与 Logo 联动（由 app.js 处理）。
//
// qrcode 用动态 import + 缓存：浏览器从站点根 /vendor/qrcode/qrcode.js 加载，
// Node 测试时不会被顶层静态 import 阻断（只要不调用 createMatrix 就不加载）。
let _QRCodePromise = null;
function loadQRCode() {
  if (!_QRCodePromise) {
    _QRCodePromise = import('/vendor/qrcode/qrcode.js').then((m) => m.default);
  }
  return _QRCodePromise;
}

/** 渐变方向（度）转成画布/svg 上的线性渐变两端点（用户坐标）。
 *  4 个预设方向：从画布边到对边（不是中心对称），
 *  这样渐变在画布上完全铺满，颜色过渡范围最大。
 *  0°=水平向右，90°=垂直向下，45°=左上→右下，135°=右上→左下。
 */
export function gradientEndpoints(deg, total) {
  const h = total / 2;
  switch (deg) {
    case 0:   return { x1: 0,    y1: h,    x2: total, y2: h    };
    case 45:  return { x1: 0,    y1: 0,    x2: total, y2: total };
    case 90:  return { x1: h,    y1: 0,    x2: h,     y2: total };
    case 135: return { x1: total, y1: 0,    x2: 0,     y2: total };
    default: {
      // 通用回退：从画布中心向方向延伸 ± half-diagonal
      const rad = (deg * Math.PI) / 180;
      const cx = total / 2, cy = total / 2;
      const len = Math.hypot(total, total) / 2;
      const dx = Math.cos(rad) * len;
      const dy = Math.sin(rad) * len;
      return { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy };
    }
  }
}

/**
 * 生成 QR 矩阵（不渲染）。
 * @param {string} text - 待编码文本
 * @param {'L'|'M'|'Q'|'H'} errorCorrectionLevel
 * @returns {Promise<{modules:{size:number,data:Uint8Array}}>} 矩阵；data 是 Uint8Array，1=深/0=浅
 */
export async function createMatrix(text, errorCorrectionLevel = 'M') {
  const QRCode = await loadQRCode();
  return QRCode.create(text, { errorCorrectionLevel });
}

/**
 * 把 Logo 图片渲染到 canvas 中央（白底圆角 + 内嵌）。
 * canvas 已是 QR 绘制完成的状态。
 */
function paintLogoToCanvas(ctx, size, logo) {
  const ratio = logo.size ?? 0.22;
  const logoSize = size * ratio;
  const x = (size - logoSize) / 2;
  const y = (size - logoSize) / 2;
  const radius = logoSize * 0.12;
  const pad = logoSize * 0.08;

  // 白底
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, logoSize, logoSize, radius);
  } else {
    ctx.rect(x, y, logoSize, logoSize);
  }
  ctx.fill();

  // 内嵌图片
  if (logo.image) {
    ctx.drawImage(logo.image, x + pad, y + pad, logoSize - 2 * pad, logoSize - 2 * pad);
  }
}

// QR finder pattern 是 7×7 模块的固定结构（QR 码三角的定位图案）。
// 扫码器依赖这个结构定位和对齐，所以必须保留"外圈 + 中心点"的形式，
// 只是形状可以圆角化（品牌 QR 经典做法）。dot 模式下用圆角方块+中心圆画。
const FINDER_SIZE = 7;
const FINDER_POSITIONS = [
  { fx: 0, fy: 0 },
  { fx: 0, fy: -7 },
  { fx: -7, fy: 0 },
];
function isInAnyFinder(x, y, mSize) {
  // 右上、左下位置根据 mSize 计算
  return (
    (x < FINDER_SIZE && y < FINDER_SIZE) ||
    (x < FINDER_SIZE && y >= mSize - FINDER_SIZE) ||
    (x >= mSize - FINDER_SIZE && y < FINDER_SIZE)
  );
}

/** 用圆角矩形 path 填充（兼容没有 roundRect 的旧浏览器） */
function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // 退化实现：四个 1/4 圆 + 直线
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  ctx.fill();
}

/**
 * 在 dot 模式下用"圆环 + 中心圆点"画三个 finder pattern。
 * 圆环用 stroke 实现（lineWidth = cell）让环宽 1 module，
 * 中心实心圆与 dot 模块视觉统一。扫码器仍能识别这种结构。
 */
function paintFinderPatternsDot(ctx, opts) {
  const { cell, offset, fgStyle, mSize } = opts;
  const half = (FINDER_SIZE * cell) / 2;
  // stroke 半径 = (FINDER_SIZE-1)/2 * cell = 3 cell，lineWidth = cell
  // → 环外边界半径 3.5 cell，内边界 2.5 cell，刚好填满 7×7 区域
  const ringRadius = 3 * cell;
  const centerRadius = 1.5 * cell;

  const positions = [
    { x: 0, y: 0 },
    { x: 0, y: mSize - FINDER_SIZE },
    { x: mSize - FINDER_SIZE, y: 0 },
  ];

  ctx.strokeStyle = fgStyle;
  ctx.fillStyle = fgStyle;
  ctx.lineWidth = cell;
  for (const { x: fx, y: fy } of positions) {
    const px = offset + fx * cell + half;
    const py = offset + fy * cell + half;
    // 圆环（stroke 居中 = 1 cell 线宽 = 1 module 厚度）
    ctx.beginPath();
    ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    // 中心实心圆
    ctx.beginPath();
    ctx.arc(px, py, centerRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 把 QR 矩阵画到 canvas 上（含形状/渐变/Logo）。
 * @param {HTMLCanvasElement} canvas
 * @param {{modules:{size:number,data:Uint8Array}}} matrix
 * @param {{
 *   fg:string, bg:string,
 *   gradient?: { enabled:boolean, color:string, direction:0|45|90|135 },
 *   shape: 'square'|'dot',
 *   size: number,
 *   logo?: { dataUrl:string, image?:HTMLImageElement, size?:number },
 *   margin?: number,
 * }} style
 */
export function renderToCanvas(canvas, matrix, style) {
  const { fg, bg, gradient, shape, size, logo, margin = 2 } = style;
  const m = matrix.modules;
  const ctx = canvas.getContext('2d');
  const out = size;
  const cell = out / (m.size + 2 * margin);
  const offset = margin * cell;

  canvas.width = out;
  canvas.height = out;

  // 背景
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out, out);

  // 前景 fillStyle：纯色 or 渐变
  let fgStyle = fg;
  if (gradient && gradient.enabled) {
    const { x1, y1, x2, y2 } = gradientEndpoints(gradient.direction, out);
    fgStyle = ctx.createLinearGradient(x1, y1, x2, y2);
    fgStyle.addColorStop(0, fg);
    fgStyle.addColorStop(1, gradient.color);
  }
  ctx.fillStyle = fgStyle;

  // 逐模块绘制
  const data = m.data;
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      // dot 模式：跳过 finder pattern 区域，统一在最后画圆角化版本
      if (shape === 'dot' && isInAnyFinder(x, y, m.size)) continue;
      if (!data[y * m.size + x]) continue;
      const px = offset + x * cell;
      const py = offset + y * cell;
      if (shape === 'dot') {
        // 圆点：半径略小于 cell/2，留小缝隙避免连成块
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, cell * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 方点：+0.5 抗锯齿，保证模块之间无白缝
        ctx.fillRect(px, py, cell + 0.5, cell + 0.5);
      }
    }
  }

  // dot 模式：在 finder 区域画圆角方块 + 中心圆（保留可扫结构 + 视觉统一）
  if (shape === 'dot') {
    paintFinderPatternsDot(ctx, { cell, offset, fgStyle, bg, mSize: m.size });
  }

  // Logo 在最上层
  if (logo && logo.dataUrl) {
    paintLogoToCanvas(ctx, out, logo);
  }
}

/**
 * 生成 SVG 字符串（同 canvas 视觉一致）。
 * 用于下载 SVG 或在 SVG 容器中展示。
 */
export function renderToSVG(matrix, style) {
  const { fg, bg, gradient, shape, size, logo, margin = 2 } = style;
  const m = matrix.modules;
  const total = size;
  const cell = total / (m.size + 2 * margin);
  const offset = margin * cell;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" shape-rendering="geometricPrecision">`
  );
  parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`);

  const useGradient = !!(gradient && gradient.enabled);
  if (useGradient) {
    const { x1, y1, x2, y2 } = gradientEndpoints(gradient.direction, total);
    parts.push(
      `<defs><linearGradient id="qrfg" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${fg}"/><stop offset="1" stop-color="${gradient.color}"/></linearGradient></defs>`
    );
    parts.push(`<g fill="url(#qrfg)">`);
  } else {
    parts.push(`<g fill="${fg}">`);
  }

  const data = m.data;
  if (shape === 'dot') {
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (isInAnyFinder(x, y, m.size)) continue;
        if (!data[y * m.size + x]) continue;
        const cx = offset + x * cell + cell / 2;
        const cy = offset + y * cell + cell / 2;
        parts.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(cell * 0.42).toFixed(2)}"/>`);
      }
    }
  } else {
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (!data[y * m.size + x]) continue;
        parts.push(
          `<rect x="${(offset + x * cell).toFixed(2)}" y="${(offset + y * cell).toFixed(2)}" width="${(cell + 0.5).toFixed(2)}" height="${(cell + 0.5).toFixed(2)}"/>`
        );
      }
    }
  }
  parts.push(`</g>`);

  // dot 模式：在 finder 区域画圆环 + 中心圆（保留可扫结构）
  if (shape === 'dot') {
    const half = (FINDER_SIZE * cell) / 2;
    const ringR = 3 * cell;
    const centerR = 1.5 * cell;
    const fillRef = useGradient ? 'url(#qrfg)' : fg;
    const positions = [
      { fx: 0, fy: 0 },
      { fx: 0, fy: m.size - FINDER_SIZE },
      { fx: m.size - FINDER_SIZE, fy: 0 },
    ];
    for (const { fx, fy } of positions) {
      const cx = offset + fx * cell + half;
      const cy = offset + fy * cell + half;
      parts.push(
        `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${ringR.toFixed(2)}" fill="none" stroke="${fillRef}" stroke-width="${cell.toFixed(2)}"/>` +
        `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${centerR.toFixed(2)}" fill="${fillRef}"/>`
      );
    }
  }

  if (logo && logo.dataUrl) {
    const ratio = logo.size ?? 0.22;
    const logoSize = total * ratio;
    const x = (total - logoSize) / 2;
    const y = (total - logoSize) / 2;
    const pad = logoSize * 0.08;
    const radius = logoSize * 0.12;
    parts.push(
      `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${logoSize.toFixed(2)}" height="${logoSize.toFixed(2)}" rx="${radius.toFixed(2)}" fill="#ffffff"/>`
    );
    parts.push(
      `<image href="${logo.dataUrl}" x="${(x + pad).toFixed(2)}" y="${(y + pad).toFixed(2)}" width="${(logoSize - 2 * pad).toFixed(2)}" height="${(logoSize - 2 * pad).toFixed(2)}"/>`
    );
  }

  parts.push(`</svg>`);
  return parts.join('');
}

/**
 * 把上传的 File 转成可用的 Logo 对象（含已加载的 HTMLImageElement）。
 */
export function prepareLogoImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () =>
        resolve({
          dataUrl: reader.result,
          image: img,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** 触发浏览器下载一个 Blob */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 触发浏览器下载一段文本（SVG/XML/JSON 等） */
export function downloadString(text, filename, mime = 'image/svg+xml') {
  const blob = new Blob([text], { type: mime });
  downloadBlob(blob, filename);
}

/** Canvas → Blob（异步） */
export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
      type,
      quality
    );
  });
}