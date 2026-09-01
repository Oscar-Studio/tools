// =====================================================
// 入口：连接所有模块、初始化
// =====================================================

import { subscribe, replaceState, getState, setTheme } from './store.js';
import { initRender, render } from './render.js';
import { initDrag } from './drag.js';
import { isLoggedIn, onLoginChange, loginRedirect } from './auth.js';
import { pull, pushNow, onSyncStatus } from './sync.js';
import { maybePromptImport } from './migrate.js';

// ============ 抓取 DOM ============

const ui = {
    layout: document.querySelector('.layout'),
    body: document.body,
    searchInput: document.getElementById('searchInput'),
    themeBtn: document.getElementById('themeBtn'),
    syncStatus: document.getElementById('syncStatus'),
    groupList: document.getElementById('groupList'),
    newGroupBtn: document.getElementById('newGroupBtn'),
    currentGroupName: document.getElementById('currentGroupName'),
    taskList: document.getElementById('taskList'),
    quickAddForm: document.getElementById('quickAddForm'),
    quickAddInput: document.getElementById('quickAddInput'),
    detailPanel: document.getElementById('detailPanel'),
    detailBody: document.getElementById('detailBody'),
    closeDetailBtn: document.getElementById('closeDetailBtn'),
    toast: document.getElementById('toast'),
};

// ============ 焦点保护：每次 render 前记录，重建后恢复 ============

function captureFocus() {
    const a = document.activeElement;
    if (!a || a === document.body || !ui.detailBody.contains(a)) return null;
    const id = a.dataset.focusKey;
    if (!id) return null;
    let selectionStart = null, selectionEnd = null;
    if ('selectionStart' in a) {
        try { selectionStart = a.selectionStart; selectionEnd = a.selectionEnd; } catch {}
    }
    return { id, selectionStart, selectionEnd };
}

function restoreFocus(info) {
    if (!info) return;
    const a = ui.detailBody.querySelector(`[data-focus-key="${info.id}"]`);
    if (!a) return;
    a.focus({ preventScroll: true });
    if (info.selectionStart != null && 'setSelectionRange' in a) {
        try { a.setSelectionRange(info.selectionStart, info.selectionEnd); } catch {}
    }
}

let renderFn = () => {};
function renderSafe() {
    const info = captureFocus();
    renderFn();
    restoreFocus(info);
}

// ============ 主题 ============

function applyTheme(theme) {
    document.body.dataset.theme = theme;
    ui.themeBtn.textContent = theme === 'dark' ? '☀' : '🌗';
}

function initTheme() {
    const s = getState();
    applyTheme(s.theme || 'light');
}

// ============ 同步状态徽标 ============

function applySyncStatus({ status, label }) {
    window.__syncStatus = status;
    ui.syncStatus.className = `sync-pill sync-pill--${status}`;
    ui.syncStatus.querySelector('.sync-label').textContent = label || (
        status === 'cloud' ? '已同步' :
        status === 'syncing' ? '同步中' :
        status === 'error' ? '同步失败' : '本地'
    );
    ui.syncStatus.title = label || '';
}

// ============ Toast ============

let toastTimer = null;
function flash(msg) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    requestAnimationFrame(() => ui.toast.classList.add('is-show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        ui.toast.classList.remove('is-show');
        setTimeout(() => { ui.toast.hidden = true; }, 220);
    }, 1800);
}

window.flash = flash;

// ============ 初始化 ============

function init() {
    onSyncStatus(applySyncStatus);
    applySyncStatus({ status: isLoggedIn() ? 'cloud' : 'local', label: isLoggedIn() ? '已同步' : '本地' });

    initRender(ui);
    initDrag();
    initTheme();

    // 主题切换按钮（单次绑定）
    ui.themeBtn.addEventListener('click', () => {
        const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        setTheme(next);
    });

    // 点击右上角同步徽标：未登录则跳登录；登录中点击强制拉取
    ui.syncStatus.addEventListener('click', async () => {
        if (!isLoggedIn()) { loginRedirect(); return; }
        try {
            const cloud = await pull();
            if (cloud) {
                replaceState(cloud);
                flash('已从云端拉取');
                render();
            } else {
                flash('云端暂无数据');
            }
        } catch {
            flash('拉取失败');
        }
    });
    ui.syncStatus.style.cursor = 'pointer';
    ui.syncStatus.title = isLoggedIn() ? '点击拉取云端' : '点击登录以同步';

    // 订阅 store（带焦点保护）
    renderFn = render;
    subscribe(() => renderSafe());

    // 登录状态变化
    onLoginChange(async ({ loggedIn }) => {
        applySyncStatus({
            status: loggedIn ? 'cloud' : 'local',
            label: loggedIn ? '已同步' : '本地',
        });
        ui.syncStatus.title = loggedIn ? '点击拉取云端' : '点击登录以同步';

        if (loggedIn) {
            try {
                const cloud = await pull();
                const local = getState();
                const localHas = local.groups.length > 0 || local.tasks.length > 0;
                const cloudEmpty = !cloud || (cloud.groups.length === 0 && cloud.tasks.length === 0);

                if (cloudEmpty && localHas) {
                    maybePromptImport();
                } else if (cloud) {
                    replaceState(cloud);
                    render();
                    flash('已从云端加载');
                }
            } catch (e) {
                console.warn(e);
            }
        }
    });

    // 启动时：若已登录，拉取一次
    if (isLoggedIn()) {
        pull().then((cloud) => {
            if (cloud && (cloud.groups.length || cloud.tasks.length)) {
                replaceState(cloud);
                render();
            }
        }).catch(() => {});
    }

    // 离开页面前 flush
    window.addEventListener('beforeunload', () => {
        if (isLoggedIn()) pushNow();
    });

    // 快捷键：⌘/Ctrl+K 聚焦搜索
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            ui.searchInput.focus();
            ui.searchInput.select();
        }
        if (e.key === 'Escape') {
            if (document.activeElement && document.activeElement.tagName !== 'BODY') {
                document.activeElement.blur();
            }
        }
    });

    // 任务删除动画结束时由 render.js 派发的事件：自动隐藏已被删除的节点
    window.addEventListener('todo:flash', (e) => {
        // 目前 flash 已显示 toast，无需额外动作
    });
}

document.addEventListener('DOMContentLoaded', init);
