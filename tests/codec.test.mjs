import assert from 'node:assert/strict';

import {
  b64Encode,
  b64Decode,
  pctEncode,
  pctDecode,
  hexEncode,
  hexDecode,
  unicodeEscape,
  unicodeUnescape,
  htmlEntitiesEncode,
  htmlEntitiesDecode,
  rot13,
  punycodeEncode,
  punycodeDecode,
  toAsciiDump,
  utf8Bytes,
} from '../legacy-tools/codec/js/encoders.js';

// === Base64 ===
{
  assert.equal(b64Encode('Hello'), 'SGVsbG8=');
  assert.equal(b64Encode('你好'), '5L2g5aW9');
  assert.equal(b64Encode('😀'), '8J+YgA==');
  assert.equal(b64Decode('SGVsbG8='), 'Hello');
  assert.equal(b64Decode('5L2g5aW9'), '你好');
  assert.equal(b64Decode('8J+YgA=='), '😀');
  assert.equal(b64Encode('subjects>?', true), 'c3ViamVjdHM-Pw');
  assert.equal(b64Decode('c3ViamVjdHM-Pw', true), 'subjects>?');
  for (const s of ['', 'a', 'Hello, World!', '你好，世界！', '🐱🐶😺', 'multi\nline\n文本']) {
    assert.equal(b64Decode(b64Encode(s)), s, `b64 roundtrip failed: ${JSON.stringify(s)}`);
    assert.equal(b64Decode(b64Encode(s, true), true), s, `b64 url-safe roundtrip failed: ${JSON.stringify(s)}`);
  }
  assert.throws(() => b64Decode('@@@'), /base64/i);
}
console.log('✔ base64');

// === URL Percent ===
{
  assert.equal(pctEncode('hello world'), 'hello%20world');
  assert.equal(pctEncode('a=b&c=d'), 'a%3Db%26c%3Dd');
  assert.equal(pctEncode("!*'();"), "%21%2A%27%28%29%3B");
  assert.equal(pctEncode('中文'), '%E4%B8%AD%E6%96%87');
  assert.equal(pctDecode('hello%20world'), 'hello world');
  assert.equal(pctDecode('%21%2A%27%28%29%3B'), "!*'();");
  assert.equal(pctDecode('%E4%B8%AD%E6%96%87'), '中文');
  for (const s of ['', 'a', "!*'();a b", '中文/abc', '🐱', 'path/to/(file)']) {
    assert.equal(pctDecode(pctEncode(s)), s, `pct roundtrip failed: ${JSON.stringify(s)}`);
  }
}
console.log('✔ url percent');

// === Hex (UTF-8 bytes) ===
{
  assert.equal(hexEncode('A'), '41');
  assert.equal(hexEncode('AB'), '4142');
  assert.equal(hexEncode('中'), 'e4b8ad');
  assert.equal(hexEncode('😀'), 'f09f9880');
  assert.equal(hexDecode('41'), 'A');
  assert.equal(hexDecode('4142'), 'AB');
  assert.equal(hexDecode('e4b8ad'), '中');
  for (const s of ['', 'a', 'Hello', '你好', 'café 🐱']) {
    assert.equal(hexDecode(hexEncode(s)), s, `hex roundtrip failed: ${JSON.stringify(s)}`);
  }
  assert.throws(() => hexDecode('abc'), /even/i);
}
console.log('✔ hex');

// === Unicode escape ===
{
  assert.equal(unicodeEscape('A'), '\\u0041');
  assert.equal(unicodeEscape('中'), '\\u4e2d');
  assert.equal(unicodeEscape('😀'), '\\ud83d\\ude00');
  assert.equal(unicodeUnescape('\\u0041'), 'A');
  assert.equal(unicodeUnescape('\\u4e2d'), '中');
  assert.equal(unicodeUnescape('\\ud83d\\ude00'), '😀');
  assert.equal(unicodeEscape('ab', { xhh: true }), '\\x61\\x62');
  assert.equal(unicodeUnescape('\\x61\\x62', { xhh: true }), 'ab');
  for (const s of ['', 'A', 'abc 中文 😀 café']) {
    assert.equal(unicodeUnescape(unicodeEscape(s)), s, `unicode roundtrip failed: ${JSON.stringify(s)}`);
  }
  assert.throws(() => unicodeUnescape('\\uD800'), /surrogate/i);
}
console.log('✔ unicode escape');

