// 正则表达式工作台测试：覆盖 regex-core.js 全部纯函数（不依赖 DOM）。
import assert from 'node:assert/strict';

import {
  MAX_MATCHES,
  FLAG_INFO,
  SNIPPETS,
  SAMPLE_TEXT,
  SAMPLE_PATTERN,
  SAMPLE_FLAGS,
  buildRegex,
  collectMatches,
  countCapturingGroups,
  encodeState,
  decodeState,
  escapeHtml,
  expandReplacement,
  normalizeFlags,
  renderHighlight,
  replaceAll,
} from '../legacy-tools/regex/js/regex-core.js';

// ============ normalizeFlags ============
{
  assert.equal(normalizeFlags('gimsu'), 'gimsu', '合法 flag 原样保留');
  assert.equal(normalizeFlags('gg'), 'g', '重复 flag 去重');
  assert.equal(normalizeFlags('gzx'), 'g', '非法 flag 静默丢弃');
  assert.equal(normalizeFlags(''), '', '空串安全');
  assert.equal(normalizeFlags(null), '', 'null 安全');
  assert.equal(normalizeFlags(undefined), '', 'undefined 安全');
  // 白名单必须覆盖界面展示的所有 flag
  assert.deepEqual(
    FLAG_INFO.map((f) => f.flag).join(''),
    'gim suy'.replace(/\s/g, ''),
    'FLAG_INFO 的 flag 与白名单一致'
  );
}
console.log('✔ normalizeFlags');

// ============ buildRegex ============
{
  const ok = buildRegex('a+b', 'g');
  assert.equal(ok.ok, true);
  assert.ok(ok.regex instanceof RegExp);
  assert.equal(ok.error, null);

  // 非法 pattern 不抛错，走 error 分支
  for (const bad of ['[', '(', 'a{2,1}', '\\']) {
    const r = buildRegex(bad, 'g');
    assert.equal(r.ok, false, `"${bad}" 应该编译失败`);
    assert.equal(r.regex, null);
    assert.ok(r.error && r.error.length > 0, 'error 消息非空');
  }

  // 空 pattern 合法（能匹配一切）
  assert.equal(buildRegex('', 'g').ok, true);

  // 非法 flag 不会让编译失败，只是被剔除
  assert.equal(buildRegex('a', 'gzx').ok, true);
  assert.equal(buildRegex('a', 'gzx').regex.flags, 'g');
}
console.log('✔ buildRegex');

// ============ collectMatches：基础 ============
{
  // 直接用共享的示例常量，避免测试里的 pattern 和工具里的示例各写一份而漂移
  const { regex } = buildRegex(SAMPLE_PATTERN, SAMPLE_FLAGS);
  const { matches, groupCount, truncated } = collectMatches(regex, SAMPLE_TEXT);
  assert.equal(groupCount, 3, '3 个捕获组（年 / 月 / 日）');
  assert.equal(truncated, false);
  // 示例文本里 3 行合法日期；末尾的 2026-13-45 与 26-1-1 应被范围校验挡掉
  assert.equal(matches.length, 3, `应匹配 3 条，实际 ${matches.length}`);
  assert.equal(matches[0].text, '2026-03-01');
  assert.deepEqual(
    matches[0].groups.map((g) => g.text),
    ['2026', '03', '01'],
    '捕获组内容正确'
  );
  assert.equal(matches[0].index, SAMPLE_TEXT.indexOf('2026-03-01'), 'index 定位正确');
  assert.equal(matches[0].end, matches[0].index + matches[0].text.length, 'end = index + length');
  assert.ok(matches[0].groups.every((g) => g.name === null), '数字组 name 为 null');
  // 非法日期确实没被匹配
  assert.ok(
    !matches.some((m) => m.text.startsWith('2026-13')),
    '非法月份 13 未被匹配'
  );
}
console.log('✔ collectMatches basics');

