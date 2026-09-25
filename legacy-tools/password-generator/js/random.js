/**
 * 密码学安全随机数封装。
 * 浏览器: crypto.getRandomValues (W3C Web Crypto)。
 * Node 测试: 通过 globalThis.crypto = webcrypto 注入。
 * 不接受任何非密码学源(Math.random 等);在不可用时显式抛错。
 */

function getCrypto() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues 不可用，无法生成安全随机数');
  }
  return c;
}

/** 返回长度为 n 的 Uint8Array，元素 ∈ [0, 256)。 */
export function randomBytes(n) {
  if (!Number.isInteger(n) || n < 1 || n > 65536) throw new Error('randomBytes: n 必须是 1..65536 的整数');
  const buf = new Uint8Array(n);
  getCrypto().getRandomValues(buf);
  return buf;
}

/** 均匀无偏返回 [0, max)。拒绝采样保证每个整数的概率严格相等。 */
export function randomInt(max) {
  if (!Number.isInteger(max) || max < 1) throw new Error('randomInt: max 必须是 ≥1 的整数');
  const c = getCrypto();
  // 拒绝采样：取 32 bit 直到落在 [0, 2^32 - (2^32 % max)) 内
  const range = 0x100000000; // 2^32
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  // 极端情况：max 整除 2^32 时直接返回
  if (limit === range) {
    c.getRandomValues(buf);
    return buf[0] % max;
  }
  while (true) {
    c.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/** 从字符串字符集中随机抽 1 个字符(用单字节拒绝以支持任意 unicode)。 */
export function randomChar(charset) {
  if (!charset || typeof charset !== 'string') throw new Error('randomChar: charset 必须是非空字符串');
  // 对单字节字符集（ASCII）做轻量优化
  if (charset.length < 256 && /^[\x00-\x7f]*$/.test(charset)) {
    return charset[randomInt(charset.length)];
  }
  // BMP 内任意字符：用 UTF-16 code unit 拒绝采样
  const buf = new Uint32Array(1);
  const c = getCrypto();
  while (true) {
    c.getRandomValues(buf);
    const code = buf[0] % 0x10000;
    // 跳过 surrogate (0xD800..0xDFFF)
    if (code >= 0xD800 && code <= 0xDFFF) continue;
    const ch = String.fromCharCode(code);
    if (charset.includes(ch)) return ch;
  }
}

/** Fisher-Yates 原地洗牌。返回同一数组(已乱序)。 */
export function shuffleInPlace(arr) {
  if (!Array.isArray(arr)) throw new Error('shuffleInPlace: arr 必须是数组');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}