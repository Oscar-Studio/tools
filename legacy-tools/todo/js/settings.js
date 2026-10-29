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

// 登录用户通过后端保存；访客仅保存到本机。
export async function saveReminderPrefs(next) {
    if (!TIME_RE.test(next.defaultTime) || !Number.isInteger(next.defaultReminder) || next.defaultReminder < 0 || next.defaultReminder > 1440) {
        throw new Error('请输入有效时间及 0–1440 的整数分钟');
    }
    const token = readAuthToken();
    if (token) {
        const resp = await fetch(`${resolveApiBase()}/api/ui`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ todoDefaultTime: next.defaultTime, todoDefaultReminder: next.defaultReminder }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.message || '保存失败，请重试');
        next = { defaultTime: data.ui.todoDefaultTime, defaultReminder: data.ui.todoDefaultReminder };
    }
    writeCache(next);
    return token ? '已保存到云端' : '已保存到本机，登录后可保存到云端';
}

export function initReminderSettings() {
    const dialog = document.getElementById('reminderSettingsDialog');
    const time = document.getElementById('reminderDefaultTime');
    const offset = document.getElementById('reminderDefaultOffset');
    const status = document.getElementById('reminderSettingsStatus');
    const save = document.getElementById('reminderSettingsSave');
    document.getElementById('reminderSettingsBtn').addEventListener('click', async () => {
        save.disabled = true;
        status.textContent = '加载中…';
        dialog.showModal();
        const prefs = await loadReminderPrefs();
        time.value = prefs.defaultTime;
        offset.value = prefs.defaultReminder;
        status.textContent = '';
        save.disabled = false;
    });
    document.getElementById('reminderSettingsClose').addEventListener('click', () => dialog.close());
    document.getElementById('reminderSettingsForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        save.disabled = true;
        try {
            status.textContent = await saveReminderPrefs({ defaultTime: time.value, defaultReminder: Number(offset.value) });
        } catch (error) {
            status.textContent = error.message;
        } finally {
            save.disabled = false;
        }
    });
}
