import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
// Node 18+ 默认就有 crypto.subtle/globalThis.crypto；如果不在 HTML 浏览器上下文里运行测试需要显式注入。
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = webcrypto;
}

const md5 = (await import('../legacy-tools/codec/js/md5.js')).md5;
const {
  md5Hex,
  sha1Hex,
  sha256Hex,
  sha384Hex,
  sha512Hex,
  hmacSha256Hex,
  hmacSha512Hex,
} = await import('../legacy-tools/codec/js/hashes.js');

// === MD5 ===
{
  assert.equal(md5Hex(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5Hex('a'), '0cc175b9c0f1b6a831c399e269772661');
  assert.equal(md5Hex('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(md5Hex('message digest'), 'f96b697d7cb7938d525a2f31aaf161d0');
  assert.equal(md5Hex('The quick brown fox jumps over the lazy dog'), '9e107d9d372bb6826bd81d3542a419d6');
  assert.equal(md5Hex('中文'), 'a7bac2239fcdcb3a067903d8077c4a07');
  // Direct md5() should give same as md5Hex()
  assert.equal(md5('abc'), md5Hex('abc'));
}
console.log('✔ md5');

// === SHA-1 ===
{
  assert.equal(await sha1Hex(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  assert.equal(await sha1Hex('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(await sha1Hex('The quick brown fox jumps over the lazy dog'), '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
}
console.log('✔ sha1');

// === SHA-256 ===
{
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
}
console.log('✔ sha256');

// === SHA-384 ===
{
  assert.equal(await sha384Hex(''), '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b');
  assert.equal(await sha384Hex('abc'), 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7');
}
console.log('✔ sha384');

// === SHA-512 ===
{
  // 简化：只验证空串与 "abc" 这两条 NIST 公开向量
  assert.equal(await sha512Hex(''), 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e');
  assert.equal(await sha512Hex('abc'), 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
}
console.log('✔ sha512');

// === HMAC-SHA256 (RFC 4231 §4.2) ===
{
  // Test 1: key = 0x0b * 20, data = "Hi There"
  const keyBytes = new Uint8Array(20).fill(0x0b);
  const msgBytes = new TextEncoder().encode('Hi There');
  const keyStr = String.fromCharCode(...keyBytes);
  const h = await hmacSha256Hex(keyStr, 'Hi There');
  // expected from RFC 4231 test case 1: b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
  assert.equal(h, 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
}
console.log('✔ hmac-sha256');

// === HMAC-SHA512 (RFC 4231 §4.2 for SHA-512, smaller known) ===
{
  // Test 1 from RFC 4231 with SHA-512: key=0x0b*20, data="Hi There"
  const keyStr = String.fromCharCode(...new Uint8Array(20).fill(0x0b));
  const h = await hmacSha512Hex(keyStr, 'Hi There');
  assert.equal(h, '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854');
}
console.log('✔ hmac-sha512');

console.log('\nAll codec hash tests passed.');
