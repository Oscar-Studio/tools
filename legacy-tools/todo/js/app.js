// =====================================================
// 入口：连接所有模块、初始化
//
// ⚠️ 缓存版本铁律（改任何 js/ 下的文件都要遵守）：
//   index.html 只给 app.js / styles.css 加了 ?v=，模块之间是相对 import。
//   浏览器把 `./render.js` 和 `./render.js?v=xxx` 当成**两个不同模块**
//   （各自独立实例，模块内的变量不共享），所以：
//     1) 所有模块间 import 必须带同一个 ?v=，不能只给一部分加；
//        只加一部分会出现两份 render.js，drag.js 拿到的那份 ui 还是空的，
//        initDrag() 抛错会中断 init()，主题/通知/同步全失效。
//     2) 部署时把 index.html 与全部 import 的版本号一起改。
//   当前版本：2026-09-26c
// =====================================================

import { subscribe, replaceState, getState, setTheme, updateTask } from './store.js?v=2026-09-26c';
import { initRender, render } from './render.js?v=2026-09-26c';
import { initDrag } from './drag.js?v=2026-09-26c';
import { isLoggedIn, onLoginChange, loginRedirect } from './auth.js?v=2026-09-26c';
import { pull, pushNow, onSyncStatus } from './sync.js?v=2026-09-26c';
import { maybePromptImport } from './migrate.js?v=2026-09-26c';
import {
    initReminder, stopReminder,
    getNotificationPermission, requestNotificationPermission,
} from './reminder.js?v=2026-09-26c';
import { loadReminderPrefs, getReminderPrefs } from './settings.js?v=2026-09-26c';

// ============ 抓取 DOM ============

const ui = {
    layout: document.querySelector('.layout'),
    body: document.body,
    searchInput: document.getElementById('searchInput'),
    themeBtn: document.getElementById('themeBtn'),
    bellBtn: document.getElementById('bellBtn'),
    syncStatus: document.getElementById('syncStatus'),
    groupList: document.getElementById('groupList'),
    newGroupBtn: document.getElementById('newGroupBtn'),
    currentGroupName: document.getElementById('currentGroupName'),
    taskList: document.getElementById('taskList'),
    quickAddForm: document.getElementById('quickAddForm'),
    quickAddInput: document.getElementById('quickAddInput'),
    quickAddHighlightInner: document.querySelector('#quickAddHighlight .quick-add-highlight-inner'),
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

// ============ 通知铃铛按钮 ============

function updateBellIcon() {
    if (!ui.bellBtn) return;
    const cur = getNotificationPermission();
    ui.bellBtn.classList.remove('bell--granted', 'bell--denied', 'bell--unsupported');
    if (cur === 'granted') {
        ui.bellBtn.textContent = '🔔';
        ui.bellBtn.classList.add('bell--granted');
        ui.bellBtn.title = '通知已开启';
    } else if (cur === 'denied') {
        ui.bellBtn.textContent = '🔕';
        ui.bellBtn.classList.add('bell--denied');
        ui.bellBtn.title = '通知被拒绝：在浏览器站点设置中开启';
    } else if (cur === 'unsupported') {
        ui.bellBtn.textContent = '🔕';
        ui.bellBtn.classList.add('bell--unsupported');
        ui.bellBtn.title = '当前浏览器不支持通知';
    } else {
        ui.bellBtn.textContent = '🔕';
        ui.bellBtn.title = '点击开启浏览器通知';
    }
}

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

    // 通知权限铃铛按钮
    updateBellIcon();
    ui.bellBtn.addEventListener('click', async () => {
        const cur = getNotificationPermission();
        if (cur === 'granted') {
            flash('通知已开启 ✓');
            return;
        }
        if (cur === 'denied') {
            flash('浏览器已拒绝通知，请在站点设置中开启');
            return;
        }
        if (cur === 'unsupported') {
            flash('当前浏览器不支持通知');
            return;
        }
        const result = await requestNotificationPermission();
        updateBellIcon();
        if (result === 'granted') {
            flash('通知已开启 ✓');
        } else {
            flash('通知未开启，提醒功能将不可用');
        }
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

    // 启动提醒服务：先拉 ui_config 里的默认值，再起定时器
    loadReminderPrefs().finally(() => {
        initReminder({
            getState,
            getPrefs: getReminderPrefs,
            markNotified: (taskId, ts) => {
                try { updateTask(taskId, { notifiedAt: ts }); } catch (e) { console.warn(e); }
            },
        });
    });
}

document.addEventListener('DOMContentLoaded', init);
