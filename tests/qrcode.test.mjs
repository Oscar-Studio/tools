// 二维码生成器测试：覆盖 qr-render.js 的纯函数部分（不依赖 DOM）。
// 注意：createMatrix 用动态 import 浏览器路径，Node 测试不直接调用；
// 我们用 .qrcode-build/qrcode.js（prebuild 产物，相对路径）单独测试 QRCode.create()。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { renderToSVG, gradientEndpoints } from '../legacy-tools/qrcode/js/qr-render.js';
import QRCodeBundle from '../.qrcode-build/qrcode.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..');

// ============ QRCode bundle（矩阵生成） ============
{
  // 同一文本不同 ECL 应产出不同大小（容错越高、数据越多）
  const mL = QRCodeBundle.create('https://oscarstudio.cn', { errorCorrectionLevel: 'L' });
  const mM = QRCodeBundle.create('https://oscarstudio.cn', { errorCorrectionLevel: 'M' });
  const mH = QRCodeBundle.create('https://oscarstudio.cn', { errorCorrectionLevel: 'H' });
  assert.ok(mL.modules.size > 0, 'modules.size > 0');
  assert.ok(mM.modules.size >= mL.modules.size, 'M matrix size >= L');
  assert.ok(mH.modules.size >= mM.modules.size, 'H matrix size >= M');
  assert.equal(mL.modules.data.length, mL.modules.size * mL.modules.size, 'data length matches size*size');

  // 矩阵里 0/1 分布合理（不是全 0 也不是全 1）
  let ones = 0;
  for (const v of mM.modules.data) if (v === 1) ones++;
  const ratio = ones / mM.modules.data.length;
  assert.ok(ratio > 0.3 && ratio < 0.7, `module ratio should be 0.3~0.7, got ${ratio.toFixed(3)}`);

  // 相同输入产出相同矩阵（确定性）
  const a = QRCodeBundle.create('hello', { errorCorrectionLevel: 'M' });
  const b = QRCodeBundle.create('hello', { errorCorrectionLevel: 'M' });
  assert.deepEqual([...a.modules.data], [...b.modules.data], 'deterministic for same input');
}
console.log('✔ qrcode bundle (matrix generation)');

// ============ gradientEndpoints ============
{
  // 0°: 水平，x 变 y 不变
  let e = gradientEndpoints(0, 100);
  assert.equal(e.y1, e.y2, '0°: y1 == y2');
  assert.equal(e.x1, 0);
  assert.equal(e.x2, 100);

  // 90°: 垂直，x 不变 y 变
  e = gradientEndpoints(90, 100);
  assert.equal(e.x1, e.x2, '90°: x1 == x2');
  assert.equal(e.y1, 0);
  assert.equal(e.y2, 100);

  // 45°: 对角
  e = gradientEndpoints(45, 100);
  assert.ok(Math.abs(e.x1 - 0) < 1e-9 && Math.abs(e.y1 - 0) < 1e-9, '45° start at corner');
  assert.ok(Math.abs(e.x2 - 100) < 1e-9 && Math.abs(e.y2 - 100) < 1e-9, '45° end at corner');

  // 135°: 反向对角
  e = gradientEndpoints(135, 100);
  assert.ok(Math.abs(e.x1 - 100) < 1e-9 && Math.abs(e.y1 - 0) < 1e-9, '135° start at top-right');
  assert.ok(Math.abs(e.x2 - 0) < 1e-9 && Math.abs(e.y2 - 100) < 1e-9, '135° end at bottom-left');
}
console.log('✔ gradientEndpoints');

// ============ renderToSVG（用 stub matrix） ============
function makeStubMatrix(size) {
  // 构造一个伪矩阵：四角 3x3 实心方块模拟定位图案，中间散布 1。
  const data = new Uint8Array(size * size);
  const setSquare = (x0, y0) => {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      data[(y0 + y) * size + (x0 + x)] = 1;
    }
  };
  setSquare(0, 0);                 // 左上
  setSquare(size - 3, 0);          // 右上
  setSquare(0, size - 3);          // 左下
  // 中间加几个点
  for (let i = 0; i < size; i += 2) {
    if (data[i] === 0) data[size * Math.floor(size / 2) + i] = 1;
  }
  return { modules: { size, data } };
}

const stub = makeStubMatrix(11);
const baseStyle = {
  fg: '#101418',
  bg: '#ffffff',
  gradient: { enabled: false, color: '#3a3f4b', direction: 45 },
  shape: 'square',
  size: 280,
  logo: null,
  margin: 2,
};

