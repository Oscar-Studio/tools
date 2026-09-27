// =====================================================
// 图片压缩器 —— 纯逻辑层
// 本文件不触碰任何 DOM / canvas，Node 测试直接 import。
// 真正的编码在 app.js 里用 canvas.toBlob 完成（Node 无法测）；
// 尺寸计算、体积统计、格式回退、命名等判定逻辑都收在这里。
// =====================================================

/** 体积单位（1024 进制） */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * 人类可读体积。0 → "0 B"；1023 → "1023 B"；1024 → "1 KB"；1536 → "1.5 KB"。
 * 单数不显示小数，多于一位小数时才保留 1 位。
 */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  let i = 0;
  let v = n;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  if (i === 0) return `${Math.round(v)} B`;
  const rounded = Math.round(v * 10) / 10;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} ${UNITS[i]}`;
}

/**
 * 解析「最大宽度」输入。支持 "800" / "800x600" / "800×600" / 带空格。
 * 返回 { width, height }（height 可为 null = 不限制）；非法输入返回 null。
 * 0 与负数视为未设置（null），而不是非法。
 */
export function parseDimensionInput(raw) {
  const str = String(raw ?? '').trim();
  if (!str) return null;

  const parts = str.split(/[x×*]/i).map((s) => s.trim());
  if (parts.length > 2) return null;

  const toNum = (s) => {
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const w = toNum(parts[0]);
  if (w === null) return null;
  const h = parts.length === 2 ? toNum(parts[1]) : null;
  if (parts.length === 2 && h === null) return null;

  return { width: w > 0 ? w : null, height: h !== null && h > 0 ? h : null };
}

/**
 * 按上限等比缩放。**只缩小不放大**——放大只会让体积和耗时一起变差。
 * maxW / maxH 为 null 或 0 表示该方向不限制。
 * 返回 { width, height, changed, scale }
 */
export function fitDimensions(width, height, maxW = null, maxH = null) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));

  const limitW = Number(maxW) > 0 ? Number(maxW) : null;
  const limitH = Number(maxH) > 0 ? Number(maxH) : null;
  if (limitW === null && limitH === null) {
    return { width: w, height: h, changed: false, scale: 1 };
  }

  const ratios = [];
  if (limitW !== null) ratios.push(limitW / w);
  if (limitH !== null) ratios.push(limitH / h);
  const scale = Math.min(1, ...ratios);

  if (scale >= 1) return { width: w, height: h, changed: false, scale: 1 };

  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    changed: true,
    scale,
  };
}

/** 质量滑块取值：夹到 0.05~1，保留两位小数 */
export function clampQuality(q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return 0.8;
  return Math.round(Math.min(1, Math.max(0.05, n)) * 100) / 100;
}

/** PNG 无损，quality 参数对它无效，界面需要据此提示用户 */
export function qualityApplies(type) {
  return type !== 'image/png';
}

/**
 * 格式回退：请求的格式浏览器不支持时按 有损优先 逐级回退。
 * capabilities 形如 { jpeg: true, webp: false }。
 * 返回 { type, fellBack }，fellBack = 「你点的格式」与「实际拿到的格式」不一致。
 */
export function resolveOutputFormat(requested, capabilities = {}) {
  const order = ['image/jpeg', 'image/webp', 'image/png'];
  // 不认识的请求归一到 jpeg
  const want = order.includes(requested) ? requested : 'image/jpeg';
  if (capabilities[want]) return { type: want, fellBack: want !== requested };
  for (const t of order) {
    if (capabilities[t]) return { type: t, fellBack: true };
  }
  // 能力未知时保守退回 png（所有浏览器都支持）
  return { type: 'image/png', fellBack: true };
}

const EXT = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/png': 'png',
  'image/avif': 'avif',
};

/** MIME → 扩展名，未知类型回退 .png */
export function extForType(type) {
  return EXT[type] || 'png';
}

/**
 * 去掉扩展名。点在下标 0 说明整个名字就是点开头的（如 .gitignore），
 * 那不是扩展名，不能剥，否则主名会被削成空串。
 */
function stripExtension(name) {
  const i = name.lastIndexOf('.');
  return i <= 0 ? name : name.slice(0, i);
}

/**
 * 输出文件名：photo.png + webp + 800x600 → photo-800x600.webp
 * 保留原扩展名前的主名，清掉文件系统不友好的字符。
 * 仅换格式、未改变尺寸时不带尺寸后缀。
 */
export function outputFilename(originalName, type, width, height, originalWidth, originalHeight) {
  const base =
    stripExtension(String(originalName ?? 'image'))
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 60) || 'image';

  const resized =
    Number(width) !== Number(originalWidth) || Number(height) !== Number(originalHeight);
  const suffix = resized && width > 0 && height > 0 ? `-${Math.round(width)}x${Math.round(height)}` : '';
  return `${base}${suffix}.${extForType(type)}`;
}

/**
 * 压缩收益统计。
 * savedBytes 为负数代表「压完更大」（如 PNG 转高质量 JPEG 的极端情况），
 * 由 grew 标记，界面要如实告知而不是显示负的节省率。
 */
export function calcSavings(originalBytes, compressedBytes) {
  const o = Math.max(0, Number(originalBytes) || 0);
  const c = Math.max(0, Number(compressedBytes) || 0);
  if (o === 0) return { savedBytes: 0, savedPercent: 0, ratio: 1, grew: false };
  const savedBytes = o - c;
  return {
    savedBytes,
    savedPercent: Math.round((savedBytes / o) * 1000) / 10,
    ratio: c / o,
    grew: savedBytes < 0,
  };
}

/**
 * canvas 面积上限保护。部分浏览器（尤其移动端 Safari）超过阈值会静默失败或黑图。
 * 超过时返回 false，界面提示用户先缩小尺寸。
 */
export const MAX_CANVAS_PIXELS = 16_777_216; // 4096 × 4096

export function exceedsCanvasLimit(width, height) {
  return Math.max(1, Number(width) || 0) * Math.max(1, Number(height) || 0) > MAX_CANVAS_PIXELS;
}

/** 浏览器能解码的图片类型。HEIC 等虽然 MIME 也是 image/*，但只有 Safari 支持 */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];

/**
 * 是否可接收。注意不能只看 `type.startsWith('image/')`——
 * image/heic 之类浏览器解不出来的格式会混进来，
 * 必须对照 ACCEPTED_TYPES 白名单；无 type 时用扩展名兜底。
 */
export function isAcceptedImage(file) {
  if (!file) return false;
  const type = String(file.type || '');
  if (type) return ACCEPTED_TYPES.includes(type);
  return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '');
}

/** 汇总整批文件的压缩前后体积 */
export function summarize(items) {
  const list = items.filter(Boolean);
  const originalBytes = list.reduce((s, it) => s + (Number(it.originalBytes) || 0), 0);
  const compressedBytes = list.reduce((s, it) => s + (Number(it.compressedBytes) || 0), 0);
  return {
    count: list.length,
    originalBytes,
    compressedBytes,
    ...calcSavings(originalBytes, compressedBytes),
  };
}
