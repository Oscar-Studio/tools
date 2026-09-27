// =====================================================
// 颜文字大全 —— 纯逻辑层
// 不触碰任何 DOM，Node 测试直接 import。
//
// 分工：
//   前端一次性拉全量元数据（800 条约 190KB），浏览分类与字面搜索
//   全部在本内存里完成 → 零延迟、零请求；
//   只有「语义搜索」需要调后端（POST /api/kaomoji/semantic）。
// =====================================================

/** 单次语义搜索的返回条数上限 */
export const DEFAULT_LIMIT = 60;

/** 触发语义搜索的最少字数：太短的词语义不稳定，且不值得花一次上游调用 */
export const MIN_SEMANTIC_CHARS = 2;

/**
 * 归一化查询串。
 * 空白一律压成单个空格并去首尾——用户很容易在中文里打出空格。
 */
export function normalizeQuery(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/** 是否值得发起语义搜索 */
export function shouldRunSemantic(q) {
  return normalizeQuery(q).length >= MIN_SEMANTIC_CHARS;
}

/** HTML 转义。本文件所有拼接进 innerHTML 的文本都要先过这里 */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 字面打分。与后端 routes/kaomoji.js 的 scoreLocal 同一套权重，
 * 保证「前端即时结果」和「后端结果」排序感觉一致。
 * 命中面越宽（标签越多）略微加分，代表这条覆盖的情绪更多。
 */
export function scoreLocal(item, q) {
  const needle = q.toLowerCase();
  if (!needle) return 0;
  let score = 0;
  if (String(item.face).toLowerCase().includes(needle)) score += 100;
  if (String(item.desc).toLowerCase().includes(needle)) score += 50;
  for (const t of item.tags || []) {
    if (String(t).toLowerCase().includes(needle)) { score += 30; break; }
  }
  if (String(item.category).toLowerCase().includes(needle)) score += 20;
  // 没命中就直接归零。标签加分只作为「命中项之间」的权重微调，
  // 否则未命中的条目也会拿到基础分，过滤条件 score > 0 就形同虚设。
  if (score === 0) return 0;
  return score + Math.min((item.tags || []).length, 4);
}

/**
 * 本地过滤：分类 + 字面。
 *
 * 无查询词时按数据原序返回（灌数据时就是按分类聚在一起的推荐序）；
 * 有查询词时按分数降序，同分按 id 保证稳定（不抖动）。
 */
export function filterItems(items, { category = '', q = '' } = {}) {
  const list = Array.isArray(items) ? items : [];
  const cat = String(category || '').trim();
  const query = normalizeQuery(q);

  // 数据来自网络响应，跳过空条目，别让一个 null 毁掉整次渲染
  const base = cat
    ? list.filter((it) => it && it.category === cat)
    : list.filter(Boolean);

  if (!query) return base.slice();

  const hits = [];
  for (const it of base) {
    const score = scoreLocal(it, query);
    if (score > 0) hits.push({ item: it, score });
  }
  hits.sort((a, b) => b.score - a.score || a.item.id - b.item.id);
  return hits.map((h) => h.item);
}

/**
 * 合并「字面命中」与「语义命中」。
 *
 * 语义结果优先（它更可能命中用户真正想表达的东西），但把字面已命中的
 * 条目**原地提权**而不是丢弃——用户搜「无语」时，字面精确命中显然该排在
 * 语义近似之前。用 seen 保证同一条不出现两次。
 */
export function mergeResults(exactItems, semanticItems, { limit = DEFAULT_LIMIT } = {}) {
  const out = [];
  const seen = new Set();
  const exactSet = new Set((exactItems || []).filter(Boolean).map((i) => i.id));

  for (const it of semanticItems || []) {
    if (it == null || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push({ ...it, viaSemantic: true, alsoExact: exactSet.has(it.id) });
  }
  for (const it of exactItems || []) {
    if (it == null || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push({ ...it, viaSemantic: false, alsoExact: false });
  }
  return out.slice(0, limit);
}

/** 按 face 去重（灌入的数据理论上已唯一，这里防前端合并多来源时重复） */
export function dedupeByFace(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    if (!it || seen.has(it.face)) continue;
    seen.add(it.face);
    out.push(it);
  }
  return out;
}

/** 分类 → 数量，键按中文拼音排（与后端 localeCompare 一致） */
export function buildCategoryIndex(items) {
  const map = new Map();
  for (const it of items || []) {
    if (!it || !it.category) continue;
    map.set(it.category, (map.get(it.category) || 0) + 1);
  }
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category, 'zh-Hans-CN'));
}

/**
 * 在文本里标出命中的查询词。
 * 纯子串高亮（不做分词）——中文场景下用户搜的通常就是描述里的原词。
 * 全程转义，命中片段包 <mark>。
 */
export function highlightText(text, q) {
  const raw = String(text ?? '');
  const query = normalizeQuery(q);
  if (!query) return escapeHtml(raw);

  const lowerRaw = raw.toLowerCase();
  const lowerQ = query.toLowerCase();
  let html = '';
  let cursor = 0;
  let at = lowerRaw.indexOf(lowerQ);

  while (at !== -1) {
    if (at > cursor) html += escapeHtml(raw.slice(cursor, at));
    html += `<mark>${escapeHtml(raw.slice(at, at + query.length))}</mark>`;
    cursor = at + query.length;
    at = lowerRaw.indexOf(lowerQ, cursor);
  }
  if (cursor < raw.length) html += escapeHtml(raw.slice(cursor));
  return html;
}

/**
 * 相似度分数的可读化。
 * 余弦相似度集中在 0.3~0.9，直接显示小数没意义，
 * 映射成「很接近 / 接近 / 有点像」三档，用户扫一眼就知道把握。
 */
export function formatScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '';
  if (n >= 0.72) return '很接近';
  if (n >= 0.58) return '接近';
  return '有点像';
}

/** 从任意余弦阈值起收，低于阈值的结果丢掉，避免硬凑 */
export function filterByScore(items, minScore = 0.45) {
  return (items || []).filter((it) => Number(it.score) >= minScore);
}

/**
 * 一条「搜索建议」，用于给用户可点的示例 query。
 * 刻意用口语化的整句，而不是分类名——演示的就是语义搜索的能力。
 */
export const SUGGESTIONS = [
  '想找个无语到不想说话的',
  '被夸了一句得意到飞起',
  '累到不想动只想躺着',
  '想装死已读不回',
  '害羞到说不出话',
  '崩溃了彻底撑不住',
];

/** 空状态文案：随「有没有查询词」变化 */
export function emptyHint(q, hasSemantic = false) {
  const query = normalizeQuery(q);
  if (!query) return '选一个分类，或在上方输入你的心情';
  if (hasSemantic) return `没有找到和「${query}」相近的颜文字，换个说法试试`;
  return `没有匹配「${query}」的颜文字，试试说得更口语一点`;
}
