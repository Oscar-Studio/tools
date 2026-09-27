// =====================================================
// 正则表达式工作台 —— 纯逻辑层
// 本文件不触碰任何 DOM，Node 测试直接 import。
// UI 侧（app.js）只负责事件绑定与渲染，判定逻辑全在这里。
// =====================================================

/** 单次匹配最多收集多少条，避免大文本 + g 标志把页面拖死 */
export const MAX_MATCHES = 500;

/** 合法 flag 白名单 + 界面释义（顺序即展示顺序） */
export const FLAG_INFO = [
  { flag: 'g', label: '全局', desc: '查找所有匹配，而不是命中第一个就停' },
  { flag: 'i', label: '忽略大小写', desc: 'A 与 a 视为同一个字符' },
  { flag: 'm', label: '多行', desc: '^ 和 $ 匹配每一行的行首 / 行尾' },
  { flag: 's', label: '跨行', desc: '「.」也能匹配换行符' },
  { flag: 'u', label: 'Unicode', desc: '按码点处理，emoji 和 \\u{...} 才正确' },
  { flag: 'y', label: '粘性', desc: '只从 lastIndex 所在位置开始匹配' },
];

const VALID_FLAGS = new Set(FLAG_INFO.map((f) => f.flag));

/** 过滤掉非法 / 重复 flag，返回规范化后的字符串 */
export function normalizeFlags(raw) {
  const out = [];
  for (const ch of String(raw ?? '')) {
    if (VALID_FLAGS.has(ch) && !out.includes(ch)) out.push(ch);
  }
  return out.join('');
}

/**
 * 编译正则。永不抛错，失败时返回 { ok: false, error }。
 * 非法 flag 会被静默丢弃（normalizeFlags），非法 pattern 走 error 分支。
 */