// ============ collectMatches：高亮一律展示全部命中 ============
// 设计决定：即使 pattern 没带 g 标志，也要列出所有命中。
// g 只影响 replace / test 的语义；若高亮也跟着只取首个，
// 用户不加 g 就看不到高亮，与所有同类工具的直觉相反。
{
  const { regex } = buildRegex('\\d+', ''); // 无 g
  const { matches } = collectMatches(regex, 'a1 b22 c333');
  assert.equal(matches.length, 3, '无 g 标志时仍返回全部命中');
  assert.deepEqual(matches.map((m) => m.text), ['1', '22', '333']);
}
console.log('✔ collectMatches without g');

// ============ collectMatches：不污染调用方 regex ============
{
  const { regex } = buildRegex('a', 'g');
  regex.lastIndex = 3; // 故意设脏
  const { matches } = collectMatches(regex, 'aaaa');
  assert.equal(matches.length, 4, '不受调用方 lastIndex 影响');
  assert.equal(regex.lastIndex, 3, '调用方 lastIndex 未被修改');
}
console.log('✔ collectMatches no side effects');

// ============ collectMatches：零长匹配不死循环 ============
{
  // /a*/g 在 'bbb' 上会连续产生 4 个零长匹配
  const { regex } = buildRegex('a*', 'g');
  const { matches } = collectMatches(regex, 'bbb');
  assert.equal(matches.length, 4, '零长匹配：3 个中间 + 1 个末尾');
  assert.ok(matches.every((m) => m.text === ''), '全部是零长匹配');
  assert.equal(matches[matches.length - 1].index, 3, '末尾零长匹配在字符串末尾');

  // 完全空串
  const r2 = buildRegex('x*', 'g');
  assert.equal(collectMatches(r2.regex, '').matches.length, 1, '空串上零长匹配 1 次后终止');

  // 可匹配也可零长的组合
  const r3 = buildRegex('\\d*', 'g');
  assert.ok(collectMatches(r3.regex, 'a1b').matches.length >= 2, '混合场景正常终止');
}
console.log('✔ collectMatches zero-length safety');

// ============ collectMatches：u 标志下不切断代理对 ============
{
  // '.*' 会先贪婪吃掉全文，再在末尾产生一个零长匹配，这是正确的正则行为
  const { regex } = buildRegex('.*', 'gu');
  const { matches } = collectMatches(regex, 'a😀b');
  assert.equal(matches[0].text, 'a😀b', 'emoji 未被切断（无 u 时会切成半个代理对）');
  assert.equal(matches.length, 2, '全文 + 末尾零长匹配');
  assert.equal(matches[1].text, '');
  assert.equal(matches[1].index, 4, '零长匹配落在字符串末尾');

  // 对比：不带 u 时 . 会按 UTF-16 码元切，emoji 被劈成两半
  const noU = collectMatches(buildRegex('a.', 'g').regex, 'a😀b');
  assert.equal(noU.matches[0].text, 'a\uD83D', '无 u 时确实会切开代理对（说明 u 的必要性）');

  // 零长匹配在 u 下按码点前进
  const r2 = buildRegex('b*', 'gu');
  const out = collectMatches(r2.regex, 'a😀');
  assert.ok(out.matches.length >= 2, 'u 标志下零长匹配正常推进');
  assert.equal(out.matches[0].index, 0);
  assert.ok(
    out.matches.every((m) => m.text === '' || m.text === 'b'),
    '未产生半个代理对'
  );
}
console.log('✔ collectMatches unicode surrogate pairs');

// ============ collectMatches：命名组 ============
{
  const { regex } = buildRegex('(?<year>\\d{4})-(?<month>\\d{2})', 'g');
  const { matches, groupCount } = collectMatches(regex, '2026-09');
  assert.equal(groupCount, 2);
  const named = matches[0].groups.filter((g) => g.name !== null);
  assert.equal(named.length, 2, '2 个命名组');
  assert.deepEqual(named.map((g) => g.name), ['year', 'month']);
  assert.deepEqual(named.map((g) => g.text), ['2026', '09']);
  // 数字组 + 命名组都在（同一个组会以两种身份各出现一次）
  assert.equal(matches[0].groups.length, 4);
}
console.log('✔ collectMatches named groups');

// ============ collectMatches：未参与匹配的组为 null ============
{
  const { regex } = buildRegex('(a)|(b)', 'g');
  const { matches } = collectMatches(regex, 'a');
  assert.equal(matches[0].groups[0].text, 'a');
  assert.equal(matches[0].groups[1].text, null, '未参与匹配的组是 null 而非 undefined');
}
console.log('✔ collectMatches non-participating group');

