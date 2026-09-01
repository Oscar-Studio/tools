/**
 * 编解码器：所有纯文本 ↔ 文本的转换。
 * 纯函数，可在 Node 与浏览器里运行。MD5 / SHA / HMAC 在 hashes.js。
 * Punycode 算法移植自 Python 的 encodings.punycode（RFC 3492 标准实现）。
 */

const utf8 = new TextEncoder();

// === Base64 ===
export function b64Encode(str, urlSafe = false) {
  const bytes = utf8.encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  let out = btoa(bin);
  if (urlSafe) {
    out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return out;
}

export function b64Decode(s, urlSafe = false) {
  if (typeof s !== 'string') throw new Error('base64: input must be string');
  // Reject embedded whitespace (multi-line, spaces, etc.) before any alphabet mapping.
  if (/[\s]/.test(s)) throw new Error('base64: invalid input (whitespace not allowed)');
  let t = s;
  if (urlSafe) {
    t = t.replace(/-/g, '+').replace(/_/g, '/');
    // pad
    const pad = (4 - (t.length % 4)) % 4;
    t = t + '='.repeat(pad);
  } else {
    // Standard alphabet check (only A-Z a-z 0-9 + / and optional = padding).
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('base64: invalid input (bad alphabet)');
  }
  let bin;
  try {
    bin = atob(t);
  } catch (e) {
    throw new Error(`base64: invalid input (${e.message || e})`);
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// === URL Percent (RFC 3986 unreserved-only safe set) ===
const PCT_EXCLUDE = /[^!*'();:@&=+$,/?#[\]A-Za-z0-9\-._~]/g;
export function pctEncode(s) {
  // encodeURIComponent keeps most of RFC 3986 unreserved except * ' ( ) ; etc.
  return encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
export function pctDecode(s) {
  return decodeURIComponent(s);
}

// === Hex (UTF-8 bytes) ===
export function hexEncode(s) {
  const bytes = utf8.encode(s);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
export function hexDecode(s) {
  if (typeof s !== 'string') throw new Error('hex: input must be string');
  if (s.length % 2 !== 0) throw new Error(`hex: input length must be even, got ${s.length}`);
  if (!/^[0-9a-fA-F]*$/.test(s)) throw new Error('hex: invalid byte at 0 (non-hex character)');
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(s.substr(i * 2, 2), 16);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// === Unicode escape ===
export function unicodeEscape(s, { xhh = false } = {}) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (xhh && cp < 0x80) {
      out += '\\x' + cp.toString(16).padStart(2, '0');
    } else if (cp <= 0xFFFF) {
      out += '\\u' + cp.toString(16).padStart(4, '0');
    } else {
      // surrogate pair
      const v = cp - 0x10000;
      const hi = 0xD800 + (v >> 10);
      const lo = 0xDC00 + (v & 0x3FF);
      out += '\\u' + hi.toString(16).padStart(4, '0') + '\\u' + lo.toString(16).padStart(4, '0');
    }
  }
  return out;
}

export function unicodeUnescape(s, { xhh = false } = {}) {
  // Replace \xHH first if enabled; then \uXXXX or \u{XXXXX}; supports surrogate pairs.
  let working = s;
  if (xhh) {
    working = working.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  // 1) combine surrogate pairs first
  working = working.replace(/\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g, (_, hi, lo) => {
    const cp = ((parseInt(hi, 16) - 0xD800) << 10) + (parseInt(lo, 16) - 0xDC00) + 0x10000;
    return String.fromCodePoint(cp);
  });
  // 2) BMP escapes
  working = working.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => {
    const cp = parseInt(h, 16);
    if (cp >= 0xD800 && cp <= 0xDFFF) {
      throw new Error(`unicode: lone surrogate \\u${h}`);
    }
    return String.fromCharCode(cp);
  });
  // 3) \u{...} variable length (extended plane optional)
  working = working.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => {
    const cp = parseInt(h, 16);
    if (cp > 0x10FFFF) throw new Error(`unicode: code point out of range \\u{${h}}`);
    if (cp >= 0xD800 && cp <= 0xDFFF) {
      throw new Error(`unicode: lone surrogate \\u{${h}}`);
    }
    return String.fromCodePoint(cp);
  });
  return working;
}

// === HTML entities (named + numeric) ===
const HTML_ENTITIES = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  ' ': '&nbsp;', '¡': '&iexcl;', '¢': '&cent;', '£': '&pound;', '¤': '&curren;',
  '¥': '&yen;', '¦': '&brvbar;', '§': '&sect;', '¨': '&uml;', '©': '&copy;',
  'ª': '&ordf;', '«': '&laquo;', '¬': '&not;', '­': '&shy;', '®': '&reg;',
  '¯': '&macr;', '°': '&deg;', '±': '&plusmn;', '²': '&sup2;', '³': '&sup3;',
  '´': '&acute;', 'µ': '&micro;', '¶': '&para;', '·': '&middot;', '¸': '&cedil;',
  '¹': '&sup1;', 'º': '&ordm;', '»': '&raquo;', '¼': '&frac14;', '½': '&frac12;',
  '¾': '&frac34;', '¿': '&iquest;', '×': '&times;', '÷': '&divide;',
  'À': '&Agrave;', 'Á': '&Aacute;', 'Â': '&Acirc;', 'Ã': '&Atilde;',
  'Ä': '&Auml;', 'Å': '&Aring;', 'Æ': '&AElig;', 'Ç': '&Ccedil;',
  'È': '&Egrave;', 'É': '&Eacute;', 'Ê': '&Ecirc;', 'Ë': '&Euml;',
  'Ì': '&Igrave;', 'Í': '&Iacute;', 'Î': '&Icirc;', 'Ï': '&Iuml;',
  'Ð': '&ETH;', 'Ñ': '&Ntilde;', 'Ò': '&Ograve;', 'Ó': '&Oacute;',
  'Ô': '&Ocirc;', 'Õ': '&Otilde;', 'Ö': '&Ouml;', 'Ø': '&Oslash;',
  'Ù': '&Ugrave;', 'Ú': '&Uacute;', 'Û': '&Ucirc;', 'Ü': '&Uuml;',
  'Ý': '&Yacute;', 'Þ': '&THORN;', 'ß': '&szlig;', 'à': '&agrave;',
  'á': '&aacute;', 'â': '&acirc;', 'ã': '&atilde;', 'ä': '&auml;',
  'å': '&aring;', 'æ': '&aelig;', 'ç': '&ccedil;', 'è': '&egrave;',
  'é': '&eacute;', 'ê': '&ecirc;', 'ë': '&euml;', 'ì': '&igrave;',
  'í': '&iacute;', 'î': '&icirc;', 'ï': '&iuml;', 'ð': '&eth;',
  'ñ': '&ntilde;', 'ò': '&ograve;', 'ó': '&oacute;', 'ô': '&ocirc;',
  'õ': '&otilde;', 'ö': '&ouml;', 'ø': '&oslash;', 'ù': '&ugrave;',
  'ú': '&uacute;', 'û': '&ucirc;', 'ü': '&uuml;', 'ý': '&yacute;',
  'þ': '&thorn;', 'ÿ': '&yuml;', 'œ': '&oelig;', 'Œ': '&OElig;',
  '–': '&ndash;', '—': '&mdash;', '‘': '&lsquo;', '’': '&rsquo;',
  '“': '&ldquo;', '”': '&rdquo;', '•': '&bull;', '…': '&hellip;',
  '€': '&euro;', '™': '&trade;', '←': '&larr;', '→': '&rarr;',
  '↑': '&uarr;', '↓': '&darr;', '↔': '&harr;', '⇐': '&lArr;',
  '⇒': '&rArr;', '♠': '&spades;', '♣': '&clubs;', '♥': '&hearts;',
  '♦': '&diams;',
};
const ENTITY_TO_CHAR = Object.fromEntries(
  Object.entries(HTML_ENTITIES).map(([k, v]) => [v, k])
);

export function htmlEntitiesEncode(s) {
  let out = '';
  for (const ch of s) {
    if (HTML_ENTITIES[ch]) {
      out += HTML_ENTITIES[ch];
    } else {
      const cp = ch.codePointAt(0);
      // Always use named entity if available
      if (cp > 127) out += '&#' + cp + ';';
      else out += ch;
    }
  }
  return out;
}

export function htmlEntitiesDecode(s) {
  if (typeof s !== 'string') throw new Error('html: input must be string');
  // 先做命名实体替换（避免 &amp;#x; 被二次还原为 &#x;）
  // 注意：单次替换而非迭代，避免 &amp;amp; 被双重解码
  s = s.replace(/&[a-zA-Z]+;/g, (m) => ENTITY_TO_CHAR[m] ?? m);
  // 数字实体优先（避免被命名匹配截胡）
  // Malformed / out-of-range numeric entities are escaped (the '&' becomes '&amp;')
  // so the literal text is preserved without inserting NUL or surrogate chars.
  s = s.replace(/&#x([0-9a-fA-F]*);/g, (_, h) => {
    if (h.length === 0) return '&amp;#x;'; // malformed entity
    const cp = parseInt(h, 16);
    if (!Number.isFinite(cp) || cp < 1 || cp > 0x10FFFF) return '&amp;#x' + h + ';'; // reject NUL/0, out-of-range, overflow
    return String.fromCodePoint(cp);
  });
  s = s.replace(/&#([0-9]+);/g, (_, d) => {
    if (d.length > 7) return '&amp;#' + d + ';'; // huge numeric entity; reject overflow
    const cp = parseInt(d, 10);
    if (!Number.isFinite(cp) || cp < 1 || cp > 0x10FFFF) return '&amp;#' + d + ';'; // reject NUL/0, out-of-range
    return String.fromCodePoint(cp);
  });
  return s;
}

// === ROT13 ===
export function rot13(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) out += String.fromCharCode(((c - 65 + 13) % 26) + 65);
    else if (c >= 97 && c <= 122) out += String.fromCharCode(((c - 97 + 13) % 26) + 97);
    else out += ch;
  }
  return out;
}

