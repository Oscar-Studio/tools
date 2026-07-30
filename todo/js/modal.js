// =====================================================
// 自定义模态框（替代浏览器 confirm / prompt）
// API:
//   showConfirm(message, options?) → Promise<boolean>
//   showPrompt(message, options?) → Promise<string | null>
// =====================================================

const DURATION = 220;

function createBackdrop() {
    const existing = document.querySelector('.dialog-backdrop');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = 'dialog-backdrop';
    return div;
}

function createDialog(title, bodyEl, actions) {
    const dlg = document.createElement('div');
    dlg.className = 'dialog';
    dlg.setAttribute('role', 'dialog');
    dlg.innerHTML = `<h3 class="dialog-title">${title}</h3>`;
    if (bodyEl) dlg.appendChild(bodyEl);

    const act = document.createElement('div');
    act.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px';
    actions.forEach(({ label, cls, value }) => {
        const btn = document.createElement('button');
        btn.className = cls || 'ghost-btn';
        btn.textContent = label;
        btn.dataset.value = value ?? '';
        act.appendChild(btn);
    });
    dlg.appendChild(act);
    return dlg;
}

function closeModal(backdrop, dlg, result, resolve) {
    backdrop.style.opacity = '0';
    backdrop.style.pointerEvents = 'none';
    dlg.style.transform = 'scale(0.96)';
    setTimeout(() => { backdrop.remove(); resolve(result); }, DURATION);
}

export function showConfirm(message, options = {}) {
    const { confirmText = '确认', cancelText = '取消', danger = false } = options;

    return new Promise((resolve) => {
        const backdrop = createBackdrop();
        const p = document.createElement('p');
        p.className = 'dialog-desc';
        p.textContent = message;
        p.style.margin = '0 0 4px';

        const dlg = createDialog('提示', p, [
            { label: cancelText, cls: 'ghost-btn', value: 'cancel' },
            { label: confirmText, cls: danger ? 'danger-btn' : 'primary-btn', value: 'confirm' },
        ]);

        backdrop.appendChild(dlg);
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeModal(backdrop, dlg, false, resolve);
        });
        dlg.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            closeModal(backdrop, dlg, btn.dataset.value === 'confirm', resolve);
        });
        dlg.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeModal(backdrop, dlg, false, resolve); }
            if (e.key === 'Enter') { e.preventDefault(); closeModal(backdrop, dlg, true, resolve); }
        });
        const confirmBtn = dlg.querySelector('.primary-btn') || dlg.querySelector('.danger-btn');
        if (confirmBtn) setTimeout(() => confirmBtn.focus(), 50);
    });
}

export function showPrompt(message, options = {}) {
    const { defaultValue = '', placeholder = '', confirmText = '确认', cancelText = '取消' } = options;

    return new Promise((resolve) => {
        const backdrop = createBackdrop();

        const p = document.createElement('p');
        p.className = 'dialog-desc';
        p.textContent = message;
        p.style.margin = '0 0 12px';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue;
        input.placeholder = placeholder;
        input.className = 'cz-prompt-input';

        const wrapper = document.createElement('div');
        wrapper.appendChild(p);
        wrapper.appendChild(input);

        const dlg = createDialog('输入', wrapper, [
            { label: cancelText, cls: 'ghost-btn', value: '' },
            { label: confirmText, cls: 'primary-btn', value: 'confirm' },
        ]);

        backdrop.appendChild(dlg);
        document.body.appendChild(backdrop);

        setTimeout(() => { input.focus(); input.select(); }, 80);

        const close = (val) => closeModal(backdrop, dlg, val, resolve);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) close(null);
        });
        dlg.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const isConfirm = btn.classList.contains('primary-btn');
            close(isConfirm ? (input.value || null) : null);
        });
        dlg.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(null); }
            if (e.key === 'Enter') { e.preventDefault(); close(input.value || null); }
        });
    });
}