// 1) 基础方点 + 无 Logo + 无渐变
{
  const svg = renderToSVG(stub, baseStyle);
  assert.ok(svg.startsWith('<svg'), 'starts with <svg');
  assert.ok(svg.endsWith('</svg>'), 'ends with </svg>');
  assert.ok(svg.includes('viewBox="0 0 280 280"'), 'has viewBox');
  assert.ok(svg.includes('<rect width="100%" height="100%" fill="#ffffff"/>'), 'has bg rect');
  assert.ok(svg.includes('fill="#101418"'), 'has fg color');
  assert.ok(!svg.includes('<linearGradient'), 'no gradient when disabled');
  assert.ok(!svg.includes('<image'), 'no logo image by default');
  assert.ok(!svg.includes('<circle'), 'no circles in square shape');
}
console.log('✔ renderToSVG basic (square, no logo, no gradient)');

// 2) 圆点形状：data 模块用 circle，finder pattern 用 stroke 圆环 + 中心圆
{
  const svg = renderToSVG(stub, { ...baseStyle, shape: 'dot' });
  assert.ok(svg.includes('<circle'), 'has circles in dot shape');

  // dot 模式下只有 bg rect，不应有 module rect
  const withoutBg = svg.replace(/<rect width="100%" height="100%" fill="#ffffff"\/>/, '');
  const moduleRects = withoutBg.match(/<rect[^/]*\/>/g) || [];
  assert.equal(moduleRects.length, 0, 'no module rects in dot shape');

  // finder 用 stroke 圆环：3 个
  const ringMatches = withoutBg.match(/<circle[^/]*stroke="/g) || [];
  assert.equal(ringMatches.length, 3, 'has 3 finder ring circles with stroke');

  // 中心实心圆：3 个（每个 finder 一个）
  // 11x11 stub 还有其他数据圆点，所以总 circle 数 > 3，但 stroke circle 只有 3 个
  assert.ok(svg.includes('fill="#101418"'), 'finder uses fg color');

  // 位置校验：左上 finder 中心 = (offset + 3.5 cell, offset + 3.5 cell)
  const cell = 280 / (stub.modules.size + 4);
  const offset = 2 * cell;
  const half = 3.5 * cell;
  const expectedCx = (offset + half).toFixed(2);
  assert.ok(svg.includes(`cx="${expectedCx}"`), 'top-left finder center at expected position');
}
console.log('✔ renderToSVG dot shape (with ringed finder patterns)');

// 2b) 圆点 + 渐变：finder pattern 也应该用渐变填充
{
  const svg = renderToSVG(stub, {
    ...baseStyle,
    shape: 'dot',
    gradient: { enabled: true, color: '#ff0000', direction: 90 },
  });
  // 圆环 stroke + 中心实心圆都引用渐变
  const gradientRefs = svg.match(/url\(#qrfg\)/g) || [];
  assert.ok(gradientRefs.length >= 6, `finder uses gradient url (got ${gradientRefs.length} refs)`);
}
console.log('✔ renderToSVG dot + gradient');

// 3) 启用渐变
{
  const svg = renderToSVG(stub, {
    ...baseStyle,
    gradient: { enabled: true, color: '#ff0000', direction: 90 },
  });
  assert.ok(svg.includes('<linearGradient'), 'has linearGradient def');
  assert.ok(svg.includes('id="qrfg"'), 'gradient id is qrfg');
  assert.ok(svg.includes('stop-color="#ff0000"'), 'second color in gradient');
  assert.ok(svg.includes('fill="url(#qrfg)"'), 'uses gradient url');
}
console.log('✔ renderToSVG gradient enabled');

// 4) Logo 嵌入
{
  const svg = renderToSVG(stub, {
    ...baseStyle,
    logo: { dataUrl: 'data:image/png;base64,AAA', size: 0.22 },
  });
  assert.ok(svg.includes('<image'), 'has image element');
  assert.ok(svg.includes('href="data:image/png;base64,AAA"'), 'logo dataUrl embedded');
  // Logo 白底 + 半径 rx
  assert.ok(svg.includes('fill="#ffffff"'), 'logo white background');
}
console.log('✔ renderToSVG logo embedded');

// 5) 自定义背景色
{
  const svg = renderToSVG(stub, { ...baseStyle, bg: '#ff00ff' });
  assert.ok(svg.includes('fill="#ff00ff"'), 'custom bg color applied');
}
console.log('✔ renderToSVG custom bg');

console.log('\n🎉 all qrcode tests passed');