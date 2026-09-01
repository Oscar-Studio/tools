// =====================================================
// 本地草稿 → 云端 导入对话框
// 触发时机：登录后、且 localStorage 有数据、且云端无数据
// =====================================================

import { isLoggedIn } from './auth.js';
import { loadLocal, clearLocal } from './storage.js';
import { pull, pushNow } from './sync.js';
import { getState } from './store.js';

export async function maybePromptImport() {
    if (!isLoggedIn()) return;
    const local = loadLocal();
    if (!local) return;
    const hasLocalData = local.groups.length > 0 || local.tasks.length > 0;
    if (!hasLocalData) return;

    // 拉取云端：若已有数据则忽略导入（保持云端为权威）
    let cloud = null;
    try {
        cloud = await pull();
    } catch {
        // 网络失败也允许先展示导入框
    }
    const cloudEmpty = !cloud || (cloud.groups.length === 0 && cloud.tasks.length === 0);

    if (cloudEmpty) {
        showImportDialog(local);
    }
    // 若云端已有数据，不做提示；保留本地，用户可手动在右上角"清空"后下次自动使用云端
}

function showImportDialog(local) {
    const dialog = document.getElementById('importDialog');
    const countEl = document.getElementById('importCount');
    const groupCountEl = document.getElementById('importGroupCount');
    const previewEl = document.getElementById('importPreview');
    const confirmBtn = document.getElementById('importConfirm');
    const skipBtn = document.getElementById('importSkip');

    countEl.textContent = local.tasks.length;
    groupCountEl.textContent = local.groups.length;
    previewEl.innerHTML = '';
    local.tasks.slice(0, 8).forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t.title;
        previewEl.appendChild(li);
    });
    if (local.tasks.length > 8) {
        const li = document.createElement('li');
        li.textContent = `… 共 ${local.tasks.length} 条`;
        li.style.color = 'var(--muted)';
        previewEl.appendChild(li);
    }

    dialog.hidden = false;

    const close = () => { dialog.hidden = true; };

    confirmBtn.onclick = async () => {
        close();
        confirmBtn.disabled = true;
        try {
            pushNow(getState());
            await waitForSync();
            clearLocal();
            flash('已导入云端 ✓');
        } catch (e) {
            flash('导入失败：' + e.message);
        } finally {
            confirmBtn.disabled = false;
        }
    };

    skipBtn.onclick = () => {
        close();
        flash('已保留本地草稿');
    };
}

function waitForSync() {
    return new Promise((resolve) => {
        let attempts = 0;
        const tick = () => {
            attempts++;
            // 简单等待：读 sync 状态（status 由 sync.js 通过回调维护在 app 里）
            const st = window.__syncStatus;
            if (st === 'cloud' || attempts > 20) resolve();
            else setTimeout(tick, 300);
        };
        tick();
    });
}

function flash(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-show'));
    setTimeout(() => {
        toast.classList.remove('is-show');
        setTimeout(() => { toast.hidden = true; }, 220);
    }, 1800);
}
