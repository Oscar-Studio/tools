// =====================================================
// 中文/数字 日期 + 时间 解析：从任务标题里识别日期/时间点。
// 用法：
//   const r = parseDateExpression(text);
//   r.matched   -> boolean（是否识别到日期）
//   r.date      -> 'YYYY-MM-DD' 或 null
//   r.time      -> 'HH:MM' 或 null
//   r.remaining -> 去掉日期/时间片段后剩余的标题
//
// 日期支持：
//   中文自然语言：今天 / 明天 / 后天 / 大后天 / 周X / 本周X / 下周X / 周末 / 下周末 / 月底 / 下月底
//   相对偏移：    N天后 / N周后 / N个月后
//   数字日期：    1月5日 / 1/5 / 1-5
//   绝对日期：    2026-09-04 / 2026/9/4 / 2026年9月4日 / 2026.9.4
//
// 时间支持（无前缀时拒绝，避免与版本号冲突）：
//   24h：HH:MM（9:00 / 15:30 / 23:59）
//   中文时段：上午|早上|清晨|中午|下午|晚上|夜里|凌晨 + N点 / N点半 / N点MM分 / N:MM
// =====================================================

function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function addMonthsKeepDay(d, n) {
    // 月份加减，保留「日」（自动夹到目标月最后一天）
    const x = new Date(d);
    const y = d.getFullYear();
    const m0 = d.getMonth();
    const targetMonthIdx = m0 + n;
    const ny = y + Math.floor(targetMonthIdx / 12);
    const nm = ((targetMonthIdx % 12) + 12) % 12;
    const dim = daysInMonth(ny, nm + 1);
    x.setFullYear(ny, nm, Math.min(d.getDate(), dim));
    return x;
}

function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
    if (m < 1 || m > 12) return 0;
    return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function makeDate(y, m, d) {
    if (m < 1 || m > 12) return null;
    const dim = daysInMonth(y, m);
    if (d < 1 || d > dim) return null;
    const x = new Date(y, m - 1, d);
    x.setHours(0, 0, 0, 0);
    return x;
}

// 推断年份：M/D 在今年若已过，则推到明年。
function inferYear(today, month, day) {
    const y = today.getFullYear();
    const candidate = makeDate(y, month, day);
    if (!candidate) return null;
    const t = startOfDay(today);
    if (candidate.getTime() < t.getTime()) return makeDate(y + 1, month, day);
    return candidate;
}

// 取下一个 weekday（0=周日 … 6=周六）；若今天就是目标日则跳到下周。
function nextWeekday(today, target) {
    const todayDay = today.getDay();
    let diff = target - todayDay;
    if (diff <= 0) diff += 7;
    return addDays(today, diff);
}

// 把命中片段前后的空白收掉，再合并为 remaining。
function spliceRemaining(text, start, end) {
    const before = text.slice(0, start);
    const after = text.slice(end);
    const leftTrimmed = before.replace(/\s+$/, '');
    const rightStart = after.search(/\S/);
    const rightTrimmed = rightStart === -1 ? '' : after.slice(rightStart);
    return (leftTrimmed + (leftTrimmed && rightTrimmed ? ' ' : '') + rightTrimmed).trim();
}

// 时段 → 24h 偏移。12 点为正午；其他时间按 12-hour clock 加 12。
function applyPeriod(h, period) {
    if (h < 1 || h > 12) return null;
    switch (period) {
        case '上午':
        case '早上':
        case '清晨':
        case '凌晨':
            return h; // 1-12 直接
        case '中午':
            // 中午 12 点 = 12:00；其他按字面（一般不写「中午3点」）
            return h === 12 ? 12 : h;
        case '下午':
        case '晚上':
        case '夜里':
            return h === 12 ? 12 : h + 12;
        default:
            return h;
    }
}

// 数字 / 中文数字 → 阿拉伯。接受 0-99。
const CN_NUM = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
function cnToInt(s) {
    if (s == null) return NaN;
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (s === '十') return 10;
    if (/^十.+$/.test(s)) {
        const a = CN_NUM[s[1]];
        return Number.isFinite(a) ? 10 + a : NaN;
    }
    if (/^.+十$/.test(s)) {
        const a = CN_NUM[s[0]];
        return Number.isFinite(a) ? a * 10 : NaN;
    }
    if (/^.+十.+$/.test(s)) {
        const a = CN_NUM[s[0]];
        const b = CN_NUM[s[2]];
        return (Number.isFinite(a) && Number.isFinite(b)) ? a * 10 + b : NaN;
    }
    if (/^[零一二两三四五六七八九]+$/.test(s)) {
        let n = 0;
        for (const ch of s) {
            const v = CN_NUM[ch];
            if (!Number.isFinite(v)) return NaN;
            n = n * 10 + v;
        }
        return n;
    }
    return NaN;
}

