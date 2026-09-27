// 颜文字大全测试：覆盖 kaomoji-core.js 全部纯函数（不依赖 DOM / 网络）。
import assert from 'node:assert/strict';

import {
  DEFAULT_LIMIT,
  MIN_SEMANTIC_CHARS,
  SUGGESTIONS,
  buildCategoryIndex,
  dedupeByFace,
  emptyHint,
  escapeHtml,
  filterByScore,
  filterItems,
  formatScore,
  highlightText,
  mergeResults,
  normalizeQuery,
  scoreLocal,
  shouldRunSemantic,
} from '../legacy-tools/kaomoji/js/kaomoji-core.js';

// ============ normalizeQuery ============
{
  assert.equal(normalizeQuery('  无语  '), '无语', '去首尾空白');
  assert.equal(normalizeQuery('想  找个   无语'), '想 找个 无语', '中间空白压成单空格');
  assert.equal(normalizeQuery('a\t\nb'), 'a b', '制表符与换行也算空白');
  assert.equal(normalizeQuery(''), '');
  assert.equal(normalizeQuery(null), '');
  assert.equal(normalizeQuery(undefined), '');
  assert.equal(normalizeQuery('   '), '', '纯空白 → 空串');
}
console.log('✔ normalizeQuery');

// ============ shouldRunSemantic ============
{
  assert.equal(shouldRunSemantic('无语'), true);
  assert.equal(shouldRunSemantic('  无语  '), true, '归一化后够长即可');
  assert.equal(shouldRunSemantic('a'), false, '1 个字不触发');
  assert.equal(shouldRunSemantic(' 无 '), false, '归一化后只剩 1 个字，不触发');
  assert.equal(shouldRunSemantic('ab'), true, '2 个字刚好触发');
  assert.equal(shouldRunSemantic(''), false);
  assert.equal(shouldRunSemantic(' '), false);
  assert.equal(MIN_SEMANTIC_CHARS, 2);
}
console.log('✔ shouldRunSemantic');

// ============ escapeHtml ============
{
  assert.equal(escapeHtml('<b>'), '&lt;b&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('"q"'), '&quot;q&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml('&lt;'), '&amp;lt;', '& 优先转义，避免二次转义');
}
console.log('✔ escapeHtml');

// ============ scoreLocal ============
const mk = (id, face, category, tags, desc) => ({ id, face, category, tags, desc });

const SAMPLE = [
  mk(1, '(⊙_⊙)', '疑惑', ['疑惑', '懵'], '一头雾水、不明所以地看着'),
  mk(2, '(-_-)', '无语', ['无语', '冷漠'], '已经放弃沟通、连表情都不想给'),
  mk(3, '(´;ω;`)', '哭泣', ['难过', '想哭'], '低落难过、快要哭出来的样子'),
  mk(4, '٩(๑❂ᴗ❂๑)۶', '开心', ['激动', '雀跃'], '非常激动开心、兴奋地欢呼'),
  mk(5, 'T_T', '哭泣', ['流泪', '委屈'], '眼泪掉下来的样子'),
];