// === Punycode (RFC 3492) ===
// Algorithm adapted from Python's encodings/punycode.py (Martin v. Löwis).
const PC_BASE = 36;
const PC_TMIN = 1;
const PC_TMAX = 26;
const PC_SKEW = 38;
const PC_DAMP = 700;
const PC_INITIAL_BIAS = 72;
const PC_INITIAL_N = 128;
const PC_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function pcAdapt(delta, first, numChars) {
  // NumChars may be 0 if input was only ASCII; guard against div0.
  delta = first ? Math.floor(delta / PC_DAMP) : Math.floor(delta / 2);
  delta += Math.floor(delta / numChars);
  let divisions = 0;
  while (delta > 455) { // (base - tmin) * tmax / 2
    delta = Math.floor(delta / 35);
    divisions += 36;
  }
  return divisions + Math.floor((36 * delta) / (delta + PC_SKEW));
}

function pcT(j, bias) {
  const v = PC_BASE * (j + 1) - bias;
  if (v < PC_TMIN) return PC_TMIN;
  if (v > PC_TMAX) return PC_TMAX;
  return v;
}

function pcEncodeDigit(d) {
  return PC_DIGITS[d];
}

function pcGenerateGeneralizedInteger(n, bias) {
  let result = '';
  let j = 0;
  for (;;) {
    const t = pcT(j, bias);
    if (n < t) return result + pcEncodeDigit(n);
    result += pcEncodeDigit(t + ((n - t) % (PC_BASE - t)));
    n = Math.floor((n - t) / (PC_BASE - t));
    j++;
  }
}

