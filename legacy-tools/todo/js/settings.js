// =====================================================
// 从 ui_config 拉待办提醒默认值（defaultTime / defaultReminder）
//   - localStorage 同步兜底（key: oscar-todo-default-time / -reminder）
//   - 启动后异步 fetch /api/ui 覆盖缓存
//
// API 字段名（API/routes/ui.js）：
//   todoDefaultTime: 'HH:MM'
//   todoDefaultReminder: 0-1440 整数分钟
// =====================================================

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const STORAGE_KEY_TIME = 'oscar-todo-default-time';
const STORAGE_KEY_REMINDER = 'oscar-todo-default-reminder';
const DEFAULT_TIME = '09:00';
const DEFAULT_REMINDER = 30;

let cache = null;

function readCache() {
    if (cache) return cache;
    let time = DEFAULT_TIME;
    let reminder = DEFAULT_REMINDER;
    try {
        const t = localStorage.getItem(STORAGE_KEY_TIME);
        if (t && TIME_RE.test(t)) time = t;
        const r = localStorage.getItem(STORAGE_KEY_REMINDER);
        if (r != null) {
            const n = parseInt(r, 10);
            if (Number.isFinite(n) && n >= 0 && n <= 1440) reminder = n;
        }
    } catch {}
    cache = { defaultTime: time, defaultReminder: reminder };
    return cache;
}

function writeCache(next) {
    cache = next;
    try {
        localStorage.setItem(STORAGE_KEY_TIME, next.defaultTime);
        localStorage.setItem(STORAGE_KEY_REMINDER, String(next.defaultReminder));
    } catch {}
}

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function getReminderPrefs() {
    return { ...readCache() };
}

function resolveApiBase() {
    return (typeof window !== 'undefined' && window.API_BASE) || 'https://api.oscarstudio.cn';
}

function readAuthToken() {
    // 与 useHomeTheme.tsx 同款回退：cookie > localStorage
    try {
        const c = document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith('userToken='));
        if (c) return decodeURIComponent(c.slice('userToken='.length));
    } catch {}
    try {
        return localStorage.getItem('ai_token') || localStorage.getItem('userToken');
    } catch {
        return null;
    }
}

export async function loadReminderPrefs() {
    const local = { ...readCache() };
    const token = readAuthToken();
    if (!token) return local;
    try {
        const resp = await fetch(`${resolveApiBase()}/api/ui`, {
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) return local;
        const data = await resp.json().catch(() => null);
        if (!data?.success || !data.ui) return local;
        const ui = data.ui;
        const next = { defaultTime: local.defaultTime, defaultReminder: local.defaultReminder };
        if (typeof ui.todoDefaultTime === 'string' && TIME_RE.test(ui.todoDefaultTime)) {
            next.defaultTime = ui.todoDefaultTime;
        }
        if (Number.isFinite(ui.todoDefaultReminder)) {
            next.defaultReminder = clamp(ui.todoDefaultReminder, 0, 1440);
        }
        writeCache(next);
        return next;
    } catch {
        return local;
    }
}