// 模式：按优先级排列，先匹配先用。
// 每个模式：regex + build(today, match) -> Date | null
const PATTERNS = [
    // ===== 绝对日期 =====
    {
        name: 'abs-cn',
        regex: /(\d{4})年(\d{1,2})月(\d{1,2})日?/,
        build: (_t, m) => makeDate(+m[1], +m[2], +m[3]),
    },
    {
        name: 'abs-sep',
        regex: /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
        build: (_t, m) => makeDate(+m[1], +m[2], +m[3]),
    },

    // ===== 中文自然语言（先于「周」单字，避免冲突）=====
    {
        name: 'today',
        regex: /今天/,
        build: (t) => startOfDay(t),
    },
    {
        name: 'tomorrow',
        regex: /明天/,
        build: (t) => addDays(startOfDay(t), 1),
    },
    {
        name: 'three-days-later',
        regex: /大后天/,
        build: (t) => addDays(startOfDay(t), 3),
    },
    {
        name: 'day-after-tomorrow',
        regex: /后天/,
        build: (t) => addDays(startOfDay(t), 2),
    },

    // 周末（先匹配「下周末」再匹配「周末」）
    {
        name: 'weekend-next',
        regex: /下周末/,
        build: (t) => nextWeekday(startOfDay(t), 6) && addDays(nextWeekday(startOfDay(t), 6), 7),
    },
    {
        name: 'weekend',
        regex: /周末/,
        build: (t) => nextWeekday(startOfDay(t), 6),
    },

    // 下周X / 本周X / 周X / 星期X / 礼拜X
    {
        name: 'next-weekday',
        regex: /下周([一二三四五六日天])/,
        build: (t, m) => {
            const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
            const target = map[m[1]];
            if (target == null) return null;
            const base = nextWeekday(startOfDay(t), target);
            return addDays(base, 7);
        },
    },
    {
        name: 'this-weekday',
        regex: /(?:本周|这周|周|星期|礼拜)([一二三四五六日天])/,
        build: (t, m) => {
            const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
            const target = map[m[1]];
            if (target == null) return null;
            return nextWeekday(startOfDay(t), target);
        },
    },

    // 月底 / 下月底
    {
        name: 'month-end-next',
        regex: /下月底/,
        build: (t) => {
            const y = t.getFullYear();
            const m = t.getMonth() + 2; // 下个月
            const ny = m > 12 ? y + 1 : y;
            const nm = ((m - 1) % 12) + 1;
            return new Date(ny, nm - 1, daysInMonth(ny, nm));
        },
    },
    {
        name: 'month-end',
        regex: /月底/,
        build: (t) => {
            const y = t.getFullYear();
            const m = t.getMonth() + 1;
            return new Date(y, m - 1, daysInMonth(y, m));
        },
    },

    // ===== 数字日期 / 中文日期（先于相对偏移，避免「1月」被误吃成「+1月」）=====
    {
        name: 'date-cn',
        regex: /(\d{1,2})月(\d{1,2})日?/,
        build: (t, m) => inferYear(t, +m[1], +m[2]),
    },
    {
        name: 'date-num',
        regex: /(?<!\d)(\d{1,2})[\/\-](\d{1,2})(?!\d)/,
        build: (t, m) => inferYear(t, +m[1], +m[2]),
    },

    // ===== 相对偏移（必须放在日期模式之后，避免被提前匹配）=====
    // 强制要求显式「后」/「之后」，避免误吃「请假3天」「13月」等。
    // 数字与单位之间允许空白（用户常写「3 天后」）。
    {
        name: 'rel-months',
        regex: /(\d+)\s*个?\s*月(?:之后|后)/,
        build: (t, m) => addMonthsKeepDay(startOfDay(t), +m[1]),
    },
    {
        name: 'rel-weeks',
        regex: /(\d+)\s*个?\s*周(?:之后|后)/,
        build: (t, m) => addDays(startOfDay(t), +m[1] * 7),
    },
    {
        name: 'rel-days',
        regex: /(\d+)\s*天(?:之后|后)/,
        build: (t, m) => addDays(startOfDay(t), +m[1]),
    },
];

