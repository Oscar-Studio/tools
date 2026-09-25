/**
 * 历史记录 store：单例状态 + 订阅 + 持久化。
 * 数据 schema:
 *   { version: 1, items: [{ id, createdAt, type, value, options, score, entropy }], updatedAt }
 * 纯 localStorage,不传云端。
 */
import { loadLocal, saveLocal, clearLocal } from './storage.js';

const SCHEMA_VERSION = 1;
const MAX_HISTORY = 200;

const listeners = new Set();

function emptyState() {
  return { version: SCHEMA_VERSION, items: [], updatedAt: 0 };
}

function migrate(raw) {
  // 当前只有 v1,直接保留结构。未来加 v2 时在此递增迁移。
  if (!raw || typeof raw !== 'object') return emptyState();
  if (raw.version !== SCHEMA_VERSION) return emptyState();
  return {
    version: SCHEMA_VERSION,
    items: Array.isArray(raw.items) ? raw.items : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

let state = migrate(loadLocal());

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  state = { ...state, updatedAt: Date.now() };
  saveLocal(state);
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.warn('[history] listener error:', e); }
  }
}

function genId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 0x10000).toString(36);
}

/**
 * @param {{ type: 'strong'|'passphrase', value: string, options?: object, score?: number, entropy?: number }} entry
 * @returns {string} id
 */
export function addEntry(entry) {
  if (!entry || typeof entry.value !== 'string' || !entry.value) {
    throw new Error('addEntry: entry.value 必填');
  }
  const type = entry.type === 'passphrase' ? 'passphrase' : 'strong';
  const id = genId();
  const item = {
    id,
    createdAt: Date.now(),
    type,
    value: entry.value,
    options: entry.options || null,
    score: typeof entry.score === 'number' ? entry.score : null,
    entropy: typeof entry.entropy === 'number' ? entry.entropy : null,
  };
  state = {
    ...state,
    items: [item, ...state.items].slice(0, MAX_HISTORY),
  };
  notify();
  return id;
}

export function deleteEntry(id) {
  state = { ...state, items: state.items.filter((it) => it.id !== id) };
  notify();
}

export function clearAll() {
  state = { ...state, items: [] };
  notify();
}

export function replaceAll(items) {
  if (!Array.isArray(items)) throw new Error('replaceAll: items 必须是数组');
  state = {
    ...state,
    items: items.slice(0, MAX_HISTORY).map((it) => ({
      id: typeof it.id === 'string' ? it.id : genId(),
      createdAt: typeof it.createdAt === 'number' ? it.createdAt : Date.now(),
      type: it.type === 'passphrase' ? 'passphrase' : 'strong',
      value: typeof it.value === 'string' ? it.value : '',
      options: it.options || null,
      score: typeof it.score === 'number' ? it.score : null,
      entropy: typeof it.entropy === 'number' ? it.entropy : null,
    })),
  };
  notify();
}

export function exportJson() {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    generator: 'Oscar Studio password-generator',
    items: state.items,
  }, null, 2);
}

/**
 * 导入 JSON 字符串,要求顶层结构 { version: 1, items: [...] }。
 * @returns {{ ok: boolean, imported?: number, error?: string }}
 */
export function importJson(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { return { ok: false, error: 'JSON 解析失败: ' + e.message }; }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: '不是合法对象' };
  const items = parsed.items;
  if (!Array.isArray(items)) return { ok: false, error: '缺少 items 数组' };
  // 校验每个 item
  const clean = [];
  for (const it of items) {
    if (!it || typeof it.value !== 'string' || !it.value) continue;
    clean.push(it);
  }
  if (clean.length === 0) return { ok: false, error: 'items 为空' };
  replaceAll(clean);
  return { ok: true, imported: clean.length };
}

export function getMaxHistory() {
  return MAX_HISTORY;
}

// 测试用:重置 store（仅在注入 fake localStorage 的测试中调用）
export function _resetForTest() {
  state = emptyState();
  listeners.clear();
}