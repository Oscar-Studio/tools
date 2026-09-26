// =====================================================
// 自绘日期 / 时间选择器（替代 <input type=date|time> 的浏览器原生弹层）
//
// 原生问题：弹层完全由浏览器控制，深色主题下依然是刺眼的白底黑字，
// 且样式无法跟随本站设计语言。这里统一用 CSS 变量自绘，深浅色都一致。
//
// API:
//   createDatePicker({ value, auto, onChange }) → { el }
//   createTimePicker({ value, auto, onChange }) → { el }
//   closePopover()  —— 详情面板重绘时调用，避免弹层残留
//
// 每个返回的 el 结构：
//   <span class="field-wrap">
//     <button class="field-chip" type="button">…</button>
//     <button class="field-clear" type="button" title="清除">×</button>
//   </span>
// =====================================================

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) node.setAttribute(k, '');
        else if (v === false || v == null) {}
        else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
        if (c == null || c === false) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
}

const pad2 = (n) => String(n).padStart(2, '0');

function toISO(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function fromISO(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const x = new Date(y, m - 1, d);
    return Number.isNaN(x.getTime()) ? null : x;
}

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

// 下一个指定 weekday（0=周一 … 6=周日），今天就是则返回下周
function nextWeekday(base, target) {
    const cur = (base.getDay() + 6) % 7;
    let diff = target - cur;
    if (diff <= 0) diff += 7;
    return addDays(base, diff);
}

// ============ 弹层容器（挂在 body 上，避免被详情面板的 overflow 裁掉）============

let activePopover = null;
let activeCloser = null;
let activeAnchor = null;

function positionPopover(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const margin = 8;
    const gap = 6;

    let left = r.left;
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
    if (left < margin) left = margin;

    let top = r.bottom + gap;
    if (top + ph > window.innerHeight - margin) {
        const above = r.top - ph - gap;
        top = above > margin ? above : Math.max(margin, window.innerHeight - ph - margin);
    }
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
}

export function closePopover() {
    if (!activePopover) return;
    const pop = activePopover;
    const closer = activeCloser;
    activePopover = null;
    activeCloser = null;
    activeAnchor = null;
    if (closer) closer();
    pop.remove();
}

function openPopover(anchor, content) {
    closePopover();
    const pop = el('div', { class: 'popover' }, content);
    document.body.appendChild(pop);
    positionPopover(pop, anchor);
    activePopover = pop;
    activeAnchor = anchor;
    // 字体/布局落定后再摆一次，避免首帧位置偏差
    requestAnimationFrame(() => {
        if (activePopover === pop) positionPopover(pop, anchor);
    });

    const origin = anchor.getBoundingClientRect();
    const onPointerDown = (e) => {
        if (pop.contains(e.target) || anchor.contains(e.target)) return;
        closePopover();
    };
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePopover();
        }
    };
    // 只有锚点真的移动了才关闭：点击时浏览器给按钮的 focus 可能触发一次
    // 「无位移」的 scroll（元素本来就在可视区），那种不能当成用户滚动。
    const onScroll = () => {
        const r = anchor.getBoundingClientRect();
        if (r.top !== origin.top || r.left !== origin.left) closePopover();
    };
    // 捕获阶段监听：点外面 / 滚动 / 缩放都关掉，避免弹层错位
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closePopover);

    const detach = () => {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', closePopover);
    };
    activeCloser = detach;
    return pop;
}

// ============ 日期选择器 ============

// 详情面板里显示的日期文案：今天 / 明天 / 昨天 / 9月5日 周六 / 2026年12月28日
function fmtDateFull(iso) {
    const date = fromISO(iso);
    if (!date) return '';
    const today = todayStart();
    const diff = Math.round((date - today) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === -1) return '昨天';
    const sameYear = date.getFullYear() === today.getFullYear();
    const base = sameYear
        ? `${date.getMonth() + 1}月${date.getDate()}日`
        : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    return `${base} 周${WEEKDAYS[(date.getDay() + 6) % 7]}`;
}