export function buildRegex(source, flags) {
  const src = String(source ?? '');
  const f = normalizeFlags(flags);
  try {
    return { ok: true, regex: new RegExp(src, f), error: null };
  } catch (err) {
    return { ok: false, regex: null, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * 数捕获组个数。
 * 注意：RegExp 实例**没有** numberOfCapturingGroups 这个标准属性
 * （Node / 浏览器上都返回 undefined），所以不能直接读。
 * 这里的办法是给源码追加一个恒匹配的空分支 `|`，exec 一次后
 * match.length - 1 就是捕获组数——追加顶层分支不影响原有组编号。
 */
export function countCapturingGroups(regex) {
  try {
    const probe = new RegExp(`${regex.source}|`, regex.flags);
    const m = probe.exec('');
    return m ? Math.max(0, m.length - 1) : 0;
  } catch {
    return 0;
  }
}

/**
 * 收集匹配项。永远基于一个「新建的全局 RegExp」迭代，
 * 不修改调用方传入的 regex.lastIndex（无副作用）。
 *
 * 返回 { matches, truncated, groupCount }：
 * - matches[i] = { index, end, text, groups: [{ index, name, text }] }
 *   text 为 null 表示该分组未参与匹配。
 * - truncated = true 表示命中条数超过 limit，结果不完整。
 */
export function collectMatches(regex, text, { limit = MAX_MATCHES } = {}) {
  const str = String(text ?? '');
  const groupCount = countCapturingGroups(regex);
  const matches = [];

  // 迭代必须带 g；带 y 时 sticky 优先，语义退化为「从 lastIndex 连续匹配」，可接受。
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const re = new RegExp(regex.source, flags);

  const cap = Math.max(1, Number(limit) || MAX_MATCHES);
  while (matches.length < cap) {
    const m = re.exec(str);
    if (m === null) break;
    matches.push(toMatchObj(m, groupCount));

    // 零长匹配（如 /a*/ 末尾）不会推进 lastIndex，必须手动前进，否则死循环。
    if (m[0] === '') {
      const last = re.lastIndex;
      if (last >= str.length) break;
      if (regex.flags.includes('u')) {
        // 带 u 时按码点前进，否则会把 emoji 的代理对切成两半
        re.lastIndex = str.codePointAt(last) > 0xffff ? last + 2 : last + 1;
      } else {
        re.lastIndex = last + 1;
      }
    }
  }

  // 触顶时探测是否还有更多匹配，用于提示「已截断」
  let truncated = false;
  if (matches.length >= cap) {
    const probe = new RegExp(re.source, re.flags);
    probe.lastIndex = re.lastIndex;
    truncated = probe.exec(str) !== null;
  }

  return { matches, truncated, groupCount };
}

function toMatchObj(m, groupCount) {
  const groups = [];
  for (let i = 1; i <= groupCount; i++) {
    groups.push({ index: i, name: null, text: m[i] ?? null });
  }
  if (m.groups) {
    for (const [name, val] of Object.entries(m.groups)) {
      groups.push({ index: null, name, text: val ?? null });
    }
  }
  return { index: m.index, end: m.index + m[0].length, text: m[0], groups };
}

/** HTML 转义。高亮片段拼 innerHTML 前必须过这一层 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 展开替换模板，支持 $& $$ $1..$99 $<name>。
 * 手写而非依赖 String.replace，是为了能对单条 match 单独求值（高亮预览需要）。
 */
export function expandReplacement(match, replacement) {
  const rep = String(replacement ?? '');
  let out = '';

  for (let i = 0; i < rep.length; i++) {
    const ch = rep[i];
    if (ch !== '$') {
      out += ch;
      continue;
    }

    const next = rep[i + 1];
    if (next === undefined) {
      out += '$'; // 结尾的裸 $ 原样保留
      break;
    }
    if (next === '$') {
      out += '$';
      i++;
      continue;
    }
    if (next === '&') {
      out += match.text;
      i++;
      continue;
    }
    if (next === '<') {
      const close = rep.indexOf('>', i + 2);
      if (close === -1) {
        out += ch; // 没有闭合的 >，当普通字符
        continue;
      }
      const name = rep.slice(i + 2, close);
      const g = match.groups.find((x) => x.name === name);
      out += g && g.text != null ? g.text : '';
      i = close;
      continue;
    }

    if (next >= '0' && next <= '9') {
      const d1 = Number(next);
      // JS 语义：分组从 1 开始，$0 不是合法引用，原样保留
      if (d1 === 0) {
        out += '$0';
        i++;
        continue;
      }
      // 优先尝试两位（$12），越界时退回一位（$1）
      const after = rep[i + 2];
      let num = d1;
      let consumed = 1;
      if (after >= '0' && after <= '9') {
        const two = d1 * 10 + Number(after);
        if (two >= 1 && two <= match.groups.length) {
          num = two;
          consumed = 2;
        }
      }
      const g = match.groups.find((x) => x.index === num);
      out += g && g.text != null ? g.text : '';
      i += consumed;
      continue;
    }

    out += ch; // $ 后跟其它字符，视作字面量
  }

  return out;
}

/**
 * 生成高亮 HTML。
 * replacement 为 null → 展示原文并高亮命中片段；
 * 否则展示「替换后的结果」，命中处换成替换文本并加 mark-replaced 类。
 * 返回值已全量转义，可直接赋给 innerHTML。
 */
export function renderHighlight(text, matches, { replacement = null } = {}) {
  const str = String(text ?? '');
  if (!matches.length) return escapeHtml(str);

  let html = '';
  let cursor = 0;

  for (const m of matches) {
    if (m.index < cursor) continue; // 理论不会发生（exec 不产生重叠），防御
    if (m.index > cursor) html += escapeHtml(str.slice(cursor, m.index));

    const inner =
      replacement === null
        ? escapeHtml(m.text)
        : escapeHtml(expandReplacement(m, replacement));
    const cls = replacement === null ? 'mark' : 'mark mark-replaced';
    // 零长匹配 inner 为空，用不换行空格占位，否则看不到标记
    html += `<mark class="${cls}">${inner || '&nbsp;'}</mark>`;

    cursor = m.end;
  }

  if (cursor < str.length) html += escapeHtml(str.slice(cursor));
  return html;
}

/** 用浏览器原生 replace 跑一次全量替换（拿最终结果文本，不只要高亮） */
export function replaceAll(text, regex, replacement, { limit = MAX_MATCHES } = {}) {
  const str = String(text ?? '');
  const groupCount = countCapturingGroups(regex);
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const re = new RegExp(regex.source, flags);
  let count = 0;

  const out = str.replace(re, (matched, ...rest) => {
    count++;
    // 超过上限的命中原样保留（不做替换），避免超大文本被一次性改写
    if (count > limit) return matched;
    // String.replace 的回调签名是 (match, p1..pN, offset, string, groups)
    const groups = [];
    for (let i = 0; i < groupCount; i++) {
      groups.push({ index: i + 1, name: null, text: rest[i] ?? null });
    }
    // groups 前面还有 offset 和 string 两个参数，所以下标是 groupCount + 2
    const named = rest[groupCount + 2];
    if (named && typeof named === 'object') {
      for (const [name, val] of Object.entries(named)) {
        groups.push({ index: null, name, text: val ?? null });
      }
    }
    return expandReplacement({ text: matched, groups }, replacement);
  });

  return { output: out, count: Math.min(count, limit), truncated: count > limit };
}

/** 分享链接：把 pattern + flags 编进 hash，便于把一条正则发给同事 */
export function encodeState(source, flags) {
  const f = normalizeFlags(flags);
  const p = String(source ?? '');
  return (p ? `p=${encodeURIComponent(p)}` : '') + (p && f ? '&' : '') + (f ? `f=${f}` : '');
}

export function decodeState(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const out = { source: '', flags: '' };
  if (!raw) return out;
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    const val = part.slice(eq + 1);
    if (key === 'p') {
      try {
        out.source = decodeURIComponent(val);
      } catch {
        out.source = val; // 非法百分号编码时退回原值
      }
    } else if (key === 'f') {
      out.flags = normalizeFlags(val);
    }
  }
  return out;
}

/** 常用片段库。pattern 均为可直接使用的合法正则 */
export const SNIPPETS = [
  {
    group: '网络',
    items: [
      {
        label: '邮箱',
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        flags: 'gi',
        note: '不含特殊保留域名，日常够用',
      },
      {
        label: 'URL',
        pattern: 'https?:\\/\\/[^\\s<>"\'\\)]+',
        flags: 'gi',
        note: '到空白或尖括号为止',
      },
      {
        label: 'IPv4',
        pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b',
        flags: 'g',
        note: '带 0-255 范围校验',
      },
    ],
  },
  {
    group: '中文常用',
    items: [
      {
        label: '手机号',
        pattern: '\\b1[3-9]\\d{9}\\b',
        flags: 'g',
        note: '中国大陆 11 位号段',
      },
      {
        label: '身份证',
        pattern: '\\b[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]\\b',
        flags: 'g',
        note: '18 位，带校验位（不含校验码验证）',
      },
      {
        label: '日期',
        pattern: '\\b\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])\\b',
        flags: 'g',
        note: 'YYYY-MM-DD',
      },
      {
        label: '中文字符',
        pattern: '[\\u4e00-\\u9fa5]+',
        flags: 'g',
        note: '连续汉字片段',
      },
    ],
  },
  {
    group: '文本清洗',
    items: [
      {
        label: '去 HTML 标签',
        pattern: '<[^>]*>',
        flags: 'g',
        replacement: '',
        note: '配「替换为」留空即可实现清洗',
      },
      {
        label: '重复词',
        pattern: '\\b([A-Za-z]+)\\s+\\1\\b',
        flags: 'gi',
        note: '找出 "the the" 这类笔误',
      },
      {
        label: '空白行',
        pattern: '^[ \\t]*$\\n?',
        flags: 'gm',
        replacement: '',
        note: '清理多余空行',
      },
      {
        label: 'Markdown 标题',
        pattern: '^#{1,6}\\s+(.+)$',
        flags: 'gm',
        note: '1~6 级 ATX 标题',
      },
      {
        label: '十六进制颜色',
        pattern: '#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\\b',
        flags: 'g',
        note: '#RGB / #RGBA / #RRGGBB',
      },
    ],
  },
];

/**
 * 示例文本 + 示例正则：新用户进来就有东西可看。
 * 刻意配一条「带月日范围校验」的日期正则，好演示非法日期不会被匹配。
 */
export const SAMPLE_PATTERN = '(\\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])';
export const SAMPLE_FLAGS = 'g';
export const SAMPLE_TEXT = `发布记录
2026-03-01 完成工具站首版上线
2026-05-14 待办清单支持云端同步
2026-09-27 新增正则工作台与图片压缩器
无效日期：2026-13-45 与 26-1-1 不应被匹配`;