// ============ collectMatches：limit 截断 ============
{
  const { regex } = buildRegex('a', 'g');
  const r = collectMatches(regex, 'a'.repeat(20), { limit: 5 });
  assert.equal(r.matches.length, 5, '按 limit 截断');
  assert.equal(r.truncated, true, '标记已截断');

  const r2 = collectMatches(regex, 'a'.repeat(5), { limit: 5 });
  assert.equal(r2.truncated, false, '刚好等于 limit 不算截断');

  const r3 = collectMatches(regex, '', { limit: 5 });
  assert.equal(r3.truncated, false);
  assert.equal(MAX_MATCHES, 500, '默认上限保持 500');
}
console.log('✔ collectMatches limit/truncated');

// ============ collectMatches：sticky 语义 ============
{
  // y 标志下不推进 lastIndex 时，只在起始位置匹配
  const { regex } = buildRegex('\\d', 'y');
  const { matches } = collectMatches(regex, 'ab12');
  assert.equal(matches.length, 0, 'y 标志在非数字起始处不匹配');
}
console.log('✔ collectMatches sticky');

// ============ escapeHtml ============
{
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml(null), '');
  // & 必须在其它实体之前转义，否则二次转义
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
}
console.log('✔ escapeHtml');

// ============ expandReplacement ============
{
  const m = {
    text: '2026-09',
    groups: [
      { index: 1, name: null, text: '2026' },
      { index: 2, name: null, text: '09' },
      { index: 3, name: 'year', text: '2026' },
    ],
  };
  assert.equal(expandReplacement(m, '$1年$2月'), '2026年09月');
  assert.equal(expandReplacement(m, '$&'), '2026-09', '$& 是整个匹配');
  assert.equal(expandReplacement(m, '$$'), '$', '$$ 转义成字面 $');
  assert.equal(expandReplacement(m, '$$1'), '$1', '$$ 之后不再当分组');
  assert.equal(expandReplacement(m, 'a$'), 'a$', '结尾裸 $ 原样');
  assert.equal(expandReplacement(m, '$9'), '', '不存在的分组 → 空串');
  assert.equal(expandReplacement(m, '$0'), '$0', '$0 不是合法分组引用');
  assert.equal(expandReplacement(m, '$<year>年'), '2026年', '命名组');
  assert.equal(expandReplacement(m, '$<nope>!'), '!', '不存在的命名组 → 空串');
  assert.equal(expandReplacement(m, '$<year'), '$<year', '未闭合的 > 视作字面量');
  assert.equal(expandReplacement(m, '无变量'), '无变量');

  // $12 在只有 2 组时应退回 $1 + 字面 '2'
  assert.equal(expandReplacement(m, '$12'), '20262', '$12 越界时按 $1 + 2 处理');
  // $2 越界（只有 2 组，$2 合法）—— 补一个 12 组场景
  const m12 = { text: 'x', groups: Array.from({ length: 12 }, (_, i) => ({ index: i + 1, name: null, text: `g${i + 1}` })) };
  assert.equal(expandReplacement(m12, '$12'), 'g12', '有 12 组时 $12 正常');

  // 未参与匹配的组
  const mNull = { text: 'a', groups: [{ index: 1, name: null, text: null }] };
  assert.equal(expandReplacement(mNull, '[$1]'), '[]', 'null 组展开为空串');
}
console.log('✔ expandReplacement');

