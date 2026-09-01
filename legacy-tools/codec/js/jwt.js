/**
 * JWT 解析器。仅解析，不验证签名（浏览器密钥不可控）。
 * 浏览器与 Node 都能跑。
 */

function b64UrlDecode(s) {
  // JWT 用 Base64URL（无 padding，- _）
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (s.length % 4)) % 4;
  s = s + '='.repeat(pad);
  // 浏览器与 Node 18+ 都有 atob
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // 允许 UTF-8：RFC 7519 未明确，但实际 token payload 常含非 ASCII
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return bin;
  }
}

function tryJson(s) {
  try { return { ok: true, value: JSON.parse(s) }; }
  catch { return { ok: false }; }
}

function timeStr(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  // JavaScript Date supports milliseconds in [-8.64e15, +8.64e15] (about ±275760 AD).
  // Number.MAX_SAFE_INTEGER * 1000 overflows this, producing "Invalid Date".
  // Clamp to the supported range to keep expISO a valid ISO string.
  let ms = seconds * 1000;
  if (ms > 8640000000000000) ms = 8640000000000000;
  if (ms < -8640000000000000) ms = -8640000000000000;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function expStatus(expSeconds) {
  if (typeof expSeconds !== 'number') return 'unknown';
  const now = Math.floor(Date.now() / 1000);
  if (expSeconds <= now) return 'expired';
  // 剩余秒数
  const remain = expSeconds - now;
  return remain > 60 * 60 * 24 ? 'active' : 'active-soon';
}

function humanRemain(expSeconds) {
  const now = Math.floor(Date.now() / 1000);
  let s = expSeconds - now;
  if (s < 0) return `已过期 ${formatDur(-s)}`;
  return `剩余 ${formatDur(s)}`;
}

function formatDur(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(d + ' 天');
  if (h) parts.push(h + ' 小时');
  if (m) parts.push(m + ' 分钟');
  if (sec || parts.length === 0) parts.push(sec + ' 秒');
  return parts.join(' ');
}

/**
 * 解析一个 JWT 字符串。返回 { header, payload, signatureB64, error?, expISO?, iatISO?, status?, remains? }
 * 任何抛错都被捕获并放进 error 字段；不抛异常。
 */
export function parseJwt(token) {
  if (typeof token !== 'string' || !token) {
    return { error: 'JWT 不能为空' };
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { error: `JWT 必须是三段（header.payload.signature），收到 ${parts.length} 段` };
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let headerJson, payloadJson;
  try {
    headerJson = b64UrlDecode(headerB64);
    payloadJson = b64UrlDecode(payloadB64);
  } catch (e) {
    return { error: `Base64URL 解析失败：${e && e.message || e}` };
  }

  const header = tryJson(headerJson);
  const payload = tryJson(payloadJson);

  if (!header.ok) return { error: `header 不是合法 JSON：${headerJson.slice(0, 80)}` };
  if (!payload.ok) return { error: `payload 不是合法 JSON：${payloadJson.slice(0, 80)}` };

  const exp = payload.value.exp;
  const iat = payload.value.iat;
  const nbf = payload.value.nbf;

  return {
    header: header.value,
    payload: payload.value,
    signatureB64,
    headerB64Raw: headerB64,
    payloadB64Raw: payloadB64,
    expISO: timeStr(exp),
    iatISO: timeStr(iat),
    nbfISO: timeStr(nbf),
    status: expStatus(exp),
    remains: typeof exp === 'number' ? humanRemain(exp) : null,
    note: '本工具仅解析 JWT，不验证签名。若需要签名验证，请在服务端完成。',
  };
}
