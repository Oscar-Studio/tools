// =====================================================
// localStorage 适配（key: oscar.todo.v1）
// 仅在浏览器环境运行
// =====================================================

const KEY = 'oscar.todo.v1';

export function loadLocal() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        if (!Array.isArray(data.groups) || !Array.isArray(data.tasks)) return null;
        return data;
    } catch {
        return null;
    }
}

export function saveLocal(todos) {
    try {
        localStorage.setItem(KEY, JSON.stringify(todos));
        return true;
    } catch (e) {
        console.warn('[todo storage] save failed:', e);
        return false;
    }
}

export function clearLocal() {
    try { localStorage.removeItem(KEY); } catch {}
}