// ============ renderHighlight ============
{
  const { regex } = buildRegex('(\\d{4})', 'g');
  const { matches } = collectMatches(regex, 'year 2026 done');

  const html = renderHighlight('year 2026 done', matches);
  assert.ok(html.includes('<mark class="mark">2026</mark>'), '命中处有 mark');
  assert.ok(html.startsWith('year '), '前缀保留');
  assert.ok(html.endsWith(' done'), '后缀保留');
  assert.ok(!html.includes('done</mark>'), '未命中部分不包在 mark 内');

  // 替换模式
  const html2 = renderHighlight('year 2026', matches, { replacement: '[$1]' });
  assert.ok(html2.includes('<mark class="mark mark-replaced">[2026]</mark>'), '替换后内容');

  // XSS：命中内容必须转义
  const xssRegex = buildRegex('<img>', 'g').regex;
  const xssMatches = collectMatches(xssRegex, 'a <img> b').matches;
  const xssHtml = renderHighlight('a <img> b', xssMatches);
  assert.ok(!xssHtml.includes('<img>'), '命中标签被转义，不会注入');
  assert.ok(xssHtml.includes('&lt;img&gt;'), '转义后仍可读');

  // 无匹配时整体转义
  const none = collectMatches(buildRegex('zzz', 'g').regex, '<b>hi</b>').matches;
  assert.equal(renderHighlight('<b>hi</b>', none), '&lt;b&gt;hi&lt;/b&gt;', '无匹配也转义');

  // 零长匹配用 &nbsp; 占位，保证 mark 可见
  const zl = collectMatches(buildRegex('x*', 'g').regex, 'ab').matches;
  const zlHtml = renderHighlight('ab', zl);
  assert.ok(zlHtml.includes('&nbsp;'), '零长匹配有可见占位');

  // 空文本
  assert.equal(renderHighlight('', []), '');
}
console.log('✔ renderHighlight');

// ============ replaceAll ============
{
  const { regex } = buildRegex(SAMPLE_PATTERN, SAMPLE_FLAGS);
  const r = replaceAll(SAMPLE_TEXT, regex, '$3/$2/$1');
  assert.equal(r.count, 3, '替换 3 处');
  assert.equal(r.truncated, false);
  assert.ok(r.output.includes('01/03/2026'), '替换顺序正确');

  // 无 g 标志也会替换全部
  const noG = buildRegex('\\d{4}', '').regex;
  assert.equal(replaceAll('2026 2027', noG, 'Y').count, 2, '无 g 也全量替换');

  // limit：超出的部分原样保留
  const many = 'a'.repeat(10);
  const r2 = replaceAll(many, buildRegex('a', 'g').regex, 'b', { limit: 3 });
  assert.equal(r2.count, 3);
  assert.equal(r2.truncated, true);
  assert.equal(r2.output, 'bbb' + 'a'.repeat(7), '超出上限的保持原样');

  // 替换为空串（清洗场景）
  const clean = replaceAll('<b>x</b>', buildRegex('<[^>]*>', 'g').regex, '');
  assert.equal(clean.output, 'x');

  // 命名组替换
  const named = buildRegex('(?<k>\\w+)=(?<v>\\w+)', 'g').regex;
  assert.equal(replaceAll('a=1 b=2', named, '$<v>:$<k>').output, '1:a 2:b', '命名组按名取值');
  // 只有紧跟在 $ 后面的 < 才是语法，裸 < 是普通字符
  assert.equal(
    replaceAll('a=1', buildRegex('(?<k>\\w+)=(?<v>\\w+)', 'g').regex, '$<v>:<$<k>').output,
    '1:<a',
    '未紧跟 $ 的 < 原样保留'
  );
}
console.log('✔ replaceAll');

// ============ encodeState / decodeState ============
{
  const enc = encodeState('(\\d{4})', 'gi');
  assert.ok(enc.includes('p='), '含 pattern');
  assert.ok(enc.includes('f=gi'), '含 flags');

  const dec = decodeState('#' + enc);
  assert.equal(dec.source, '(\\d{4})', 'pattern 往返一致');
  assert.equal(dec.flags, 'gi');

  // 空 pattern + 空 flags
  assert.equal(encodeState('', ''), '', '空状态不产生 hash');

  // 含特殊字符（& = # 中文）
  const tricky = 'a&b=c#中文/d';
  assert.equal(decodeState('#' + encodeState(tricky, 'g')).source, tricky, '特殊字符往返一致');

  // 空 hash / 垃圾 hash
  assert.deepEqual(decodeState(''), { source: '', flags: '' });
  assert.deepEqual(decodeState('#'), { source: '', flags: '' });
  assert.deepEqual(decodeState('#garbage'), { source: '', flags: '' });
  assert.equal(decodeState('#f=gx').flags, 'g', 'hash 里的非法 flag 被剔除');
  // 非法百分号编码不能抛
  assert.equal(decodeState('#p=%E0%A4%A').source, '%E0%A4%A', '非法编码回退原值不抛错');

  // 前导 # 可有可无
  assert.equal(decodeState('p=a&f=g').source, 'a');
}
console.log('✔ encodeState / decodeState');