// === HTML entities ===
{
  assert.equal(htmlEntitiesEncode('<div class="x">A&B</div>'), '&lt;div class=&quot;x&quot;&gt;A&amp;B&lt;/div&gt;');
  assert.equal(htmlEntitiesDecode('&lt;div&gt;'), '<div>');
  // 级联：&amp;copy; → &copy; → ©
  assert.equal(htmlEntitiesDecode('&amp;copy;'), '©');
  assert.equal(htmlEntitiesDecode('&#65;'), 'A');
  assert.equal(htmlEntitiesDecode('&#x41;'), 'A');
  assert.equal(htmlEntitiesEncode('café ©'), 'caf&eacute; &copy;');
  for (const s of ['', 'a', '<b>A & B</b>', '中文<>"\'', 'A > B < C']) {
    assert.equal(htmlEntitiesDecode(htmlEntitiesEncode(s)), s, `html entities roundtrip failed: ${JSON.stringify(s)}`);
  }
}
console.log('✔ html entities');

// === ROT13 ===
{
  assert.equal(rot13('Hello'), 'Uryyb');
  assert.equal(rot13('Uryyb'), 'Hello');
  assert.equal(rot13('Hello, World!'), 'Uryyb, Jbeyq!');
  for (const s of ['', 'Hello, World!', 'ABCdef', '中文 abc']) {
    assert.equal(rot13(rot13(s)), s, `rot13 roundtrip failed: ${JSON.stringify(s)}`);
  }
}
console.log('✔ rot13');

// === Punycode ===
{
  assert.equal(punycodeEncode('中国'), 'fiqs8s');
  assert.equal(punycodeEncode('例え'), 'r8jz45g');
  assert.equal(punycodeEncode('Bücher'), 'Bcher-kva');
  assert.equal(punycodeEncode('example'), 'example'); // pure ASCII passthrough
  assert.equal(punycodeDecode('fiqs8s'), '中国');
  assert.equal(punycodeDecode('r8jz45g'), '例え');
  assert.equal(punycodeDecode('Bcher-kva'), 'Bücher');
}
console.log('✔ punycode');

// === ASCII dump ===
{
  assert.equal(toAsciiDump('A B'), 'A B');
  assert.equal(toAsciiDump('中'), '\\u4e2d');
  assert.equal(toAsciiDump('\t'), '\\t');
  assert.equal(toAsciiDump('\n'), '\\n');
  assert.equal(toAsciiDump('\x01'), '\\x01');
}
console.log('✔ ascii dump');

// === utf8Bytes helper ===
{
  assert.equal(utf8Bytes('A'), 1);
  assert.equal(utf8Bytes('中'), 3);
  assert.equal(utf8Bytes('😀'), 4);
}
console.log('✔ utf8Bytes helper');

// === JWT ===
{
  const { parseJwt } = await import('../legacy-tools/codec/js/jwt.js');
  const tok =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE5MTYyMzkwMjJ9.' +
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  const r = parseJwt(tok);
  assert.equal(r.error, undefined, 'no error on valid token');
  assert.equal(r.header.alg, 'HS256');
  assert.equal(r.header.typ, 'JWT');
  assert.equal(r.payload.sub, '1234567890');
  assert.equal(r.payload.name, 'John Doe');
  assert.equal(r.payload.iat, 1516239022);
  assert.equal(r.payload.exp, 1916239022);
  assert.equal(r.expISO, '2030-09-21T16:37:02.000Z');
  assert.equal(r.iatISO, '2018-01-18T01:30:22.000Z');
  assert.equal(r.status, 'active'); // 2030-09-21 still in the future
  assert.ok(r.signatureB64.startsWith('SflKxw'));

  // 损坏的 token 不抛
  assert.ok(parseJwt('a.b.c').error);
  assert.ok(parseJwt('not-a-jwt').error);
  assert.ok(parseJwt('').error);
}
console.log('✔ jwt');

console.log('\nAll codec encoder/jwt tests passed.');

// Expired status
{
  const { parseJwt } = await import('../legacy-tools/codec/js/jwt.js');
  // {"exp": 1}
  const expiredTok =
    'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.fake';
  const r = parseJwt(expiredTok);
  assert.equal(r.status, 'expired');
}
console.log('✔ jwt expired status');
