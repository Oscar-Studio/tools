// =====================================================
// 云端同步：debounced PUT + 失败重试 + 状态回调
// =====================================================

import { getToken } from './auth.js';

const API_BASE = 'https://api.oscarstudio.cn/api';
const ENDPOINT = `${API_BASE}/todos`;

const PUSH_DEBOUNCE_MS = 1500;
const RETRY_DELAYS = [1000, 3000, 8000];

let pushTimer = null;
let retryAttempt = 0;
let pendingPayload = null;
let statusCb = null;

export function onSyncStatus(cb) { statusCb = cb; }

function setStatus(status, label) {
    if (statusCb) statusCb({ status, label });
}

export function isOnline() {
    return navigator.onLine !== false;
}

export async function pull() {
    const token = getToken();
    if (!token) return null;
    setStatus('syncing', '同步中…');
    try {
        const resp = await fetch(ENDPOINT, {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include',
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.success) {
            setStatus('cloud', '已同步');
            return data.todos; // 可能是 null
        }
        throw new Error(data.message || 'pull failed');
    } catch (e) {
        console.warn('[todo sync] pull failed:', e.message);
        setStatus('error', '同步失败');
        throw e;
    }
}

export function pushDebounced(todos) {
    pendingPayload = todos;
    if (pushTimer) clearTimeout(pushTimer);
    if (!getToken()) {
        setStatus('local', '本地');
        return;
    }
    setStatus('syncing', '同步中…');
    pushTimer = setTimeout(() => pushNow(), PUSH_DEBOUNCE_MS);
}

export async function pushNow() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (!pendingPayload) return;
    if (!getToken()) return;

    const payload = pendingPayload;
    pendingPayload = null;

    try {
        const resp = await fetch(ENDPOINT, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ todos: payload }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        retryAttempt = 0;
        setStatus('cloud', '已同步');
    } catch (e) {
        console.warn('[todo sync] push failed:', e.message);
        // 把 payload 重新塞回去
        pendingPayload = payload;
        scheduleRetry();
    }
}

function scheduleRetry() {
    const delay = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)];
    retryAttempt++;
    setStatus('error', `${Math.round(delay / 1000)}s 后重试…`);
    setTimeout(() => {
        if (pendingPayload && getToken()) pushNow();
    }, delay);
}

// 切到登录态：立即把待推送数据 flush 一次
export function flushOnLogin() {
    if (pendingPayload && getToken()) pushNow();
}
