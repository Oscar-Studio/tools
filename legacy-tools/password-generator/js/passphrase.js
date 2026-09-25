/**
 * Diceware 助记密码:从词表中随机抽 N 个词,用所选分隔符连接。
 * 可选:首字母大写 / 末尾加数字 / 末尾加符号。
 */
import { randomInt } from './random.js';
import { WORDS_EN } from './dicts/en.js';
import { WORDS_ZH } from './dicts/zh.js';

const DICTS = { en: WORDS_EN, zh: WORDS_ZH };

const SYMBOLS = '!@#$%^&*()-_=+';

export function validatePassphraseOpts(opts) {
  if (!opts || typeof opts !== 'object') throw new Error('opts 必须是对象');
  const { count, lang } = opts;
  if (!Number.isInteger(count) || count < 3 || count > 10) {
    throw new Error('count 必须是 3..10 的整数');
  }
  if (lang !== 'en' && lang !== 'zh') {
    throw new Error("lang 必须是 'en' 或 'zh'");
  }
}

/**
 * @typedef {Object} PassOpts
 * @property {number} count
 * @property {'en'|'zh'} lang
 * @property {string} [separator]  ' ' | '-' | '.' | ''
 * @property {boolean} [capitalize]
 * @property {boolean} [includeNumber]
 * @property {boolean} [includeSymbol]
 */

/**
 * @param {PassOpts} opts
 * @returns {{ passphrase: string, words: string[], entropy: number, dictSize: number }}
 */
export function generatePassphrase(opts) {
  validatePassphraseOpts(opts);
  const { count, lang, separator = ' ', capitalize = false, includeNumber = false, includeSymbol = false } = opts;
  const dict = DICTS[lang];

  const words = [];
  for (let i = 0; i < count; i++) {
    let w = dict[randomInt(dict.length)];
    if (capitalize) {
      if (lang === 'en') {
        w = w[0].toUpperCase() + w.slice(1);
      } else {
        // 中文首字符大写:原样保留（汉字无大小写），但可在前面加修饰符？这里直接跳过
      }
    }
    words.push(w);
  }
  if (includeNumber) words.push(String(randomInt(10)));
  if (includeSymbol) words.push(SYMBOLS[randomInt(SYMBOLS.length)]);

  const passphrase = words.join(separator);
  const dictSize = dict.length;
  // 估算熵:log2(dictSize) * count,加数字 +~3.3 bit,符号 +~4.4 bit
  let extraBits = 0;
  if (includeNumber) extraBits += Math.log2(10);
  if (includeSymbol) extraBits += Math.log2(SYMBOLS.length);
  const entropy = count * Math.log2(dictSize) + extraBits;
  return { passphrase, words, entropy, dictSize };
}

export function dicewareEntropy(count, dictSize) {
  return count * Math.log2(dictSize);
}

export function getDictSize(lang) {
  return DICTS[lang]?.length ?? 0;
}