const HAN = /\p{Script=Han}/u;
const ENGLISH_WORD = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
const DIGIT = /\p{N}/u;
const PUNCTUATION = /\p{P}/u;

function coerceToString(text) {
  if (text == null) return '';
  if (typeof text === 'string') return text;
  if (typeof text === 'number' || typeof text === 'boolean') return String(text);
  if (typeof text === 'object') {
    if (Array.isArray(text)) return text.map(coerceToString).join('');
    if (typeof Symbol === 'undefined' || Symbol.iterator in text) {
      try { return Array.from(text, coerceToString).join(''); } catch { return ''; }
    }
    try { return String(text); } catch { return ''; }
  }
  try { return String(text); } catch { return ''; }
}

export function countText(text) {
  text = coerceToString(text);
  const chars = Array.from(text);
  const nonWhitespace = chars.filter((char) => !/\s/u.test(char));
  const englishWords = text.match(ENGLISH_WORD)?.length ?? 0;
  const chineseCharacters = chars.reduce((total, char) => total + (HAN.test(char) ? 1 : 0), 0);
  const digits = chars.reduce((total, char) => total + (DIGIT.test(char) ? 1 : 0), 0);
  const punctuation = chars.reduce((total, char) => total + (PUNCTUATION.test(char) ? 1 : 0), 0);
  const paragraphs = text.trim() ? text.trim().split(/\n\s*\n+/u).filter(Boolean).length : 0;
  const lines = text ? text.split(/\r\n|\r|\n/u).length : 0;
  const readingMinutes = Math.max(0, Math.ceil((chineseCharacters / 300 + englishWords / 180) * 10) / 10);

  return {
    charactersWithSpaces: chars.length,
    charactersWithoutSpaces: nonWhitespace.length,
    chineseCharacters,
    englishWords,
    digits,
    punctuation,
    lines,
    paragraphs,
    utf8Bytes: new TextEncoder().encode(text).length,
    readingMinutes,
  };
}

export function formatReadingTime(minutes) {
  // Invalid inputs (NaN, -∞, Infinity) get a sentinel string instead of silently returning
  // a misleading value like '0 min' or 'Infinityh Infinitym'.
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
    return '— min';
  }
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

const STOPWORDS = new Set(`a an the and or but if while for of to in on at by from with as is am are was were be been being do does did done have has had having this that these those it its i you he she we they me him her them my our your their
不 也 了 着 的 之 乎 矣 焉 哉 是 在 有 和 与 及 或 但 而 又 还 就 才 已 已经 可以 可能 一定 必须 需要 应该 因为 所以 如果 那么 这 那 这些 那些 此 其 之 其余 一个 一些 一 一直 一片 一次 一下 一点 一行 一句 一篇 一本 一部 一张 一只 一位 一名 一事 一段 一番 一场 一边 一同 一齐 一道 一群 一路 一来 上下 中间 里面 外面 前面 后面 左右 之中 之内 之外
到 说 要 吗 呢 啊 吧 哦 嗯 嘛 哈 啦 哇 哎 嗨 呸 嘘
什么 为什么 怎么 怎样 如何 哪里 哪个 哪些 几 多少 谁`.trim().split(/\s+/u));

const SEGMENTER = typeof Intl !== 'undefined' && Intl.Segmenter ? { en: new Intl.Segmenter('en', { granularity: 'word' }), zh: new Intl.Segmenter('zh', { granularity: 'word' }) } : null;

function tokenizeLatin(text) {
  const counts = new Map();
  if (SEGMENTER) {
    for (const segment of SEGMENTER.en.segment(text)) { if (!segment.isWordLike) continue; const word = segment.segment.toLowerCase(); if (word.length < 2) continue; counts.set(word, (counts.get(word) ?? 0) + 1); }
  } else {
    const matches = text.toLowerCase().match(/[a-z]+(?:['’\-][a-z]+)*/gu) ?? [];
    for (const word of matches) { if (word.length < 2) continue; counts.set(word, (counts.get(word) ?? 0) + 1); }
  }
  return counts;
}

function tokenizeChinese(text) {
  const counts = new Map();
  const cjk = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/gu) ?? [];
  if (cjk.length === 0) return counts;
  // 单字计数：当 cjk 字符数 >= 2 时，每个字符单独计数
  if (cjk.length >= 2) {
    for (const ch of cjk) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  // 二元组计数（bigram）
  for (let i = 0; i < cjk.length - 1; i += 1) {
    const bigram = cjk[i] + cjk[i + 1];
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

export function topKeywords(text, { limit = 20, excludeStopwords = true } = {}) {
  if (text == null || text === '') return [];
  const merged = new Map();
  for (const [word, count] of tokenizeLatin(text)) merged.set(word, (merged.get(word) ?? 0) + count);
  for (const [word, count] of tokenizeChinese(text)) merged.set(word, (merged.get(word) ?? 0) + count);
  const filtered = [];
  for (const [word, count] of merged) { if (excludeStopwords && STOPWORDS.has(word)) continue; filtered.push([word, count]); }
  filtered.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  return filtered.slice(0, limit);
}
