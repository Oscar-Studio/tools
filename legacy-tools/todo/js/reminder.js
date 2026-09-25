// =====================================================
// 浏览器 Notification 提醒服务
//   - 每 30s 扫一次任务
//   - 计算 triggerAt = dueAt - (reminderOffset ?? defaultReminder)
//   - dueAt = dueDate + (dueTime ?? defaultTime)
//   - 命中条件：triggerAt <= now < dueAt + 24h（避免过期太久还反复提醒）
//   - 触发后写 notifiedAt，防重复
//
// 依赖：
//   getState      () => state
//   markNotified  (taskId, ts) => void  // 触发 store.updateTask
//   getPrefs      () => { defaultTime: 'HH:MM', defaultReminder: number } // 从 ui_config
// =====================================================

const CHECK_INTERVAL_MS = 30 * 1000;
// 过期太久（>24h）就不再补提醒，避免每次打开页面都弹历史逾期
const OVERDUE_GRACE_MS = 24 * 60 * 60 * 1000;

let intervalHandle = null;
let permissionRequested = false;

function isSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
}

function currentPermission() {
    if (!isSupported()) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
}

export function getNotificationPermission() {
    return currentPermission();
}

export async function requestNotificationPermission() {
    if (!isSupported()) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    permissionRequested = true;
    try {
        return await Notification.requestPermission();
    } catch {
        return 'denied';
    }
}

// 把 dueDate('YYYY-MM-DD') + dueTime('HH:MM') 合成本地时区时间戳
function buildDueAt(dueDate, dueTime) {
    if (!dueDate) return null;
    if (dueTime && /^\d{1,2}:\d{2}$/.test(dueTime)) {
        const [hh, mm] = dueTime.split(':').map((v) => +v);
        const d = new Date(dueDate + 'T00:00:00');
        d.setHours(hh, mm, 0, 0);
        return d.getTime();
    }
    // 无时间：落到当天 23:59，提醒点在 23:59 - defaultReminder
    const d = new Date(dueDate + 'T00:00:00');
    d.setHours(23, 59, 0, 0);
    return d.getTime();
}

function shouldNotify(task, now, defaultTime, defaultReminder) {
    if (task.done || !task.dueDate || task.notifiedAt) return false;
    const dueAt = buildDueAt(task.dueDate, task.dueTime || defaultTime);
    if (dueAt == null) return false;
    const offset = (task.reminderOffset != null && Number.isFinite(task.reminderOffset))
        ? task.reminderOffset
        : defaultReminder;
    const triggerAt = dueAt - offset * 60 * 1000;
    // 命中：triggerAt 已过，且距离 dueAt 不超过 24h
    return triggerAt <= now && now < dueAt + OVERDUE_GRACE_MS;
}

function fireNotification(task) {
    if (!isSupported() || Notification.permission !== 'granted') return;
    const timePart = task.dueTime ? ` ${task.dueTime}` : '';
    const body = `📅 ${task.dueDate}${timePart}`;
    try {
        const n = new Notification(task.title || '(无标题)', {
            body,
            tag: `todo-${task.id}`,
            renotify: false,
            silent: false,
        });
        n.onclick = () => {
            try { window.focus(); } catch {}
            try { n.close(); } catch {}
        };
    } catch {
        // 某些浏览器对未激活 tab 不允许 Notification，忽略
    }
}

function tick({ getState, markNotified, getPrefs }) {
    const now = Date.now();
    const state = getState();
    if (!state || !Array.isArray(state.tasks)) return;
    let prefs;
    try {
        prefs = getPrefs() || {};
    } catch {
        prefs = {};
    }
    const defaultTime = prefs.defaultTime || '09:00';
    const defaultReminder = Number.isFinite(prefs.defaultReminder) ? prefs.defaultReminder : 30;

    for (const task of state.tasks) {
        if (!shouldNotify(task, now, defaultTime, defaultReminder)) continue;
        fireNotification(task);
        try {
            markNotified(task.id, now);
        } catch (e) {
            console.warn('[reminder] markNotified failed', e);
        }
    }
}

export function initReminder({ getState, markNotified, getPrefs }) {
    if (intervalHandle) return; // 单例
    if (!isSupported()) {
        console.info('[reminder] Notification API 不支持，跳过');
        return;
    }
    // 首次扫描
    tick({ getState, markNotified, getPrefs });
    intervalHandle = setInterval(() => {
        tick({ getState, markNotified, getPrefs });
    }, CHECK_INTERVAL_MS);
}

export function stopReminder() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}
