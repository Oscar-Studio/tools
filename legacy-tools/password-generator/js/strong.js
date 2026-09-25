/**
 * 强密码生成:从所选字符集随机抽取 + 强制每类至少 1 个 + Fisher-Yates 洗牌。
 * 可选排除易混淆字符(0/O/I/l/1/|/` 等)。
 */
import { randomInt, randomChar, shuffleInPlace } from './random.js';

export const CHARSETS = Object.freeze({
  upper:   'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower:   'abcdefghijklmnopqrstuvwxyz',
  digits:  '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/',
});

// 易混淆字符：手写时容易看错
const AMBIGUOUS_RE = /[0OIl1|`'"]/g;

export function filterAmbiguous(charset) {
  return charset.replace(AMBIGUOUS_RE, '');
}

export function validateOptions(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('opts 必须是对象');
  const { length, upper, lower, digits, symbols } = opts;
  if (!Number.isInteger(length) || length < 4 || length > 128) {
    throw new Error('length 必须是 4..128 的整数');
  }
  if (!upper && !lower && !digits && !symbols) {
    throw new Error('至少选择 1 类字符');
  }
}

/**
 * @typedef {Object} StrongOpts
 * @property {number} length
 * @property {boolean} upper
 * @property {boolean} lower
 * @property {boolean} digits
 * @property {boolean} symbols
 * @property {boolean} [excludeAmbiguous=true]
 */

/**
 * @param {StrongOpts} opts
 * @returns {{ password: string, charsetSize: number, entropy: number }}
 */
export function generateStrong(opts) {
  validateOptions(opts);
  const { length, upper, lower, digits, symbols, excludeAmbiguous = true } = opts;
  const classes = [];
  if (upper) classes.push(CHARSETS.upper);
  if (lower) classes.push(CHARSETS.lower);
  if (digits) classes.push(CHARSETS.digits);
  if (symbols) classes.push(CHARSETS.symbols);

  // 字符集：去重（upper/lower 之间不会撞，但保险）
  let charset = [...new Set(classes.join(''))].join('');
  const cleanClasses = classes.map((c) => excludeAmbiguous ? filterAmbiguous(c) : c);
  if (excludeAmbiguous) charset = filterAmbiguous(charset);

  // 每类先抓一个（保证至少 1 个）
  const picked = [];
  for (const c of cleanClasses) {
    if (c.length === 0) {
      throw new Error('所选字符集排除易混淆字符后为空');
    }
    picked.push(c[randomInt(c.length)]);
  }

  // 剩余位从全字符集抽
  while (picked.length < length) {
    picked.push(charset[randomInt(charset.length)]);
  }

  // 如果 picked 比 length 长（极端情况不会发生），截断
  if (picked.length > length) picked.length = length;

  shuffleInPlace(picked);

  const password = picked.join('');
  // log2(N) where N = charsetSize
  const entropy = length * Math.log2(charset.length);
  return { password, charsetSize: charset.length, entropy };
}