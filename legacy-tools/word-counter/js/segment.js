const ENGLISH_WORD = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
const STOPWORDS = new Set(['的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '和', '与', '或', '及', '也', '都', '就', '不', '没', '啊', '吧', '吗', '呢', '把', '被', '让', '对', '为', '以', '从', '到', '由', '向', '上', '下', '里', '中', '外', '前', '后', '之', '其', '此', '那', '这', '并', '而', '但', '可', '又', '再', '或', '将', '如', '若', '则', '所', '因', '一个', '一些', '这是', '我们', '你们', '他们', '就是', '还有', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'at', 'by', 'this', 'that', 'it', 'its', 'with', 'from']);

function englishTokens(text) {
  return (text.match(ENGLISH_WORD) ?? []).map((word) => word.toLowerCase());
}

function chineseTokens(text) {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return [];
  // Strip out English words (already counted via englishTokens) to avoid
  // Intl.Segmenter('zh') re-tokenizing Latin text as "words".
  const cleaned = String(text).replace(ENGLISH_WORD, ' ');
  if (!cleaned.trim()) return [];
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  const out = [];
  for (const segment of segmenter.segment(cleaned)) {
    if (!segment.isWordLike) continue;
    const word = segment.segment.trim().toLowerCase();
    if (!word) continue;
    out.push(word);
  }
  return out;
}

export function segment(text) {
  if (text == null) return { entries: [], total: { tokens: 0, english: 0, chinese: 0 } };
  const counts = new Map();
  const total = { tokens: 0, english: 0, chinese: 0 };
  for (const word of englishTokens(text)) { total.english += 1; counts.set(word, (counts.get(word) ?? 0) + 1); }
  for (const word of chineseTokens(text)) { total.chinese += 1; counts.set(word, (counts.get(word) ?? 0) + 1); }
  // total.tokens = total occurrences before STOPWORDS / count / length filter
  total.tokens = [...counts.values()].reduce((s, c) => s + c, 0);
  for (const [word, count] of counts) if (count < 2 || STOPWORDS.has(word) || word.length < 2) counts.delete(word);
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word, count]) => ({ word, count }));
  return { entries, total };
}
