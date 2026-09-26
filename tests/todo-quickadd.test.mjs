// Tests for legacy-tools/todo/js/quickadd.js
// 关注两件事：
//   1) 解析结果（标题 / 优先级 / 标签 / 截止）与原来 render.js 内联版一致
//   2) spans 精确指向原文里的日期、时间片段（输入框实时高亮靠它定位）
import assert from 'node:assert/strict';
import { analyzeQuickAdd } from '../legacy-tools/todo/js/quickadd.js';

const TODAY = new Date(2026, 8, 4); // 周五 00:00
const NOW = new Date(2026, 8, 4, 14, 30); // 「5分钟后」这类相对时间基于它
const ISO = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

let passed = 0;
function check(label, fn) {
    fn();
    console.log('✔', label);
    passed++;
}

// 断言 span 命中的是预期文字
function spanText(raw, span) {
    return raw.slice(span.start, span.end);
}
function findSpan(r, kind) {
    return r.spans.find((s) => s.kind === kind) || null;
}

// ============ 基本解析 ============
check('纯标题', () => {
    const r = analyzeQuickAdd('买菜', TODAY);
    assert.equal(r.title, '买菜');
    assert.equal(r.priority, 0);
    assert.deepEqual(r.tags, []);
    assert.equal(r.dueDate, null);
    assert.equal(r.dueTime, null);
    assert.deepEqual(r.spans, []);
});

check('空输入', () => {
    const r = analyzeQuickAdd('   ', TODAY);
    assert.equal(r.title, '');
    assert.deepEqual(r.spans, []);
});

// ============ 日期 / 时间 + span 定位 ============
check('明天下午3点 开会：span 指向原文', () => {
    const raw = '明天下午3点 开会';
    const r = analyzeQuickAdd(raw, TODAY);
    assert.equal(r.dueDate, ISO(2026, 9, 5));
    assert.equal(r.dueTime, '15:00');
    assert.equal(r.title, '开会');
    assert.equal(spanText(raw, findSpan(r, 'date')), '明天');
    assert.equal(spanText(raw, findSpan(r, 'time')), '下午3点');
});

check('5分钟后 喝水：相对时间同时给出日期和时间', () => {
    const raw = '5分钟后 喝水';
    const r = analyzeQuickAdd(raw, NOW);
    assert.equal(r.dueTime, '14:35');
    assert.equal(r.dueDate, ISO(2026, 9, 4));
    assert.equal(r.title, '喝水');
    assert.equal(spanText(raw, findSpan(r, 'time')), '5分钟后');
});

check('今天 15:30 报告：日期与时间不相邻也能分别定位', () => {
    const raw = '今天 15:30 报告';
    const r = analyzeQuickAdd(raw, TODAY);
    assert.equal(r.dueDate, ISO(2026, 9, 4));
    assert.equal(r.dueTime, '15:30');
    assert.equal(r.title, '报告');
    assert.equal(spanText(raw, findSpan(r, 'date')), '今天');
    assert.equal(spanText(raw, findSpan(r, 'time')), '15:30');
    // span 必须有序且不重叠
    assert.ok(r.spans[0].start < r.spans[1].start);
    assert.ok(r.spans[0].end <= r.spans[1].start);
});

check('时间在日期前面：3天后 5分钟后', () => {
    const raw = '3天后 5分钟后 体检';
    const r = analyzeQuickAdd(raw, TODAY);
    assert.equal(r.dueDate, ISO(2026, 9, 7));
    assert.equal(r.title, '体检');
    assert.equal(spanText(raw, findSpan(r, 'date')), '3天后');
    assert.equal(spanText(raw, findSpan(r, 'time')), '5分钟后');
});

check('裸「3点」不识别时间，span 为空且标题保留原文', () => {
    const raw = '3点 开会';
    const r = analyzeQuickAdd(raw, TODAY);
    assert.equal(r.dueTime, null);
    assert.equal(r.title, '3点 开会');
    assert.deepEqual(r.spans, []);
});

// ============ 标签：遮罩不能打乱 span 坐标 ============
check('#标签 + 日期 + 时间', () => {
    const raw = '明天#工作 下午3点 开会';
    const r = analyzeQuickAdd(raw, TODAY);
    assert.deepEqual(r.tags, ['工作']);
    assert.equal(r.dueDate, ISO(2026, 9, 5));
    assert.equal(r.dueTime, '15:00');
    assert.equal(r.title, '开会');
    // 关键：遮罩标签后 span 依然指向原文的正确位置
    assert.equal(spanText(raw, findSpan(r, 'date')), '明天');
    assert.equal(spanText(raw, findSpan(r, 'time')), '下午3点');
});

check('多个标签', () => {
    const r = analyzeQuickAdd('#a #b 买书', TODAY);
    assert.deepEqual(r.tags, ['a', 'b']);
    assert.equal(r.title, '买书');
});

// ============ 优先级 ============
check('优先级前缀 !!', () => {
    const r = analyzeQuickAdd('!! 重要 明天 交房租', TODAY);
    assert.equal(r.priority, 3);
    assert.equal(r.title, '重要 交房租');
    assert.equal(r.dueDate, ISO(2026, 9, 5));
});

check('优先级后缀 !', () => {
    const r = analyzeQuickAdd('买书 !', TODAY);
    assert.equal(r.priority, 2);
    assert.equal(r.title, '买书');
});

// ============ 边界 ============
check('前后空格不影响 span 坐标（必须相对未 trim 的原文）', () => {
    const raw = '  明天   开会  ';
    const r = analyzeQuickAdd(raw, TODAY);
    assert.equal(r.title, '开会');
    assert.equal(r.dueDate, ISO(2026, 9, 5));
    // 关键：坐标指向原串里真正的「明天」，而不是开头那两个空格
    assert.equal(spanText(raw, findSpan(r, 'date')), '明天');
});

check('纯日期没有标题时 title 为空', () => {
    const r = analyzeQuickAdd('明天', TODAY);
    assert.equal(r.title, '');
    assert.equal(r.dueDate, ISO(2026, 9, 5));
});

check('解析不会污染全局正则状态（连续两次调用结果一致）', () => {
    const a = analyzeQuickAdd('#x 明天 开会', TODAY);
    const b = analyzeQuickAdd('#x 明天 开会', TODAY);
    assert.deepEqual(a, b);
});

console.log(`\n共 ${passed} 项断言通过`);
