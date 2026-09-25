// Tests for legacy-tools/todo/js/datetime.js
import assert from 'node:assert/strict';
import { parseDateExpression, parseTimeExpression } from '../legacy-tools/todo/js/datetime.js';

// 固定一个「今天」便于断言：2026-09-04 是周五
const TODAY = new Date(2026, 8, 4); // 月份 0-based: 8 = 九月
const ISO = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

let passed = 0;
function check(label, fn) {
    fn();
    console.log('✔', label);
    passed++;
}
function checkThrows(label, fn) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert.equal(threw, true);
    console.log('✔', label);
    passed++;
}

// ============ 中文自然语言 ============
check('今天', () => {
    const r = parseDateExpression('今天 买菜', TODAY);
    assert.equal(r.matched, true);
    assert.equal(r.date, ISO(2026, 9, 4));
    assert.equal(r.remaining, '买菜');
});

check('明天', () => {
    const r = parseDateExpression('明天下午开会', TODAY);
    assert.equal(r.date, ISO(2026, 9, 5));
    assert.equal(r.remaining, '下午开会');
});

check('后天', () => {
    const r = parseDateExpression('后天跑步', TODAY);
    assert.equal(r.date, ISO(2026, 9, 6));
});

check('大后天', () => {
    const r = parseDateExpression('大后天交房租', TODAY);
    assert.equal(r.date, ISO(2026, 9, 7));
});

// 周X：今天是周五，下个周一 = 2026-09-07
check('周一（下一次）', () => {
    const r = parseDateExpression('周一 开会', TODAY);
    assert.equal(r.date, ISO(2026, 9, 7));
    assert.equal(r.remaining, '开会');
});

check('周日（下一次）', () => {
    const r = parseDateExpression('周日 休息', TODAY);
    assert.equal(r.date, ISO(2026, 9, 6));
});

check('本周三', () => {
    // 今天 9/4 周五，本周三 9/9
    const r = parseDateExpression('本周三 体检', TODAY);
    assert.equal(r.date, ISO(2026, 9, 9));
});

check('下周X', () => {
    const r = parseDateExpression('下周三 review', TODAY);
    assert.equal(r.date, ISO(2026, 9, 16));
});

check('星期X', () => {
    const r = parseDateExpression('星期五 发工资', TODAY);
    // 今天已是周五，下个周五 9/11
    assert.equal(r.date, ISO(2026, 9, 11));
});

check('礼拜X', () => {
    const r = parseDateExpression('礼拜一 跑10公里', TODAY);
    assert.equal(r.date, ISO(2026, 9, 7));
});

check('周末（今天周五，下个周六 = 9/5）', () => {
    const r = parseDateExpression('周末 露营', TODAY);
    assert.equal(r.date, ISO(2026, 9, 5));
});

check('下周末', () => {
    const r = parseDateExpression('下周末 露营', TODAY);
    assert.equal(r.date, ISO(2026, 9, 12));
});

check('月底（9 月共 30 天）', () => {
    const r = parseDateExpression('月底 报销', TODAY);
    assert.equal(r.date, ISO(2026, 9, 30));
});

check('下月底（10 月共 31 天）', () => {
    const r = parseDateExpression('下月底 报销', TODAY);
    assert.equal(r.date, ISO(2026, 10, 31));
});

// ============ 相对偏移 ============
check('3天后', () => {
    const r = parseDateExpression('3天后 提交', TODAY);
    assert.equal(r.date, ISO(2026, 9, 7));
    assert.equal(r.remaining, '提交');
});

check('2周后', () => {
    const r = parseDateExpression('2周后 出差', TODAY);
    assert.equal(r.date, ISO(2026, 9, 18));
});

check('1个月后（保留日）', () => {
    const r = parseDateExpression('1个月后 复诊', TODAY);
    assert.equal(r.date, ISO(2026, 10, 4));
});

check('3月之后（带「之」）', () => {
    const r = parseDateExpression('3月之后 复诊', TODAY);
    assert.equal(r.date, ISO(2026, 12, 4));
});

// ============ 数字日期 ============
check('1/5（未过今年 1/5 → 已过 → 推至明年）', () => {
    const r = parseDateExpression('1/5 续费', TODAY);
    assert.equal(r.date, ISO(2027, 1, 5));
});

check('12/25（未过）', () => {
    const r = parseDateExpression('12/25 圣诞', TODAY);
    assert.equal(r.date, ISO(2026, 12, 25));
});

check('1-5', () => {
    const r = parseDateExpression('1-5 续费', TODAY);
    assert.equal(r.date, ISO(2027, 1, 5));
});

check('1/5', () => {
    const r = parseDateExpression('1/5 续费', TODAY);
    assert.equal(r.date, ISO(2027, 1, 5));
});

check('1月5日', () => {
    const r = parseDateExpression('1月5日 续费', TODAY);
    assert.equal(r.date, ISO(2027, 1, 5));
});

check('12月25日', () => {
    const r = parseDateExpression('12月25日 圣诞', TODAY);
    assert.equal(r.date, ISO(2026, 12, 25));
});

