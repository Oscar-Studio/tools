// 图片压缩器测试：覆盖 image-core.js 全部纯函数（不依赖 DOM / canvas）。
import assert from 'node:assert/strict';

import {
  ACCEPTED_TYPES,
  MAX_CANVAS_PIXELS,
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
} from '../legacy-tools/image-compressor/js/image-core.js';

// ============ formatBytes ============
{
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(-1), '0 B', '负数兜底');
  assert.equal(formatBytes(NaN), '0 B', 'NaN 兜底');
  assert.equal(formatBytes(undefined), '0 B', 'undefined 兜底');
  assert.equal(formatBytes(1), '1 B');
  assert.equal(formatBytes(999), '999 B', '不足 1KB 不进位');
  assert.equal(formatBytes(1023), '1023 B', '临界点前一字节仍显示 B');
  assert.equal(formatBytes(1024), '1 KB', '临界点进位');
  assert.equal(formatBytes(1536), '1.5 KB', '保留 1 位小数');
  assert.equal(formatBytes(2048), '2 KB', '整数不带小数');
  assert.equal(formatBytes(1048576), '1 MB');
  assert.equal(formatBytes(1572864), '1.5 MB');
  assert.equal(formatBytes(1073741824), '1 GB');
  // 单位表到 TB 为止，再大就停在 TB 不继续进位
  assert.equal(formatBytes(1024 ** 5), '1024 TB', 'TB 之后停止进位');
}
console.log('✔ formatBytes');

// ============ parseDimensionInput ============
{
  assert.deepEqual(parseDimensionInput('800'), { width: 800, height: null });
  assert.deepEqual(parseDimensionInput('800x600'), { width: 800, height: 600 });
  assert.deepEqual(parseDimensionInput('800×600'), { width: 800, height: 600 }, '全角乘号');
  assert.deepEqual(parseDimensionInput(' 800 X 600 '), { width: 800, height: 600 }, '空格与大小写');
  assert.deepEqual(parseDimensionInput('1920*1080'), { width: 1920, height: 1080 }, '星号分隔');
  assert.deepEqual(parseDimensionInput(0), { width: null, height: null }, '0 视为未设置');
  assert.deepEqual(parseDimensionInput('0x600'), { width: null, height: 600 }, '0 视为未设置');

  assert.equal(parseDimensionInput(''), null, '空 → null');
  assert.equal(parseDimensionInput('   '), null);
  assert.equal(parseDimensionInput(null), null);
  assert.equal(parseDimensionInput('abc'), null, '非数字');
  assert.equal(parseDimensionInput('800x'), null, '半个尺寸');
  assert.equal(parseDimensionInput('x600'), null);
  assert.equal(parseDimensionInput('8.5'), null, '小数不接受');
  assert.equal(parseDimensionInput('-100'), null, '负数不接受');
  assert.equal(parseDimensionInput('100x100x100'), null, '三段不接受');
  assert.equal(parseDimensionInput('1e3'), null, '科学计数法不接受');
}
console.log('✔ parseDimensionInput');

// ============ fitDimensions ============
{
  // 无限制 → 原样
  assert.deepEqual(fitDimensions(800, 600), { width: 800, height: 600, changed: false, scale: 1 });
  assert.equal(fitDimensions(800, 600, null, null).changed, false);
  assert.equal(fitDimensions(800, 600, 0, 0).changed, false, '0 视为未设置');

  // 只限宽度：等比
  const a = fitDimensions(1000, 500, 500, null);
  assert.deepEqual({ w: a.width, h: a.height, changed: a.changed }, { w: 500, h: 250, changed: true });
  assert.equal(a.scale, 0.5);

  // 只限高度
  const b = fitDimensions(1000, 500, null, 250);
  assert.equal(b.width, 500);
  assert.equal(b.height, 250);

  // 两个限制取更严格的那个
  const c = fitDimensions(1000, 500, 900, 100);
  assert.equal(c.width, 200, '受高度约束');
  assert.equal(c.height, 100);

  // 永不放大
  const d = fitDimensions(400, 300, 4000, 4000);
  assert.equal(d.width, 400, '不放大到 4000');
  assert.equal(d.height, 300);
  assert.equal(d.changed, false);

  // 恰好等于上限 → 不算变化
  const e = fitDimensions(800, 600, 800, 600);
  assert.equal(e.changed, false);
  assert.equal(e.width, 800);

  // 尺寸至少为 1
  const f = fitDimensions(1000, 10, 50, 50);
  assert.equal(f.width, 50);
  assert.equal(f.height, 1, '极扁图高度不塌成 0');

  // 非法输入兜底
  const g = fitDimensions(0, 0, 100, 100);
  assert.equal(g.width, 1);
  assert.equal(g.height, 1);
}
console.log('✔ fitDimensions');