function buildDatePanel(state, onPick, onClear) {
    const body = el('div', { class: 'cal' });

    const title = el('span', { class: 'cal-title' });
    const head = el('div', { class: 'cal-head' },
        el('button', {
            class: 'cal-nav', type: 'button', title: '上一月', 'aria-label': '上一月',
            onclick: () => { shiftMonth(-1); },
        }, '‹'),
        title,
        el('button', {
            class: 'cal-nav', type: 'button', title: '下一月', 'aria-label': '下一月',
            onclick: () => { shiftMonth(1); },
        }, '›'),
    );

    const grid = el('div', { class: 'cal-grid' });
    for (const w of WEEKDAYS) {
        grid.appendChild(el('div', { class: 'cal-weekday' }, w));
    }

    const footer = el('div', { class: 'cal-foot' });

    function shiftMonth(delta) {
        state.view = new Date(state.view.getFullYear(), state.view.getMonth() + delta, 1);
        draw();
    }

    function draw() {
        const view = state.view;
        title.textContent = `${view.getFullYear()}年${view.getMonth() + 1}月`;

        // 已有格子先清掉（保留表头 7 个）
        while (grid.children.length > WEEKDAYS.length) grid.lastChild.remove();

        const first = new Date(view.getFullYear(), view.getMonth(), 1);
        const lead = (first.getDay() + 6) % 7; // 周一为一周起点
        const todayISO = toISO(todayStart());
        const selected = state.value;

        for (let i = 0; i < 42; i++) {
            const d = new Date(view.getFullYear(), view.getMonth(), 1 - lead + i);
            const iso = toISO(d);
            const cls = [
                'cal-day',
                d.getMonth() !== view.getMonth() ? 'is-out' : '',
                iso === todayISO ? 'is-today' : '',
                iso === selected ? 'is-selected' : '',
                (d.getDay() === 0 || d.getDay() === 6) ? 'is-weekend' : '',
            ].filter(Boolean).join(' ');
            grid.appendChild(el('button', {
                class: cls, type: 'button', dataset: { iso },
                onclick: () => onPick(iso),
            }, String(d.getDate())));
        }

        // 快捷项
        const t = todayStart();
        footer.textContent = '';
        footer.appendChild(el('button', { class: 'cal-quick', type: 'button', onclick: () => onPick(toISO(t)) }, '今天'));
        footer.appendChild(el('button', { class: 'cal-quick', type: 'button', onclick: () => onPick(toISO(addDays(t, 1))) }, '明天'));
        footer.appendChild(el('button', { class: 'cal-quick', type: 'button', onclick: () => onPick(toISO(addDays(t, 7))) }, '下周'));
        footer.appendChild(el('button', { class: 'cal-quick', type: 'button', onclick: () => onPick(toISO(nextWeekday(t, 6))) }, '周末'));
        footer.appendChild(el('button', { class: 'cal-quick is-clear', type: 'button', onclick: onClear }, '清除'));
    }

    draw();
    body.appendChild(head);
    body.appendChild(grid);
    body.appendChild(footer);
    return body;
}

export function createDatePicker({ value = null, auto = false, onChange = () => {} } = {}) {
    const state = { value: value || null, view: null };
    const chipLabel = el('span', { class: 'field-chip-label' });
    const chip = el('button', { class: 'field-chip', type: 'button' }, el('span', { class: 'field-chip-icon' }, '📅'), chipLabel);
    const clearBtn = el('button', { class: 'field-clear', type: 'button', title: '清除日期', 'aria-label': '清除日期' }, '×');
    const wrap = el('span', { class: 'field-wrap' }, chip, clearBtn);

    function update(next, { silent = false } = {}) {
        state.value = next || null;
        const has = !!state.value;
        chipLabel.textContent = has ? fmtDateFull(state.value) : '选择日期';
        chip.classList.toggle('is-empty', !has);
        clearBtn.hidden = !has;
        if (!silent) onChange(state.value);
    }

    chip.addEventListener('click', () => {
        if (activeAnchor === chip) { closePopover(); return; }
        const base = fromISO(state.value) || todayStart();
        state.view = new Date(base.getFullYear(), base.getMonth(), 1);
        const clear = () => { update(null); closePopover(); };
        openPopover(chip, buildDatePanel(state, (iso) => {
            update(iso);
            closePopover();
        }, clear));
    });

    clearBtn.addEventListener('click', () => update(null));

    update(state.value, { silent: true });
    if (auto) wrap.classList.add('is-auto');
    return { el: wrap };
}

// ============ 时间选择器 ============

const QUICK_TIMES = [
    { label: '现在', get: () => { const d = new Date(); return { h: d.getHours(), m: d.getMinutes() }; } },
    { label: '上午9点', h: 9, m: 0 },
    { label: '中午12点', h: 12, m: 0 },
    { label: '下午3点', h: 15, m: 0 },
    { label: '晚上8点', h: 20, m: 0 },
];

