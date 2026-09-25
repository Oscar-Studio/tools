/**
 * 密码生成器单元测试。
 * 覆盖：random / strong / passphrase / dicts / storage / history。
 * 不测 strength（依赖 zxcvbn-ts npm 包 + 浏览器 importmap,在 Node 跑要 stub）。
 *
 * 运行: node /test /password-generator.test.mjs
 */
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

// Node 22 自带 webcrypto,缺省时显式注入
if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
  globalThis.crypto = webcrypto;
}

// ---------- fake localStorage（用于 storage / history） ----------
class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i) { return Array.from(this.m.keys())[i] ?? null; }
  get length() { return this.m.size; }
}
const fakeStorage = new FakeStorage();
globalThis.localStorage = fakeStorage;

// ---------- 加载 ----------
const random = await import('../legacy-tools/password-generator/js/random.js');
const strong = await import('../legacy-tools/password-generator/js/strong.js');
const passphrase = await import('../legacy-tools/password-generator/js/passphrase.js');
const { WORDS_EN } = await import('../legacy-tools/password-generator/js/dicts/en.js');
const { WORDS_ZH } = await import('../legacy-tools/password-generator/js/dicts/zh.js');
const storage = await import('../legacy-tools/password-generator/js/storage.js');
const historyMod = await import('../legacy-tools/password-generator/js/history.js');

let passed = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`✔ ${label}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${label}`);
    console.error('  ' + (e.stack || e.message));
    process.exitCode = 1;
  }
};

// ============ random ============
check('randomBytes(16) 返回 Uint8Array 长度 16', () => {
  const buf = random.randomBytes(16);
  assert.ok(buf instanceof Uint8Array);
  assert.equal(buf.length, 16);
});
check('randomBytes 拒绝非法 n', () => {
  assert.throws(() => random.randomBytes(0), /1..65536/);
  assert.throws(() => random.randomBytes(-1), /1..65536/);
  assert.throws(() => random.randomBytes(1.5), /整数/);
});
check('randomInt(N) ∈ [0..N) 均匀分布(10000 次抽样无偏差)', () => {
  const N = 10;
  const counts = new Array(N).fill(0);
  for (let i = 0; i < 10000; i++) {
    const v = random.randomInt(N);
    assert.ok(v >= 0 && v < N, `v=${v}`);
    counts[v]++;
  }
  // 期望 1000/ 类,允许 ±20% 偏差
  for (let i = 0; i < N; i++) {
    assert.ok(counts[i] >= 600 && counts[i] <= 1400, `bin ${i} count=${counts[i]} 偏差过大`);
  }
});
check('randomInt 拒绝非法 max', () => {
  assert.throws(() => random.randomInt(0), /整数/);
  assert.throws(() => random.randomInt(-5), /整数/);
  assert.throws(() => random.randomInt(1.5), /整数/);
});
check('randomChar 从 ASCII 字符集抽 1 个', () => {
  const cs = 'abc';
  for (let i = 0; i < 50; i++) {
    const c = random.randomChar(cs);
    assert.ok(cs.includes(c));
  }
});
check('shuffleInPlace 长度不变、元素集合不变', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const before = [...arr];
  random.shuffleInPlace(arr);
  assert.equal(arr.length, 10);
  assert.deepEqual([...arr].sort(), [...before].sort());
});
check('shuffleInPlace 能改变顺序(100 次至少出现一次换位)', () => {
  let moved = false;
  for (let i = 0; i < 100 && !moved; i++) {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    random.shuffleInPlace(arr);
    for (let j = 0; j < arr.length; j++) {
      if (arr[j] !== j + 1) { moved = true; break; }
    }
  }
  assert.ok(moved, 'shuffle 100 次未换位');
});