// ============ clampQuality ============
{
  assert.equal(clampQuality(0.8), 0.8);
  assert.equal(clampQuality(2), 1, '上限 1');
  assert.equal(clampQuality(-1), 0.05, '下限 0.05');
  assert.equal(clampQuality(0.123), 0.12, '两位小数');
  assert.equal(clampQuality(0), 0.05, '0 抬到下限');
  assert.equal(clampQuality(NaN), 0.8, 'NaN 走默认');
  assert.equal(clampQuality(undefined), 0.8);
  assert.equal(clampQuality('0.5'), 0.5, '字符串数字可用');
}
console.log('✔ clampQuality');

// ============ qualityApplies ============
{
  assert.equal(qualityApplies('image/jpeg'), true);
  assert.equal(qualityApplies('image/webp'), true);
  assert.equal(qualityApplies('image/avif'), true);
  assert.equal(qualityApplies('image/png'), false, 'PNG 无损，质量无效');
}
console.log('✔ qualityApplies');

// ============ resolveOutputFormat ============
{
  const all = { 'image/jpeg': true, 'image/webp': true, 'image/png': true };
  assert.deepEqual(resolveOutputFormat('image/webp', all), { type: 'image/webp', fellBack: false });

  // 不支持 webp → 退回 jpeg
  const noWebp = { 'image/jpeg': true, 'image/png': true };
  assert.deepEqual(resolveOutputFormat('image/webp', noWebp), { type: 'image/jpeg', fellBack: true });

  // 未知 / 非法请求 → jpeg
  assert.deepEqual(resolveOutputFormat('image/gif', all), { type: 'image/jpeg', fellBack: true });
  assert.deepEqual(resolveOutputFormat(null, all), { type: 'image/jpeg', fellBack: true });

  // 什么能力都没有 → png（保底）
  assert.deepEqual(resolveOutputFormat('image/webp', {}), { type: 'image/png', fellBack: true });
  // png 可用时不退回
  assert.deepEqual(resolveOutputFormat('image/png', { 'image/png': true }), { type: 'image/png', fellBack: false });
}
console.log('✔ resolveOutputFormat');

// ============ extForType ============
{
  assert.equal(extForType('image/jpeg'), 'jpg');
  assert.equal(extForType('image/webp'), 'webp');
  assert.equal(extForType('image/png'), 'png');
  assert.equal(extForType('image/avif'), 'avif');
  assert.equal(extForType('image/unknown'), 'png', '未知类型兜底');
  assert.equal(extForType(null), 'png');
}
console.log('✔ extForType');

// ============ outputFilename ============
{
  // 改变了尺寸 → 带尺寸后缀
  assert.equal(outputFilename('photo.png', 'image/webp', 800, 600, 1600, 1200), 'photo-800x600.webp');
  // 只是换格式、尺寸没变 → 不带后缀
  assert.equal(outputFilename('photo.png', 'image/jpeg', 800, 600, 800, 600), 'photo.jpg');
  // jpeg 用 .jpg 不是 .jpeg
  assert.equal(outputFilename('a.jpeg', 'image/jpeg', 100, 100, 100, 100), 'a.jpg');
  // 清理非法字符
  assert.equal(outputFilename('a/b:c*d?.png', 'image/png', 10, 10, 10, 10), 'a_b_c_d_.png');
  // 隐藏文件：点开头不是扩展名，只去掉前导点
  assert.equal(outputFilename('.gitignore', 'image/png', 1, 1, 1, 1), 'gitignore.png');
  // 无扩展名
  assert.equal(outputFilename('photo', 'image/jpeg', 10, 10, 10, 10), 'photo.jpg');
  // 多个点只剥最后一个
  assert.equal(outputFilename('my.holiday.photo.png', 'image/jpeg', 10, 10, 10, 10), 'my.holiday.photo.jpg');
  // 无名文件
  assert.equal(outputFilename('', 'image/png', 5, 5, 5, 5), 'image.png');
  assert.equal(outputFilename(null, 'image/png', 5, 5, 5, 5), 'image.png');
  // 超长主名截断到 60
  const long = 'x'.repeat(200) + '.png';
  const out = outputFilename(long, 'image/png', 1, 1, 1, 1);
  assert.equal(out, 'x'.repeat(60) + '.png', '主名被截断');
}
console.log('✔ outputFilename');

