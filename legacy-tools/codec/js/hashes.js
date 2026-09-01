/**
 * 哈希族。SHA-1/256/384/512 与 HMAC 走浏览器 / Node 内置 crypto.subtle，
 * 同步 API 不可用，因此对短输入用包装；MD5 来自 md5.js。
 *
 * Note: 调用前请先 ensureCrypto()（顶层 script 完成即可）。
 */
import { md5 } from './md5.js';

const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;

function bufToHex(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

async function subtleDigest(algo, bytes) {
  if (!subtle) throw new Error('Web Crypto API 不可用（需要 HTTPS / 现代浏览器 / Node 18+）');
  const buf = await subtle.digest(algo, bytes);
  return bufToHex(buf);
}

async function subtleHmac(algo, keyBytes, msgBytes) {
  if (!subtle) throw new Error('Web Crypto API 不可用');
  const key = await subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: { name: algo } },
    false, ['sign']
  );
  const sig = await subtle.sign('HMAC', key, msgBytes);
  return bufToHex(sig);
}

function utf8(s) {
  return new TextEncoder().encode(String(s));
}

export async function sha1Hex(str)   { return subtleDigest('SHA-1',   utf8(str)); }
export async function sha256Hex(str) { return subtleDigest('SHA-256', utf8(str)); }
export async function sha384Hex(str) { return subtleDigest('SHA-384', utf8(str)); }
export async function sha512Hex(str) { return subtleDigest('SHA-512', utf8(str)); }

export async function hmacSha256Hex(key, msg) {
  return subtleHmac('SHA-256', utf8(key), utf8(msg));
}
export async function hmacSha512Hex(key, msg) {
  return subtleHmac('SHA-512', utf8(key), utf8(msg));
}

// MD5 (synchronous)
export function md5Hex(str) { return md5(str); }