check('不破坏数字编号（"v1.5" 不被吃成日期）', () => {
    const r = parseDateExpression('升级到 v1.5', TODAY);
    assert.equal(r.matched, false);
    assert.equal(r.remaining, '升级到 v1.5');
});

// ============ 绝对日期 ============
check('2026-09-04', () => {
    const r = parseDateExpression('2026-09-04 提交', TODAY);
    assert.equal(r.date, ISO(2026, 9, 4));
    assert.equal(r.remaining, '提交');
});

check('2026/9/4', () => {
    const r = parseDateExpression('2026/9/4 生日', TODAY);
    assert.equal(r.date, ISO(2026, 9, 4));
});

check('2026.9.4', () => {
    const r = parseDateExpression('2026.9.4', TODAY);
    assert.equal(r.date, ISO(2026, 9, 4));
});

check('2026年9月4日', () => {
    const r = parseDateExpression('2026年9月4日 报到', TODAY);
    assert.equal(r.date, ISO(2026, 9, 4));
    assert.equal(r.remaining, '报到');
});

// ============ 与优先级 / #标签协同 ============
check('明天下午3点 开会（日期 + 时间都被识别）', () => {
    const r = parseDateExpression('明天下午3点 开会', TODAY);
    assert.equal(r.date, ISO(2026, 9, 5));
    assert.equal(r.time, '15:00');
    assert.equal(r.remaining, '开会');
});

check('非法月份', () => {
    const r = parseDateExpression('13月5日', TODAY);
    assert.equal(r.matched, false);
    assert.equal(r.remaining, '13月5日');
});

check('空字符串', () => {
    const r = parseDateExpression('', TODAY);
    assert.equal(r.matched, false);
});

check('null 输入安全返回', () => {
    // parseDateExpression 对 null 安全返回
    const r = parseDateExpression(null, TODAY);
    assert.equal(r.matched, false);
});

// ============ 时间点：HH:MM（24h） ============
check('时间 15:30', () => {
    const r = parseDateExpression('15:30 开会', TODAY);
    assert.equal(r.matched, true); // 时间命中
    assert.equal(r.date, null);    // 但无日期
    assert.equal(r.time, '15:30');
    assert.equal(r.remaining, '开会');
});

check('时间 9:00（个位数小时）', () => {
    const r = parseDateExpression('9:00 跑步', TODAY);
    assert.equal(r.time, '09:00');
    assert.equal(r.remaining, '跑步');
});

check('时间 23:59', () => {
    const r = parseDateExpression('23:59 跨年', TODAY);
    assert.equal(r.time, '23:59');
});

check('时间 24:00（拒绝，HH 越界）', () => {
    const r = parseDateExpression('24:00', TODAY);
    assert.equal(r.time, null);
});

check('时间 12:60（拒绝，MM 越界）', () => {
    const r = parseDateExpression('12:60', TODAY);
    assert.equal(r.time, null);
});

// ============ 中文时段 ============
check('下午3点', () => {
    const r = parseDateExpression('下午3点 开会', TODAY);
    assert.equal(r.time, '15:00');
    assert.equal(r.remaining, '开会');
});

check('上午10点半', () => {
    const r = parseDateExpression('上午10点半 体检', TODAY);
    assert.equal(r.time, '10:30');
    assert.equal(r.remaining, '体检');
});

check('晚上9点', () => {
    const r = parseDateExpression('晚上9点 加班', TODAY);
    assert.equal(r.time, '21:00');
});

check('中午12点', () => {
    const r = parseDateExpression('中午12点 午饭', TODAY);
    assert.equal(r.time, '12:00');
});

check('下午12点（按 noon）', () => {
    const r = parseDateExpression('下午12点', TODAY);
    assert.equal(r.time, '12:00');
});

check('早上9点', () => {
    const r = parseDateExpression('早上9点 起床', TODAY);
    assert.equal(r.time, '09:00');
});

check('下午3:30', () => {
    const r = parseDateExpression('下午3:30 出发', TODAY);
    assert.equal(r.time, '15:30');
    assert.equal(r.remaining, '出发');
});

check('下午3点30分', () => {
    const r = parseDateExpression('下午3点30分 出发', TODAY);
    assert.equal(r.time, '15:30');
});

check('凌晨1点', () => {
    const r = parseDateExpression('凌晨1点 值班', TODAY);
    assert.equal(r.time, '01:00');
});

check('夜里11点', () => {
    const r = parseDateExpression('夜里11点 睡觉', TODAY);
    assert.equal(r.time, '23:00');
});

// ============ 拒绝裸时间 ============
check('裸「3点」（拒绝，避免歧义）', () => {
    const r = parseDateExpression('3点 开会', TODAY);
    assert.equal(r.time, null);
    assert.equal(r.remaining, '3点 开会');
});

check('裸「15」无冒号（拒绝）', () => {
    const r = parseDateExpression('15 开会', TODAY);
    assert.equal(r.time, null);
});

// ============ 日期 + 时间组合 ============
check('明天下午3点', () => {
    const r = parseDateExpression('明天下午3点 开会', TODAY);
    assert.equal(r.date, ISO(2026, 9, 5));
    assert.equal(r.time, '15:00');
    assert.equal(r.remaining, '开会');
});

