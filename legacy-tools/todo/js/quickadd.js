// =====================================================
// 快速添加解析：把一行输入拆成 标题 / 优先级 / 标签 / 截止日期 / 截止时间，
// 并额外返回每一段在**原文**中的位置（spans），供输入框做实时高亮。
//
// 关键点：所有中间步骤都用「等长遮罩」而不是删除字符，
// 这样 parseDateExpression 返回的 span 始终可以直接用于原文定位。
// ⚠️ datetime.js 本次改过（新增 span 返回值），import 必须带 ?v=，理由见 render.js 顶部。
// =====================================================

import { parseDateExpression } from './datetime.js?v=2026-09-26c';

const TAG_RE = /#([\p{L}\p{N}_\-]+)/gu;

// 把 #标签 收集出来，同时用等长空格遮罩，保证后续 span 仍是原文坐标
function maskTags(text) {
    const tags = [];
    const spans = [];
    let masked = '';
    let cursor = 0;
    TAG_RE.lastIndex = 0;
    let m;
    while ((m = TAG_RE.exec(text)) !== null) {
        tags.push(m[1]);
        spans.push([m.index, m.index + m[0].length]);
        masked += text.slice(cursor, m.index) + ' '.repeat(m[0].length);
        cursor = m.index + m[0].length;
    }
    masked += text.slice(cursor);
    return { tags, spans, masked };
}

// 删掉若干区间并折叠空白
function stripRanges(text, ranges) {
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    let out = '';
    let cursor = 0;
    for (const [start, end] of sorted) {
        if (start < cursor) continue;
        out += text.slice(cursor, start);
        cursor = end;
    }
    out += text.slice(cursor);
    return out.replace(/\s+/g, ' ').trim();
}

// 优先级标记：!! = 高 / ! = 中，可出现在标题首或尾
function stripPriority(text) {
    const head = text.match(/^(!!|!)\s+(.+)$/);
    if (head) return { priority: head[1] === '!!' ? 3 : 2, title: head[2] };
    const tail = text.match(/^(.+?)\s+(!!|!)\s*$/);
    if (tail) return { priority: tail[2] === '!!' ? 3 : 2, title: tail[1] };
    return { priority: 0, title: text };
}

/**
 * 解析快速添加输入。
 * @param {string} raw
 * @param {Date}   [today] 仅测试用，注入「今天」以获得确定性结果
 * @returns {{title:string, priority:number, tags:string[], dueDate:string|null,
 *            dueTime:string|null, spans:{start:number,end:number,kind:'date'|'time'}[]}}
 */
export function analyzeQuickAdd(raw, today = new Date()) {
    // 注意：这里**不** trim 输入。spans 要能直接用于切原始输入串做高亮，
    // 一旦先 trim，坐标就会和输入框里的真实文本错开。
    // 空白由 stripRanges 统一折叠、标题两端由它 trim 掉。
    const text = String(raw == null ? '' : raw);
    const empty = { title: '', priority: 0, tags: [], dueDate: null, dueTime: null, spans: [] };
    if (!text.trim()) return empty;

    // 1) 标签（等长遮罩）
    const { tags, spans: tagSpans, masked } = maskTags(text);

    // 2) 日期 + 时间（在同一坐标系里定位）
    const r = parseDateExpression(masked, today);
    const spans = [];
    if (r.dateSpan) spans.push({ start: r.dateSpan[0], end: r.dateSpan[1], kind: 'date' });
    if (r.timeSpan) spans.push({ start: r.timeSpan[0], end: r.timeSpan[1], kind: 'time' });
    spans.sort((a, b) => a.start - b.start);

    // 3) 标题 = 原文去掉「标签 + 日期 + 时间」片段
    const title = stripPriority(stripRanges(text, [
        ...tagSpans,
        ...spans.map((s) => [s.start, s.end]),
    ]));

    return {
        title: title.title,
        priority: title.priority,
        tags,
        dueDate: r.date || null,
        dueTime: r.time || null,
        spans,
    };
}
