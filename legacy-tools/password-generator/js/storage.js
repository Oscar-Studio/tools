/**
 * localStorage 包装：加载/保存/清除历史记录。
 * key: oscar.password.v1
 */
const KEY = 'oscar.password.v1';

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (data.version !== 1) return null;
    if (!Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveLocal(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('[storage] save failed:', e);
    return false;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}