function pcSelectiveFind(codePoints, target, index, pos) {
  while (++pos < codePoints.length) {
    const c = codePoints[pos];
    if (c === target) return [index + 1, pos];
    if (c < target) index++;
  }
  return [-1, -1];
}

function pcInsertionUnsort(codePoints, extendedSorted) {
  let oldChar = PC_INITIAL_N;
  const result = [];
  let oldIndex = -1;
  for (const ch of extendedSorted) {
    let index = -1;
    let pos = -1;
    const char = ch;
    let curLen = 0;
    for (const cp of codePoints) if (cp < char) curLen++;
    let delta = (curLen + 1) * (char - oldChar);
    for (;;) {
      [index, pos] = pcSelectiveFind(codePoints, char, index, pos);
      if (index === -1) break;
      delta += index - oldIndex;
      result.push(delta - 1);
      oldIndex = index;
      delta = 0;
    }
    oldChar = char;
  }
  return result;
}

function pcSegregate(codePoints) {
  let base = '';
  const extSet = new Set();
  for (const cp of codePoints) {
    if (cp < 128) base += String.fromCodePoint(cp);
    else extSet.add(cp);
  }
  return [base, [...extSet].sort((a, b) => a - b)];
}

export function punycodeEncode(input) {
  const codePoints = [...input].map(c => c.codePointAt(0));
  const [base, extended] = pcSegregate(codePoints);
  if (extended.length === 0) return base; // pure ASCII, no dash
  const deltas = pcInsertionUnsort(codePoints, extended);
  let encoded = '';
  let bias = PC_INITIAL_BIAS;
  const baseLen = [...base].length;
  for (let points = 0; points < deltas.length; points++) {
    encoded += pcGenerateGeneralizedInteger(deltas[points], bias);
    bias = pcAdapt(deltas[points], points === 0, baseLen + points + 1);
  }
  return base ? base + '-' + encoded : encoded;
}