function buildTimePanel(state, onPick, onClear) {
    const body = el('div', { class: 'timepick' });

    const quick = el('div', { class: 'timepick-quick' });
    for (const q of QUICK_TIMES) {
        quick.appendChild(el('button', {
            class: 'timepick-quick-btn', type: 'button',
            onclick: () => {
                const t = q.get ? q.get() : { h: q.h, m: q.m };
                onPick(`${pad2(t.h)}:${pad2(t.m)}`);
            },
        }, q.label));
    }

    const colH = el('div', { class: 'timepick-col', dataset: { role: 'hour' } });
    const colM = el('div', { class: 'timepick-col', dataset: { role: 'minute' } });
    for (let h = 0; h < 24; h++) {
        colH.appendChild(el('button', {
            class: 'timepick-cell', type: 'button', dataset: { value: pad2(h) },
            onclick: () => onPick(`${pad2(h)}:${pad2(state.minute)}`),
        }, pad2(h)));
    }
    for (let m = 0; m < 60; m++) {
        colM.appendChild(el('button', {
            class: 'timepick-cell', type: 'button', dataset: { value: pad2(m) },
            onclick: () => onPick(`${pad2(state.hour)}:${pad2(m)}`),
        }, pad2(m)));
    }

    const cols = el('div', { class: 'timepick-cols' },
        el('div', { class: 'timepick-col-head' }, '时'),
        el('div', { class: 'timepick-col-head' }, '分'),
        colH,
        colM,
    );

    const foot = el('div', { class: 'timepick-foot' },
        el('button', { class: 'cal-quick is-clear', type: 'button', onclick: onClear }, '清除'),
        el('button', { class: 'primary-btn', type: 'button', onclick: () => closePopover() }, '完成'),
    );

    body.appendChild(quick);
    body.appendChild(cols);
    body.appendChild(foot);

    // 打开时把当前选中项滚到中间
    requestAnimationFrame(() => {
        for (const [col, val] of [[colH, pad2(state.hour)], [colM, pad2(state.minute)]]) {
            const target = col.querySelector(`[data-value="${val}"]`);
            if (!target) continue;
            col.scrollTop = Math.max(0, target.offsetTop - (col.clientHeight - target.offsetHeight) / 2);
        }
    });

    return body;
}

export function createTimePicker({ value = null, auto = false, onChange = () => {} } = {}) {
    const state = { value: value || null, hour: 9, minute: 0 };
    const chipLabel = el('span', { class: 'field-chip-label' });
    const chip = el('button', { class: 'field-chip', type: 'button' }, el('span', { class: 'field-chip-icon' }, '🕐'), chipLabel);
    const clearBtn = el('button', { class: 'field-clear', type: 'button', title: '清除时间', 'aria-label': '清除时间' }, '×');
    const wrap = el('span', { class: 'field-wrap' }, chip, clearBtn);

    // 弹层里的选中态：小时列看 hour，分钟列看 minute
    function paintSelected(pop) {
        for (const cell of pop.querySelectorAll('.timepick-cell')) {
            const isHour = cell.parentElement.dataset.role === 'hour';
            const target = isHour ? pad2(state.hour) : pad2(state.minute);
            cell.classList.toggle('is-selected', cell.dataset.value === target);
        }
    }

    function update(next, { silent = false } = {}) {
        state.value = next || null;
        if (state.value) {
            state.hour = +state.value.slice(0, 2);
            state.minute = +state.value.slice(3, 5);
        }
        const has = !!state.value;
        chipLabel.textContent = has ? state.value : '选择时间';
        chip.classList.toggle('is-empty', !has);
        clearBtn.hidden = !has;
        if (activeAnchor === chip && activePopover) paintSelected(activePopover);
        if (!silent) onChange(state.value);
    }

    chip.addEventListener('click', () => {
        if (activeAnchor === chip) { closePopover(); return; }
        // 点格子只实时改值、弹层保持打开（两列要连续调），
        // 清除则和日期选择器一样：执行完就收起。
        const pop = openPopover(chip, buildTimePanel(
            state,
            (text) => update(text),
            () => { update(null); closePopover(); },
        ));
        paintSelected(pop);
    });

    clearBtn.addEventListener('click', () => update(null));

    update(state.value, { silent: true });
    if (auto) wrap.classList.add('is-auto');
    return { el: wrap };
}