{
  // 颜文字本体命中权重最高
  const sFace = scoreLocal(SAMPLE[0], '⊙_⊙');
  const sDesc = scoreLocal(SAMPLE[0], '一头雾水');
  assert.ok(sFace > sDesc, `本体命中(${sFace}) 应高于描述命中(${sDesc})`);

  // 描述命中高于标签命中
  const sDesc2 = scoreLocal(SAMPLE[2], '快要哭');
  const sTag = scoreLocal(SAMPLE[2], '想哭');
  assert.ok(sDesc2 > sTag, `描述(${sDesc2}) 应高于标签(${sTag})`);

  // 完全不命中返回 0
  assert.equal(scoreLocal(SAMPLE[0], 'zzz不存在'), 0);
  // 空查询返回 0
  assert.equal(scoreLocal(SAMPLE[0], ''), 0);
  // 标签越多略微加分
  const few = scoreLocal(mk(9, 'x', '开心', ['开心'], 'a'), '开心');
  const many = scoreLocal(mk(10, 'y', '开心', ['开心', 'a', 'b', 'c'], 'a'), '开心');
  assert.ok(many > few, '标签多者得分略高');
  // 标签加分封顶在 4
  const over = scoreLocal(mk(11, 'z', '开心', ['a', 'b', 'c', 'd', 'e', 'f'], '开心'), '开心');
  const at4 = scoreLocal(mk(12, 'w', '开心', ['a', 'b', 'c', 'd'], '开心'), '开心');
  assert.equal(over, at4, '标签加分封顶');
  // 大小写不敏感
  assert.ok(scoreLocal(SAMPLE[0], '⊙_⊙'.toLowerCase()) > 0);
  // 缺 tags 不炸
  assert.ok(Number.isFinite(scoreLocal({ id: 1, face: 'a', category: 'b', desc: 'a' }, 'a')));
}
console.log('✔ scoreLocal');

// ============ 回归：未命中必须严格为 0 ============
// scoreLocal 曾在末尾无条件加上「标签数量」加分，导致完全没命中的条目
// 也拿到基础分；而 filterItems 的过滤条件是 score > 0 —— 结果是
// 「搜一个不存在的词会把全库都返回」。这两条守住这个不变量。
{
  assert.equal(scoreLocal(SAMPLE[0], 'zzz完全不存在'), 0, '无命中且标签多也必须为 0');
  assert.equal(
    scoreLocal(mk(1, 'x', '开心', ['a', 'b', 'c', 'd'], '完全不相关的描述'), '完全不存在'),
    0,
    '标签越多也必须为 0'
  );
  // 端到端：搜不存在的词，命中数必须是 0
  assert.equal(filterItems(SAMPLE, { q: 'zzz完全不存在' }).length, 0);
  assert.equal(filterItems(SAMPLE, { q: '不存在' }).length, 0);
  // 反过来确认正常词仍能命中（别把功能改死）
  assert.ok(filterItems(SAMPLE, { q: '哭' }).length > 0, '正常关键词仍要能命中');
}
console.log('✔ 回归：未命中条目不得混入结果');

// ============ filterItems ============
{
  // 无 query + 无 category → 原序全量
  assert.equal(filterItems(SAMPLE).length, 5);
  assert.equal(filterItems(SAMPLE)[0].id, 1, '无过滤时保持原序');

  // 只按分类
  const crying = filterItems(SAMPLE, { category: '哭泣' });
  assert.equal(crying.length, 2);
  assert.ok(crying.every((i) => i.category === '哭泣'));

  // 分类 + 关键词
  const both = filterItems(SAMPLE, { category: '哭泣', q: 'T_T' });
  assert.equal(both.length, 1);
  assert.equal(both[0].id, 5);

  // 关键词过滤，按分降序
  const hits = filterItems(SAMPLE, { q: '哭' });
  assert.ok(hits.length >= 2);
  // '哭' 命中 desc(条目3) 和 tags(条目3) 和 desc(条目5)
  assert.equal(hits[0].id, 3, '分更高的排前面');

  // 无命中返回空数组（不是 null）
  assert.deepEqual(filterItems(SAMPLE, { q: '不存在的词' }), []);

  // 不存在的分类 → 空
  assert.deepEqual(filterItems(SAMPLE, { category: '没有这个分类' }), []);

  // 容错
  assert.deepEqual(filterItems(null), []);
  assert.deepEqual(filterItems(undefined, { q: 'x' }), []);
  assert.deepEqual(filterItems([null, undefined], { q: 'x' }), []);
}
console.log('✔ filterItems');