// ============ SNIPPETS：每条都必须是合法可编译的正则 ============
{
  let total = 0;
  for (const group of SNIPPETS) {
    assert.ok(group.items.length > 0, `${group.group} 分组非空`);
    for (const item of group.items) {
      total++;
      const r = buildRegex(item.pattern, item.flags);
      assert.equal(r.ok, true, `${group.group}/${item.label} 应可编译: ${r.error}`);
      assert.ok(item.label && item.note, `${group.group}/${item.label} 缺说明`);
      // 片段必须真的能匹配到东西（用构造样本做冒烟）
      const probe = {
        邮箱: 'a.b+c@mail.example.com',
        URL: 'https://oscarstudio.cn/a?b=1',
        IPv4: '192.168.1.255 和 999.1.1.1',
        手机号: '13812345678',
        身份证: '110101199003074567',
        日期: '2026-09-27',
        中文字符: '正则工作台',
        '去 HTML 标签': '<b>粗体</b>',
        重复词: 'this this test',
        空白行: 'a\n\nb',
        'Markdown 标题': '## 标题',
        十六进制颜色: '#fff #aabbcc #12345678',
      }[item.label];
      if (probe !== undefined) {
        const { matches } = collectMatches(r.regex, probe);
        assert.ok(matches.length > 0, `${group.group}/${item.label} 未能匹配样本 "${probe}"`);
      }
    }
  }
  assert.ok(total >= 10, `片段数量 ${total} 偏少`);
}
console.log('✔ SNIPPETS (all compile & match)');

// ============ SAMPLE：开箱即用 ============
{
  const r = buildRegex(SAMPLE_PATTERN, SAMPLE_FLAGS);
  assert.equal(r.ok, true, '示例正则可编译');
  const { matches } = collectMatches(r.regex, SAMPLE_TEXT);
  assert.equal(matches.length, 3, '示例在示例文本上有 3 处命中');
}

// ============ countCapturingGroups ============
// 回归测试：RegExp 实例没有 numberOfCapturingGroups 属性（返回 undefined），
// 早期版本直接读它导致捕获组数组恒为空。这个函数是唯一的正确入口。
{
  assert.equal(countCapturingGroups(buildRegex('abc', 'g').regex), 0, '无捕获组');
  assert.equal(countCapturingGroups(buildRegex('(a)(b)', 'g').regex), 2, '两个组');
  assert.equal(countCapturingGroups(buildRegex('(?:a)(b)', 'g').regex), 1, '非捕获组不计');
  assert.equal(countCapturingGroups(buildRegex('(?<x>a)(?<y>b)', 'g').regex), 2, '命名组计');
  assert.equal(countCapturingGroups(buildRegex('(a(b(c)))', 'g').regex), 3, '嵌套组');
  assert.equal(countCapturingGroups(buildRegex('(?<=a)b', 'g').regex), 0, '后行断言不计');
  assert.equal(countCapturingGroups(buildRegex('(a)\\1', 'g').regex), 1, '反向引用不影响计数');
  assert.equal(countCapturingGroups(buildRegex('(a{2,3})+', 'g').regex), 1, '量词不影响计数');
  assert.equal(countCapturingGroups(buildRegex('', 'g').regex), 0, '空 pattern');
  // 追加 | 不能破坏原 pattern 的合法性
  assert.equal(countCapturingGroups(buildRegex('a|b|c', 'g').regex), 0, '自带分支也不受影响');
  // 确认这个属性确实不存在（防止有人「优化」回直接读属性的写法）
  assert.equal(
    buildRegex('(a)', 'g').regex.numberOfCapturingGroups,
    undefined,
    'RegExp 没有 numberOfCapturingGroups 属性，必须用探测法'
  );
}
console.log('✔ countCapturingGroups');

console.log('\n🎉 all regex tests passed');
