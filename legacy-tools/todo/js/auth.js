// =====================================================
// 登录状态检测
// - 以跨子域 userToken Cookie 为真理之源（user-button.js 设定）
// - localStorage.ai_token / ai_user 只是当前域缓存
// - 监听 storage 事件 + 自定义 user:login-changed 事件
// =====================================================

const API_BASE = 'https://api.oscarstudio.cn/api';

function getCookie(name) {
    const v = `; ${document.cookie}`;
    const parts = v.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function readLs(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function isTokenExpired(token) {
    if (!token) return true;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (!payload.exp) return true;
        return Date.now() >= payload.exp * 1000;
    } catch { return true; }
}

export function getToken() {
    const cookieToken = getCookie('userToken');
    if (cookieToken) return cookieToken;
    const lsToken = readLs('ai_token');
    if (lsToken && !isTokenExpired(lsToken)) return lsToken;
    return null;
}

export function getUser() {
    const raw = readLs('ai_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

export function isLoggedIn() {
    return !!getToken();
}

const listeners = new Set();

export function onLoginChange(cb) {
    listeners.add(cb);
    // 监听同源 storage 事件（其他标签页登入/登出）
    window.addEventListener('storage', (e) => {
        if (e.key === 'ai_token' || e.key === 'ai_user' || e.key === 'userToken') {
            cb({ loggedIn: isLoggedIn(), user: getUser() });
        }
    });
    // user-button.js 也会派发
    window.addEventListener('user:login-changed', () => {
        cb({ loggedIn: isLoggedIn(), user: getUser() });
    });
}

export function notifyChange() {
    const detail = { loggedIn: isLoggedIn(), user: getUser() };
    listeners.forEach((cb) => cb(detail));
}

export async function logout() {
    try {
        await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    } catch {
        document.cookie = 'userToken=; max-age=0; path=/; domain=.oscarstudio.cn';
    }
    try { localStorage.removeItem('ai_token'); localStorage.removeItem('ai_user'); } catch {}
    notifyChange();
}

export async function loginRedirect() {
    window.location.href = `https://api.oscarstudio.cn/auth.html?return=${encodeURIComponent(window.location.href)}`;
}