// ============ mergeResults ============
{
  const exact = [{ id: 2, face: '(-_-)', category: '无语', tags: [], desc: 'a' }];
  const semantic = [
    { id: 9, face: '(¬_¬)', category: '无语', tags: [], desc: 'b', score: 0.71 },
    { id: 2, face: '(-_-)', category: '无语', tags: [], desc: 'a', score: 0.66 },
    { id: 10, face: '(╯°□°）╯', category: '震惊', tags: [], desc: 'c', score: 0.63 },
  ];

  const merged = mergeResults(exact, semantic);
  assert.equal(merged.length, 3, '字面命中的那条不因也在语义结果里而重复出现');
  assert.deepEqual(merged.map((m) => m.id), [9, 2, 10], '按语义分降序');
  assert.equal(merged[0].viaSemantic, true);
  assert.equal(merged[0].alsoExact, false);
  // id 2 同时在两边：走语义位置，但标记 alsoExact
  const m2 = merged.find((m) => m.id === 2);
  assert.equal(m2.viaSemantic, true);
  assert.equal(m2.alsoExact, true, '字面也命中了，要标出来');

  // 只在字面里出现的
  const m3 = merged.find((m) => m.id === 10);
  assert.equal(m3.viaSemantic, true);

  // 纯字面、无语义结果
  const only = mergeResults(exact, []);
  assert.equal(only.length, 1);
  assert.equal(only[0].viaSemantic, false);
  assert.equal(only[0].alsoExact, false);

  // 纯语义
  const sem = mergeResults([], semantic);
  assert.equal(sem.length, 3);
  assert.ok(sem.every((m) => m.viaSemantic && !m.alsoExact));

  // limit 生效
  assert.equal(mergeResults(exact, semantic, { limit: 2 }).length, 2);
  assert.equal(mergeResults(SAMPLE, [], { limit: 3 }).length, 3);
  assert.equal(DEFAULT_LIMIT, 60);

  // 容错
  assert.deepEqual(mergeResults(null, null), []);
  assert.deepEqual(mergeResults(undefined, undefined), []);
  // null 项被跳过
  assert.equal(mergeResults([null, { id: 1, face: 'a' }], [null, { id: 2, face: 'b' }]).length, 2);

  // 语义侧自身有重复 id 时也要去重
  const dup = mergeResults([], [{ id: 1, face: 'a' }, { id: 1, face: 'a' }]);
  assert.equal(dup.length, 1, '语义结果内部重复也要去重');
}
console.log('✔ mergeResults');

// ============ dedupeByFace ============
{
  const items = [
    { id: 1, face: 'a' },
    { id: 2, face: 'b' },
    { id: 3, face: 'a' },
  ];
  const out = dedupeByFace(items);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((i) => i.face), ['a', 'b'], '保留首次出现的');
  assert.deepEqual(dedupeByFace([]), []);
  assert.deepEqual(dedupeByFace(null), []);
  assert.deepEqual(dedupeByFace([null, undefined]), []);
}
console.log('✔ dedupeByFace');

// ============ buildCategoryIndex ============
{
  const idx = buildCategoryIndex(SAMPLE);
  assert.equal(idx.length, 4, 'SAMPLE 里 4 个不同分类（疑惑/无语/哭泣/开心）');
  const crying = idx.find((c) => c.category === '哭泣');
  assert.equal(crying.count, 2, '哭泣有 2 条');
  // 排序稳定且按中文 locale
  const names = idx.map((c) => c.category);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')));

  assert.deepEqual(buildCategoryIndex([]), []);
  assert.deepEqual(buildCategoryIndex(null), []);
  // 缺 category 的条目被忽略
  assert.equal(buildCategoryIndex([{ id: 1 }, { id: 2, category: '开心' }]).length, 1);
}
console.log('✔ buildCategoryIndex');