// 时间模式：返回 { h, m } 或 null
// 时段词必须存在，避免误吃裸「3点」。
// 中文时段优先于 HH:MM，否则「下午3:30」会被 HH:MM 错配成 03:30。
const TIME_PATTERNS = [
    // 时段 + N点半（必须先于 N点 匹配）
    {
        name: 'cn-half',
        regex: /(上午|早上|清晨|中午|下午|晚上|夜里|凌晨)\s*(\d{1,2})\s*点半/,
        build: (m) => {
            const h = applyPeriod(+m[2], m[1]);
            if (h == null) return null;
            return { h, m: 30 };
        },
    },
    // 时段 + N点MM分 / N点
    {
        name: 'cn-full',
        regex: /(上午|早上|清晨|中午|下午|晚上|夜里|凌晨)\s*(\d{1,2})\s*点(?:(\d{1,2})\s*分)?/,
        build: (m) => {
            const h = applyPeriod(+m[2], m[1]);
            if (h == null) return null;
            const min = m[3] != null ? +m[3] : 0;
            if (min < 0 || min > 59) return null;
            return { h, m: min };
        },
    },
    // 时段 + N:MM
    {
        name: 'cn-colon',
        regex: /(上午|早上|清晨|中午|下午|晚上|夜里|凌晨)\s*(\d{1,2})\s*:\s*([0-5]\d)/,
        build: (m) => {
            const h = applyPeriod(+m[2], m[1]);
            if (h == null) return null;
            return { h, m: +m[3] };
        },
    },
    // HH:MM（24h，必须不在另一个数字/冒号之后或之前）—— 最后尝试
    {
        name: 'hhmm',
        regex: /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?![:\d])/,
        build: (m) => {
            const h = +m[1];
            const min = +m[2];
            if (h < 0 || h > 23 || min < 0 || min > 59) return null;
            return { h, m: min };
        },
    },
    // 「半小时后 / 半小时之后」= 30 分钟（独立模式，避免被「N小时」误吃为 30 小时）
    {
        name: 'rel-half-hour',
        regex: /半小时(?:之后|后)/,
        build: (_m, now) => {
            const d = new Date(now);
            d.setMinutes(d.getMinutes() + 30);
            return {
                time: formatHHMM({ h: d.getHours(), m: d.getMinutes() }),
                date: toISO(d),
            };
        },
    },
    // N分钟后（相对 now；同时设置 time 和 date，可能跨日）
    {
        name: 'rel-minutes-now',
        regex: /(\d+|[零一二两三四五六七八九]+)\s*个?\s*分钟(?:之后|后)/,
        build: (m, now) => {
            const n = cnToInt(m[1]);
            if (!Number.isFinite(n) || n <= 0) return null;
            const d = new Date(now);
            d.setMinutes(d.getMinutes() + n);
            return {
                time: formatHHMM({ h: d.getHours(), m: d.getMinutes() }),
                date: toISO(d),
            };
        },
    },
    // N小时后（相对 now；同时设置 time 和 date，可能跨日）
    {
        name: 'rel-hours-now',
        regex: /(\d+|[零一二两三四五六七八九]+)\s*个?\s*小时(?:之后|后)/,
        build: (m, now) => {
            const n = cnToInt(m[1]);
            if (!Number.isFinite(n) || n <= 0) return null;
            const d = new Date(now);
            d.setHours(d.getHours() + n);
            return {
                time: formatHHMM({ h: d.getHours(), m: d.getMinutes() }),
                date: toISO(d),
            };
        },
    },
];

function formatHHMM({ h, m }) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimeExpression(text, today = new Date()) {
    if (typeof text !== 'string' || !text) {
        return { matched: false, time: null, date: null, remaining: text || '' };
    }
    for (const pat of TIME_PATTERNS) {
        const m = text.match(pat.regex);
        if (!m) continue;
        let result;
        try {
            // rel-* 模式需要 now，其它模式忽略第二参
            result = pat.build.length >= 2 ? pat.build(m, today) : pat.build(m);
        } catch {
            continue;
        }
        if (!result) continue;
        // 普通模式返回 { h, m }；rel-* 模式返回 { time, date }
        if (typeof result.h === 'number') {
            return {
                matched: true,
                time: formatHHMM(result),
                date: null,
                pattern: pat.name,
                remaining: spliceRemaining(text, m.index, m.index + m[0].length),
            };
        }
        return {
            matched: true,
            time: result.time,
            date: result.date || null,
            pattern: pat.name,
            remaining: spliceRemaining(text, m.index, m.index + m[0].length),
        };
    }
    return { matched: false, time: null, date: null, remaining: text };
}

export function parseDateExpression(text, today = new Date()) {
    if (typeof text !== 'string' || !text) {
        return { matched: false, date: null, time: null, remaining: text || '' };
    }
    // 1) 日期
    let dateResult = { matched: false, date: null, remaining: text };
    for (const pat of PATTERNS) {
        const m = text.match(pat.regex);
        if (!m) continue;
        const base = startOfDay(today);
        let result;
        try {
            result = pat.build(base, m);
        } catch {
            continue;
        }
        if (!(result instanceof Date) || isNaN(result.getTime())) continue;
        dateResult = {
            matched: true,
            date: toISO(result),
            pattern: pat.name,
            remaining: spliceRemaining(text, m.index, m.index + m[0].length),
        };
        break;
    }
    // 2) 时间（无论日期是否命中都尝试一次）
    const timeResult = parseTimeExpression(dateResult.remaining, today);
    // rel-* 时间模式可以反推出 date（可能跨日），但只在 dateResult 没拿到日期时生效，
    // 否则「3天后 5分钟后」会被误改成今天。
    const finalDate = dateResult.date || timeResult.date;
    return {
        matched: dateResult.matched || timeResult.matched,
        date: finalDate,
        pattern: dateResult.pattern,
        time: timeResult.matched ? timeResult.time : null,
        timePattern: timeResult.matched ? timeResult.pattern : null,
        remaining: timeResult.matched ? timeResult.remaining : dateResult.remaining,
    };
}