function pcDecodeGeneralizedNumber(extended, extPos, bias) {
  let result = 0;
  let w = 1;
  let j = 0;
  for (;;) {
    if (extPos >= extended.length) throw new Error('punycode: incomplete input');
    const ch = extended.charCodeAt(extPos++);
    let digit;
    if (ch >= 65 && ch <= 90) digit = ch - 65;
    else if (ch >= 48 && ch <= 57) digit = ch - 22;
    else if (ch >= 97 && ch <= 122) digit = ch - 97;
    else throw new Error(`punycode: invalid extended char code 0x${ch.toString(16)}`);
    const t = pcT(j, bias);
    result += digit * w;
    if (digit < t) return [extPos, result];
    w *= PC_BASE - t;
    j++;
  }
}

export function punycodeDecode(input) {
  const s = String(input);
  // find last '-'
  const dash = s.lastIndexOf('-');
  const base = dash >= 0 ? s.slice(0, dash) : '';
  const encoded = dash >= 0 ? s.slice(dash + 1) : s;
  // 1) Decode deltas from encoded (uppercase per spec)
  const encUpper = encoded.toUpperCase();
  let char = PC_INITIAL_N;
  let pos = -1;
  let bias = PC_INITIAL_BIAS;
  const out = [...base];
  const decodedFirst = { v: true };
  let extPos = 0;
  while (extPos < encUpper.length) {
    const [newPos, delta] = pcDecodeGeneralizedNumber(encUpper, extPos, bias);
    const beforeLen = out.length;
    pos += delta + 1;
    const slot = out.length + 1;
    char += Math.floor(pos / slot);
    if (char > 0x10FFFF) char = 0xFFFD;
    pos = ((pos % slot) + slot) % slot;
    out.splice(pos, 0, String.fromCodePoint(char));
    bias = pcAdapt(delta, decodedFirst.v, beforeLen + 1);
    decodedFirst.v = false;
    extPos = newPos;
  }
  return out.join('');
}

// === ASCII dump ===
export function toAsciiDump(s) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20) {
      if (cp === 0x09) out += '\\t';
      else if (cp === 0x0A) out += '\\n';
      else if (cp === 0x0D) out += '\\r';
      else out += '\\x' + cp.toString(16).padStart(2, '0');
    } else if (cp === 0x7F) {
      out += '\\x7f';
    } else if (cp < 0x80) {
      out += ch;
    } else if (cp <= 0xFFFF) {
      out += '\\u' + cp.toString(16).padStart(4, '0');
    } else {
      // surrogate pair (RFC 2781): v = cp - 0x10000; hi = 0xD800 + (v >> 10); lo = 0xDC00 + (v & 0x3FF)
      const v = cp - 0x10000;
      const hi = 0xD800 + (v >> 10);
      const lo = 0xDC00 + (v & 0x3FF);
      out += '\\u' + hi.toString(16).padStart(4, '0') + '\\u' + lo.toString(16).padStart(4, '0');
    }
  }
  return out;
}

// === UTF-8 byte count helper ===
export function utf8Bytes(s) {
  return utf8.encode(s).length;
}