check('今天 15:30', () => {
    const r = parseDateExpression('今天 15:30 报告', TODAY);
    assert.equal(r.date, ISO(2026, 9, 4));
    assert.equal(r.time, '15:30');
    assert.equal(r.remaining, '报告');
});

check('3天后 10:00', () => {
    const r = parseDateExpression('3天后 10:00 提交', TODAY);
    assert.equal(r.date, ISO(2026, 9, 7));
    assert.equal(r.time, '10:00');
});

check('下周三 上午9点', () => {
    const r = parseDateExpression('下周三 上午9点 体检', TODAY);
    assert.equal(r.date, ISO(2026, 9, 16));
    assert.equal(r.time, '09:00');
    assert.equal(r.remaining, '体检');
});

// ============ 时间独立 API ============
check('parseTimeExpression 直接调用', () => {
    const r = parseTimeExpression('下午3点半');
    assert.equal(r.matched, true);
    assert.equal(r.time, '15:30');
});

check('parseTimeExpression 无匹配', () => {
    const r = parseTimeExpression('开会');
    assert.equal(r.matched, false);
    assert.equal(r.time, null);
    assert.equal(r.remaining, '开会');
});

// ============ 相对 now 时间：N分钟后 / N小时后 ============
// 用一个固定 now 便于断言：2026-09-05 14:30:00
const NOW = new Date(2026, 8, 5, 14, 30, 0);
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

check('一分钟后 喝水（中文数字）', () => {
    const r = parseDateExpression('一分钟后 喝水', NOW);
    assert.equal(r.matched, true);
    assert.equal(r.date, isoDate(NOW));
    assert.equal(r.time, hhmm(new Date(NOW.getTime() + 1 * 60 * 1000)));
    assert.equal(r.remaining, '喝水');
});

check('3分钟后', () => {
    const r = parseDateExpression('3分钟后 提醒', NOW);
    assert.equal(r.date, isoDate(NOW));
    assert.equal(r.time, '14:33');
    assert.equal(r.remaining, '提醒');
});

check('10分钟后', () => {
    const r = parseDateExpression('10分钟后', NOW);
    assert.equal(r.time, '14:40');
});

check('半小时后', () => {
    const r = parseDateExpression('半小时后 吃饭', NOW);
    assert.equal(r.date, isoDate(NOW));
    assert.equal(r.time, '15:00');
});

check('1小时后 开会（跨小时）', () => {
    const r = parseDateExpression('1小时后 开会', NOW);
    assert.equal(r.date, isoDate(NOW));
    assert.equal(r.time, '15:30');
});

check('5小时后', () => {
    const r = parseDateExpression('5小时后', NOW);
    assert.equal(r.time, '19:30');
});

check('10小时后（跨日）', () => {
    const r = parseDateExpression('10小时后 吃药', NOW);
    assert.equal(r.date, isoDate(new Date(2026, 8, 6))); // 明天
    assert.equal(r.time, '00:30');
    assert.equal(r.remaining, '吃药');
});

check('两小时后（中文数字 2）', () => {
    const r = parseDateExpression('两小时后', NOW);
    assert.equal(r.time, '16:30');
});

check('3天后 5分钟后（日期+时间独立计算）', () => {
    // 注意：5分钟后基于 NOW，不基于 3 天后。这里文档化这种行为。
    const r = parseDateExpression('3天后 5分钟后', NOW);
    assert.equal(r.date, ISO(2026, 9, 8)); // 3 天后
    assert.equal(r.time, '14:35'); // 5 分钟基于 NOW
});

check('时间紧贴句首', () => {
    const r = parseDateExpression('1分钟后 起身', NOW);
    assert.equal(r.time, '14:31');
    assert.equal(r.remaining, '起身');
});

check('0分钟后（拒绝，n 必须 > 0）', () => {
    const r = parseDateExpression('0分钟后', NOW);
    assert.equal(r.time, null);
});

// ============ 数字与单位之间允许空格 ============
check('5 分钟后写数学作业（带空格）', () => {
    const r = parseDateExpression('5 分钟后写数学作业', NOW);
    assert.equal(r.time, '14:35');
    assert.equal(r.remaining, '写数学作业');
});

check('3 天后（带空格）', () => {
    const r = parseDateExpression('3 天后 体检', TODAY);
    assert.equal(r.date, ISO(2026, 9, 7));
    assert.equal(r.remaining, '体检');
});

check('2 小时后（带空格）', () => {
    const r = parseDateExpression('2 小时后', NOW);
    assert.equal(r.time, '16:30');
});

check('下午 3点（时段与数字间空格）', () => {
    const r = parseDateExpression('下午 3点 开会', TODAY);
    assert.equal(r.time, '15:00');
});

check('下午3:30（数字与冒号间空格）', () => {
    const r = parseDateExpression('下午3 : 30 出发', TODAY);
    assert.equal(r.time, '15:30');
});

console.log(`\n共 ${passed} 项断言通过`);