// ============ calcSavings ============
{
  const a = calcSavings(1000, 250);
  assert.equal(a.savedBytes, 750);
  assert.equal(a.savedPercent, 75);
  assert.equal(a.ratio, 0.25);
  assert.equal(a.grew, false);

  // 压完更大：如实标记，不显示负百分比
  const b = calcSavings(100, 150);
  assert.equal(b.grew, true, '标记 grew');
  assert.equal(b.savedBytes, -50);
  assert.equal(b.savedPercent, -50);

  // 一模一样
  const c = calcSavings(500, 500);
  assert.equal(c.savedPercent, 0);
  assert.equal(c.grew, false);

  // 非法输入
  const d = calcSavings(0, 100);
  assert.equal(d.savedPercent, 0, '原图为 0 不做除法');
  assert.equal(d.grew, false);
  assert.equal(calcSavings(100, 0).savedPercent, 100, '压到 0 字节');
  assert.equal(calcSavings(NaN, 100).savedPercent, 0);

  // 百分比保留 1 位
  assert.equal(calcSavings(300, 100).savedPercent, 66.7);
}
console.log('✔ calcSavings');

// ============ exceedsCanvasLimit ============
{
  assert.equal(exceedsCanvasLimit(4096, 4096), false, '正好在上限内');
  assert.equal(exceedsCanvasLimit(4097, 4096), true, '超一点就拦');
  assert.equal(exceedsCanvasLimit(8000, 8000), true);
  assert.equal(exceedsCanvasLimit(100, 100), false);
  assert.equal(exceedsCanvasLimit(0, 0), false, '非法尺寸夹成 1x1，不虚报超限');
  assert.equal(MAX_CANVAS_PIXELS, 16777216);
}
console.log('✔ exceedsCanvasLimit');

// ============ isAcceptedImage ============
{
  for (const t of ACCEPTED_TYPES) {
    assert.equal(isAcceptedImage({ type: t, name: 'a' }), true, `${t} 应接受`);
  }
  assert.equal(isAcceptedImage({ type: 'image/heic', name: 'a.heic' }), false, 'HEIC 不支持');
  assert.equal(isAcceptedImage({ type: 'application/pdf', name: 'a.pdf' }), false, '非图片');
  assert.equal(isAcceptedImage({ type: 'text/plain', name: 'a.txt' }), false);
  // 无 type 时靠扩展名
  assert.equal(isAcceptedImage({ type: '', name: 'photo.JPG' }), true, '扩展名大小写不敏感');
  assert.equal(isAcceptedImage({ type: '', name: 'photo.jpeg' }), true);
  assert.equal(isAcceptedImage({ type: '', name: 'photo.heic' }), false);
  assert.equal(isAcceptedImage({ type: '', name: 'noext' }), false);
  assert.equal(isAcceptedImage(null), false);
  assert.equal(isAcceptedImage({}), false);
}
console.log('✔ isAcceptedImage');

// ============ summarize ============
{
  const s = summarize([
    { originalBytes: 1000, compressedBytes: 100 },
    { originalBytes: 2000, compressedBytes: 600 },
  ]);
  assert.equal(s.count, 2);
  assert.equal(s.originalBytes, 3000);
  assert.equal(s.compressedBytes, 700);
  assert.equal(s.savedPercent, 76.7);
  assert.equal(s.grew, false);

  assert.equal(summarize([]).count, 0, '空列表安全');
  assert.equal(summarize([null, undefined]).count, 0, '跳过空项');
  assert.equal(summarize([{}]).savedPercent, 0, '缺字段不炸');
}
console.log('✔ summarize');

console.log('\n🎉 all image-compressor tests passed');