// ============ strong.generateStrong ============
check('generateStrong 默认 16 长度含大小写数字', () => {
  const r = strong.generateStrong({ length: 16, upper: true, lower: true, digits: true, symbols: false, excludeAmbiguous: true });
  assert.equal(r.password.length, 16);
  assert.ok(/[A-Z]/.test(r.password), '缺大写');
  assert.ok(/[a-z]/.test(r.password), '缺小写');
  assert.ok(/[0-9]/.test(r.password), '缺数字');
  assert.ok(!/[!@#\$%\^&\*\(\)\-_=\+\[\]\{};:,.<>?\/]/.test(r.password), '不应含符号');
  assert.ok(!/[0OIl1|]/.test(r.password), '不应含易混淆字符');
});
check('generateStrong excludeAmbiguous=false 时包含易混淆字符', () => {
  let sawAmbiguous = false;
  for (let i = 0; i < 200 && !sawAmbiguous; i++) {
    const r = strong.generateStrong({ length: 32, upper: true, lower: true, digits: true, symbols: false, excludeAmbiguous: false });
    if (/[0OIl1|]/.test(r.password)) sawAmbiguous = true;
  }
  assert.ok(sawAmbiguous, '200 次未出现易混淆字符');
});
check('generateStrong symbols=true 时含符号', () => {
  let sawSymbol = false;
  for (let i = 0; i < 100 && !sawSymbol; i++) {
    const r = strong.generateStrong({ length: 24, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: true });
    if (/[!@#\$%\^&\*\(\)\-_=\+\[\]\{};:,.<>?\/]/.test(r.password)) sawSymbol = true;
  }
  assert.ok(sawSymbol, '100 次未出现符号');
});
check('generateStrong 熵 ≈ length × log2(charsetSize)', () => {
  const r = strong.generateStrong({ length: 16, upper: true, lower: true, digits: true, symbols: false, excludeAmbiguous: true });
  const expected = 16 * Math.log2(r.charsetSize);
  assert.ok(Math.abs(r.entropy - expected) < 0.01, `entropy=${r.entropy} expected=${expected}`);
});
check('validateOptions 长度越界抛错', () => {
  assert.throws(() => strong.validateOptions({ length: 0, upper: true, lower: false, digits: false, symbols: false }), /4..128/);
  assert.throws(() => strong.validateOptions({ length: 129, upper: true, lower: false, digits: false, symbols: false }), /4..128/);
  assert.throws(() => strong.validateOptions({ length: 16.5, upper: true, lower: false, digits: false, symbols: false }), /整数/);
});
check('validateOptions 4 类全关抛"至少选择 1 类"', () => {
  assert.throws(() => strong.validateOptions({ length: 16, upper: false, lower: false, digits: false, symbols: false }), /至少选择 1 类/);
});

// ============ passphrase.generatePassphrase ============
check('generatePassphrase 英文 5 词,词全部在 WORDS_EN 中', () => {
  const r = passphrase.generatePassphrase({ count: 5, lang: 'en', separator: '-' });
  assert.equal(r.words.length, 5);
  for (const w of r.words) assert.ok(WORDS_EN.includes(w), `词 "${w}" 不在 WORDS_EN`);
});
check('generatePassphrase 中文 5 词,词全部在 WORDS_ZH 中', () => {
  const r = passphrase.generatePassphrase({ count: 5, lang: 'zh', separator: ' ' });
  assert.equal(r.words.length, 5);
  for (const w of r.words) assert.ok(WORDS_ZH.includes(w), `词 "${w}" 不在 WORDS_ZH`);
});
check('generatePassphrase separator=-', () => {
  const r = passphrase.generatePassphrase({ count: 3, lang: 'en', separator: '-' });
  assert.equal(r.passphrase.split('-').length, 3);
});
check('generatePassphrase capitalize=true 英文首字母大写', () => {
  let sawCapital = false;
  for (let i = 0; i < 50 && !sawCapital; i++) {
    const r = passphrase.generatePassphrase({ count: 5, lang: 'en', separator: ' ', capitalize: true });
    for (const w of r.words) {
      if (/^[A-Z]/.test(w)) { sawCapital = true; break; }
    }
  }
  assert.ok(sawCapital, '50 次未出现大写首字母');
});
check('generatePassphrase includeNumber=true 末尾加 1 个数字', () => {
  const r = passphrase.generatePassphrase({ count: 3, lang: 'en', separator: ' ', includeNumber: true });
  assert.equal(r.words.length, 4);
  assert.match(r.words[3], /^[0-9]$/);
});
check('dicewareEntropy(5, 7776) ≈ 64.6', () => {
  const e = passphrase.dicewareEntropy(5, 7776);
  assert.ok(Math.abs(e - 5 * Math.log2(7776)) < 0.01);
});
check('validatePassphraseOpts count 边界', () => {
  assert.throws(() => passphrase.validatePassphraseOpts({ count: 2, lang: 'en' }), /3..10/);
  assert.throws(() => passphrase.validatePassphraseOpts({ count: 11, lang: 'en' }), /3..10/);
  assert.throws(() => passphrase.validatePassphraseOpts({ count: 5, lang: 'de' }), /en.*zh/);
});

// ============ dicts ============
check('WORDS_EN 长度 === 7776 且无重复', () => {
  assert.equal(WORDS_EN.length, 7776);
  const seen = new Set();
  for (const w of WORDS_EN) {
    assert.ok(typeof w === 'string' && w.length > 0, '单词必须是非空字符串');
    assert.ok(!seen.has(w), `重复词: ${w}`);
    seen.add(w);
  }
});
check('WORDS_EN 全部小写英文（含可选连字符）', () => {
  for (const w of WORDS_EN) {
    assert.ok(/^[a-z-]+$/.test(w), `非小写英文: ${w}`);
  }
});
check('WORDS_ZH 长度 >= 1000 且无重复', () => {
  assert.ok(WORDS_ZH.length >= 1000, `长度 ${WORDS_ZH.length} < 1000`);
  const seen = new Set();
  for (const w of WORDS_ZH) {
    assert.equal(w.length, 2, `词 "${w}" 应为 2 字`);
    assert.ok(!seen.has(w), `重复词: ${w}`);
    seen.add(w);
  }
});

// ============ storage ============
check('storage.loadLocal 空 localStorage 返回 null', () => {
  fakeStorage.clear();
  assert.equal(storage.loadLocal(), null);
});
check('storage.saveLocal + loadLocal 往返一致', () => {
  fakeStorage.clear();
  const state = { version: 1, items: [], updatedAt: 12345 };
  assert.equal(storage.saveLocal(state), true);
  assert.deepEqual(storage.loadLocal(), state);
});
check('storage.loadLocal 损坏 JSON 返回 null', () => {
  fakeStorage.clear();
  fakeStorage.setItem('oscar.password.v1', '{not-json');
  assert.equal(storage.loadLocal(), null);
});
check('storage.loadLocal version 不匹配返回 null', () => {
  fakeStorage.clear();
  fakeStorage.setItem('oscar.password.v1', JSON.stringify({ version: 99, items: [] }));
  assert.equal(storage.loadLocal(), null);
});

// ============ history ============
check('history 空初始化', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  const s = historyMod.getState();
  assert.equal(s.version, 1);
  assert.deepEqual(s.items, []);
});
check('history.addEntry 添加一条', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  const id = historyMod.addEntry({ type: 'strong', value: 'abc123', score: 2, entropy: 30 });
  assert.ok(typeof id === 'string' && id.startsWith('p_'));
  const s = historyMod.getState();
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].value, 'abc123');
  assert.equal(s.items[0].type, 'strong');
  assert.equal(s.items[0].score, 2);
});
check('history.addEntry 拒绝空 value', () => {
  assert.throws(() => historyMod.addEntry({ type: 'strong', value: '' }), /必填/);
});
check('history.addEntry 累积 + 时间倒序', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  historyMod.addEntry({ type: 'strong', value: 'aaa' });
  // 模拟时间
  const realDateNow = Date.now;
  Date.now = () => realDateNow() + 100;
  historyMod.addEntry({ type: 'strong', value: 'bbb' });
  Date.now = () => realDateNow() + 200;
  historyMod.addEntry({ type: 'strong', value: 'ccc' });
  Date.now = realDateNow;
  const items = historyMod.getState().items;
  assert.equal(items.length, 3);
  assert.equal(items[0].value, 'ccc'); // 最新在前
  assert.equal(items[2].value, 'aaa');
});
check('history.MAX_HISTORY=200 上限生效', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  for (let i = 0; i < 250; i++) {
    historyMod.addEntry({ type: 'strong', value: 'p' + i });
  }
  assert.equal(historyMod.getState().items.length, 200);
});
check('history.deleteEntry 按 id 删除', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  const id1 = historyMod.addEntry({ type: 'strong', value: 'aaa' });
  const id2 = historyMod.addEntry({ type: 'strong', value: 'bbb' });
  historyMod.deleteEntry(id1);
  const items = historyMod.getState().items;
  assert.equal(items.length, 1);
  assert.equal(items[0].id, id2);
});
check('history.clearAll 清空', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  historyMod.addEntry({ type: 'strong', value: 'a' });
  historyMod.addEntry({ type: 'strong', value: 'b' });
  historyMod.clearAll();
  assert.equal(historyMod.getState().items.length, 0);
});
check('history.subscribe 通知 listener', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  let count = 0;
  const unsub = historyMod.subscribe(() => count++);
  historyMod.addEntry({ type: 'strong', value: 'x' });
  historyMod.addEntry({ type: 'strong', value: 'y' });
  historyMod.deleteEntry(historyMod.getState().items[0].id);
  unsub();
  historyMod.addEntry({ type: 'strong', value: 'z' });
  assert.equal(count, 3);
});
check('history.exportJson + importJson 往返', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  historyMod.addEntry({ type: 'strong', value: 'aaa', score: 4, entropy: 90 });
  historyMod.addEntry({ type: 'passphrase', value: 'bbb-ccc', score: 3, entropy: 60 });
  const json = historyMod.exportJson();
  assert.ok(json.includes('"version": 1'));
  assert.ok(json.includes('"aaa"'));
  fakeStorage.clear();
  historyMod._resetForTest();
  const r = historyMod.importJson(json);
  assert.equal(r.ok, true);
  assert.equal(r.imported, 2);
  assert.equal(historyMod.getState().items.length, 2);
});
check('history.importJson 拒绝非法 JSON', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  const r = historyMod.importJson('{not-json');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON 解析失败/);
});
check('history.importJson 拒绝空 items', () => {
  fakeStorage.clear();
  historyMod._resetForTest();
  const r = historyMod.importJson(JSON.stringify({ version: 1, items: [] }));
  assert.equal(r.ok, false);
  assert.match(r.error, /items 为空/);
});

console.log(`\n✔ ${passed} tests passed.`);