// ============ highlightText ============
{
  assert.equal(highlightText('无语到不想说话', '无语'), '<mark>无语</mark>到不想说话');
  assert.equal(highlightText('abc', ''), 'abc', '无查询词不标记');
  assert.equal(highlightText('abc', null), 'abc');
  // 多次命中
  assert.equal(
    highlightText('无语无语', '无语'),
    '<mark>无语</mark><mark>无语</mark>',
    '多处命中都要标'
  );
  // 大小写不敏感
  assert.equal(highlightText('Hello World', 'world'), 'Hello <mark>World</mark>');
  // XSS：命中与未命中都要转义
  const h = highlightText('<img src=x onerror=alert(1)>', 'img');
  assert.ok(!h.includes('<img'), '命中标签被转义');
  assert.ok(h.includes('&lt;'), '转义生效');
  // 无命中时整体转义
  assert.equal(highlightText('<b>hi</b>', 'zzz'), '&lt;b&gt;hi&lt;/b&gt;');
  // 查询词本身含特殊字符
  assert.equal(highlightText('a<b', '<'), 'a<mark>&lt;</mark>b');
  // 空文本
  assert.equal(highlightText('', 'x'), '');
}
console.log('✔ highlightText');

// ============ formatScore ============
{
  assert.equal(formatScore(0.9), '很接近');
  assert.equal(formatScore(0.72), '很接近', '边界含');
  assert.equal(formatScore(0.71), '接近');
  assert.equal(formatScore(0.58), '接近', '边界含');
  assert.equal(formatScore(0.57), '有点像');
  assert.equal(formatScore(0.3), '有点像');
  assert.equal(formatScore(NaN), '', '非数字返回空串');
  assert.equal(formatScore(undefined), '');
  assert.equal(formatScore('0.8'), '很接近', '字符串数字');
}
console.log('✔ formatScore');

// ============ filterByScore ============
{
  const items = [{ id: 1, score: 0.9 }, { id: 2, score: 0.5 }, { id: 3, score: 0.2 }];
  assert.deepEqual(filterByScore(items).map((i) => i.id), [1, 2], '默认阈值 0.45');
  assert.deepEqual(filterByScore(items, 0.8).map((i) => i.id), [1]);
  assert.deepEqual(filterByScore(items, 0).map((i) => i.id), [1, 2, 3]);
  assert.deepEqual(filterByScore([]), []);
  assert.deepEqual(filterByScore(null), []);
  // 缺 score 字段 → NaN 比较为 false，被丢掉
  assert.deepEqual(filterByScore([{ id: 9 }]), []);
}
console.log('✔ filterByScore');

// ============ emptyHint ============
{
  assert.ok(emptyHint('').includes('选一个分类'));
  assert.ok(emptyHint('  ').includes('选一个分类'), '纯空白等同无查询');
  // 还没跑语义搜索时，引导用户把词说口语一点（语义搜索正是为这个准备的）
  assert.ok(emptyHint('不存在', false).includes('更口语'), '未跑语义时引导改说法');
  // 跑完语义仍无结果，才是真的没找到
  assert.ok(emptyHint('不存在', true).includes('换个说法'), '跑完语义仍无结果时的文案');
  assert.ok(emptyHint('无语').includes('无语'), '回显查询词');
  assert.ok(emptyHint('无语', true).includes('无语'));
  // 描述里的引号等不会被破坏结构
  assert.ok(emptyHint('<script>').length > 0);
}
console.log('✔ emptyHint');

// ============ SUGGESTIONS ============
{
  assert.ok(SUGGESTIONS.length >= 4);
  assert.ok(SUGGESTIONS.every((s) => typeof s === 'string' && s.length > 0));
  // 每条都应该足够长，能触发语义搜索
  assert.ok(SUGGESTIONS.every((s) => shouldRunSemantic(s)), '建议词都要能触发语义搜索');
  // 不重复
  assert.equal(new Set(SUGGESTIONS).size, SUGGESTIONS.length);
}
console.log('✔ SUGGESTIONS');

console.log('\n🎉 all kaomoji tests passed');
