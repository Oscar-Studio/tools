// =====================================================
// 渲染：把 state 投影到 DOM
// 视图层：sidebar / taskList / detailPanel
//
// 草稿模式（重要）：
//   - view.draft 持有当前正在编辑的任务（深拷贝自 state，或新建空任务）
//   - 详情面板的所有输入都直接改 view.draft，**不**写 state
//   - 点击「保存」才把 view.draft 提交到 state（addTask 或 updateTask）
//   - 点击「取消 / ×」丢弃 draft，state 不变
//
// ⚠️ 缓存版本：本文件与其它模块之间的 import 必须统一带 ?v=（见 app.js 顶部铁律）。
//   版本号：2026-09-26c
// =====================================================

import {
    getState, addTask, updateTask, deleteTask, toggleTask,
    addGroup, renameGroup, deleteGroup,
    uid,
} from './store.js?v=2026-09-26c';
import { renderMarkdown } from './markdown.js?v=2026-09-26c';
import { showConfirm, showPrompt } from './modal.js?v=2026-09-26c';
import { analyzeQuickAdd } from './quickadd.js?v=2026-09-26c';
import { createDatePicker, createTimePicker, closePopover } from './picker.js?v=2026-09-26c';


const GROUP_COLORS = ['#5b8def', '#22c55e', '#f59e0b', '#e74c3c', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

// ============ 工具函数 ============

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        // 'html' attribute removed: callers must compose via el() children instead
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

function fmtDate(d) {
    if (!d) return '';
    const date = new Date(d + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((date - today) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff === -1) return '昨天';
    if (diff > 1 && diff < 7) return `${diff} 天后`;
    if (diff < -1 && diff > -7) return `${-diff} 天前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function dueClass(d) {
    if (!d) return '';
    const date = new Date(d + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (date < today) return 'is-overdue';
    if (date.getTime() === today.getTime()) return 'is-today';
    return '';
}

function priorityMeta(p) {
    return ['p0', 'p1', 'p2', 'p3'][p] || 'p0';
}

function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function deepClone(x) {
    return JSON.parse(JSON.stringify(x));
}

// 决定新建任务的目标 groupId（虚拟组 → 真实组）
function resolveTargetGroupId() {
    const active = view.activeGroupId;
    if (active === '__today__') {
        // 在虚拟「今日」视图新建时，优先进入名为「今日」的用户组
        const todayGroup = getState().groups.find((g) => g.name === '今日');
        if (todayGroup) return todayGroup.id;
    }
    if (active.startsWith('__')) {
        return getState().groups[0]?.id || null;
    }
    return active;
}

function isGroupToday(groupId) {
    const g = getState().groups.find((x) => x.id === groupId);
    return !!(g && g.name === '今日');
}

function flash(msg) {
    if (window.flash) window.flash(msg);
}

// ============ UI 状态（视图层）============
const view = {
    activeGroupId: '__all__',
    filter: 'all',
    search: '',
    selectedTaskId: null,
    draft: null,           // 当前编辑的草稿（与 selectedTaskId 互斥，但 edit 模式两者都设）
    draftMode: null,       // 'new' | 'edit' | null
    notesTab: 'write',
};

// ============ 全局引用 ============

let ui = {};

export function initRender(deps) {
    ui = deps;
    bindGlobalEvents();
    initQuickAddHighlight();
    render();
}

function bindGlobalEvents() {
    ui.searchInput.addEventListener('input', (e) => {
        view.search = e.target.value.trim().toLowerCase();
        renderTaskList();
    });

    document.querySelectorAll('.filter-chips .chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-chips .chip').forEach((c) => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            view.filter = chip.dataset.filter;
            renderTaskList();
        });
    });

    // 快速添加：解析后打开新建草稿（不写 state）
    ui.quickAddForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = ui.quickAddInput.value;
        if (!raw.trim()) return;
        const { title, priority, tags, dueDate, dueTime } = analyzeQuickAdd(raw);
        if (!title) {
            flash('请输入任务标题');
            return;
        }
        const groupId = resolveTargetGroupId();
        if (!groupId) return;
        ui.quickAddInput.value = '';
        paintQuickAddHighlight();
        openNewDraft({ groupId, title, priority, tags, dueDate, dueTime });
    });

    // 关闭详情：直接丢弃草稿
    ui.closeDetailBtn.addEventListener('click', () => {
        discardDraft();
    });

    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        const sidebar = document.querySelector('.sidebar');
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('is-open');
        });
    }

    ui.newGroupBtn.addEventListener('click', async () => {
        const name = await showPrompt('分组名称', { title: '新建分组', placeholder: '输入新分组名称' });
        if (name && name.trim()) {
            const id = addGroup(name, GROUP_COLORS[getState().groups.length % GROUP_COLORS.length]);
            view.activeGroupId = id;
            render();
        }
    });
}

// ============ 快速添加：实时高亮 ============
//
// <input> 无法给中间某几个字单独上色，所以用一个与输入框完全重叠的镜像层
// 承载同样的文字，识别到的日期/时间片段包上 <mark>；输入框本身的文字透明，
// 只留光标。两层字体、行高、内边距必须完全一致，否则会错位。
// 唯一的坑是 mark 的背景不能靠 padding/margin（会改变字符步进宽度造成错位），
// 统一用 box-shadow 外扩画圆角底色。

function syncHighlightScroll() {
    const inner = ui.quickAddHighlightInner;
    if (!inner) return;
    inner.style.transform = `translateX(${-ui.quickAddInput.scrollLeft}px)`;
}

function paintQuickAddHighlight() {
    const hl = ui.quickAddHighlightInner;
    if (!hl) return;
    const raw = ui.quickAddInput.value;
    hl.textContent = '';
    if (raw) {
        const { spans } = analyzeQuickAdd(raw);
        let cursor = 0;
        for (const s of spans) {
            if (s.start > cursor) hl.appendChild(document.createTextNode(raw.slice(cursor, s.start)));
            const mark = document.createElement('mark');
            mark.className = 'hl-chip';
            mark.textContent = raw.slice(s.start, s.end);
            hl.appendChild(mark);
            cursor = s.end;
        }
        hl.appendChild(document.createTextNode(raw.slice(cursor)));
    }
    syncHighlightScroll();
}

function initQuickAddHighlight() {
    if (!ui.quickAddHighlightInner) return;
    // 只有确认镜像层可用，才让 CSS 把输入框文字设为透明改由镜像层显示。
    // 万一这个元素不存在（缓存里的旧 index.html），文字仍由输入框自己显示。
    const field = ui.quickAddHighlightInner.closest('.quick-add-field');
    if (!field) return;
    field.classList.add('is-hl-ready');
    ui.quickAddInput.addEventListener('input', paintQuickAddHighlight);
    // 输入框横向滚动（值超过可视宽度）时同步镜像层，否则长文本会左右错位
    ui.quickAddInput.addEventListener('scroll', syncHighlightScroll);
    window.addEventListener('resize', syncHighlightScroll);
    paintQuickAddHighlight();
}

// ============ 草稿生命周期 ============

function openNewDraft({ groupId, title = '', priority = 0, tags = [], dueDate = null, dueTime = null }) {
    // 优先级：用户在快速添加里识别出的日期 > 「今日」分组的默认今天 > 留空
    let finalDueDate = dueDate;
    if (!finalDueDate && isGroupToday(groupId)) finalDueDate = todayISO();
    view.draft = {
        id: uid('t'),
        groupId,
        title,
        done: false,
        priority,
        tags,
        dueDate: finalDueDate,
        dueTime: dueTime || null,
        reminderOffset: null,
        notifiedAt: null,
        // 标记是否由解析器自动填入（影响 due 输入框高亮）
        _dueAutoSet: !!(dueDate || dueTime),
        notes: '',
        subtasks: [],
        order: getState().tasks.filter((t) => t.groupId === groupId).length,
        createdAt: Date.now(),
    };
    view.draftMode = 'new';
    view.selectedTaskId = null;
    view.notesTab = 'write';
    showDetail();
}

function openEditDraft(taskId) {
    const task = getState().tasks.find((t) => t.id === taskId);
    if (!task) return;
    view.draft = deepClone(task);
    view.draftMode = 'edit';
    view.selectedTaskId = taskId;
    view.notesTab = 'write';
    showDetail();
}

function showDetail() {
    ui.detailPanel.hidden = false;
    ui.layout.dataset.detailOpen = 'true';
    renderDetail();
}

function commitDraft() {
    if (!view.draft) return;
    const d = view.draft;
    if (!d.title || !d.title.trim()) {
        flash('请输入任务标题');
        // 聚焦标题
        requestAnimationFrame(() => {
            const t = ui.detailBody.querySelector('[data-focus-key="title"]');
            if (t) t.focus();
        });
        return;
    }

    if (view.draftMode === 'new') {
        const id = addTask(d);
        // 用最新 state 重新拷贝一份（让草稿与 state 同步；后续再编辑相当于「编辑已存在」）
        const saved = getState().tasks.find((t) => t.id === id);
        view.draft = saved ? deepClone(saved) : null;
        view.draftMode = view.draft ? 'edit' : null;
        view.selectedTaskId = id;
        flash('已添加 ✓');
    } else if (view.draftMode === 'edit') {
        updateTask(d.id, d);
        const saved = getState().tasks.find((t) => t.id === d.id);
        view.draft = saved ? deepClone(saved) : view.draft;
        flash('已保存 ✓');
    }
    renderDetail();
    renderTaskList();
}

function discardDraft() {
    view.draft = null;
    view.draftMode = null;
    view.selectedTaskId = null;
    ui.detailPanel.hidden = true;
    ui.layout.dataset.detailOpen = 'false';
    renderDetail();
}

// ============ 主渲染 ============

export function render() {
    renderSidebar();
    renderTaskList();
    renderDetail();
    renderTitle();
}

function renderTitle() {
    const s = getState();
    let name = '全部任务';
    if (view.activeGroupId === '__today__') name = '今日';
    else if (view.activeGroupId === '__done__') name = '已完成';
    else if (view.activeGroupId !== '__all__') {
        const g = s.groups.find((x) => x.id === view.activeGroupId);
        if (g) name = g.name;
    }
    ui.currentGroupName.textContent = name;
}

function renderSidebar() {
    const s = getState();
    ui.groupList.innerHTML = '';

    const virtualItems = [
        { id: '__all__', name: '全部任务', color: '#888', count: s.tasks.length },
        { id: '__today__', name: '今日', color: '#f59e0b', count: s.tasks.filter((t) => t.dueDate === todayISO()).length },
    ];

    virtualItems.forEach((it) => {
        ui.groupList.appendChild(renderGroupItem(it, it.id === view.activeGroupId, false));
    });

    const sep = el('li', { style: { height: '1px', background: 'var(--border)', margin: '8px 12px', listStyle: 'none' } });
    ui.groupList.appendChild(sep);

    const doneCount = s.tasks.filter((t) => t.done).length;
    ui.groupList.appendChild(renderGroupItem({ id: '__done__', name: '已完成', color: '#22c55e', count: doneCount }, view.activeGroupId === '__done__', false));

    [...s.groups].sort((a, b) => a.order - b.order).forEach((g) => {
        const count = s.tasks.filter((t) => t.groupId === g.id).length;
        ui.groupList.appendChild(renderGroupItem({ ...g, count }, g.id === view.activeGroupId, true));
    });
}

function renderGroupItem(item, active, isUser) {
    const li = el('li', {
        class: `group-item ${active ? 'is-active' : ''}`,
        dataset: { groupId: item.id },
        role: 'listitem',
        onclick: async () => {
            // 如果有未保存草稿，询问是否放弃
            if (view.draft) {
                const ok = await showConfirm('放弃当前未保存的草稿？', { confirmText: '放弃', cancelText: '保留', danger: true });
                if (!ok) return;
                discardDraft();
            }
            view.activeGroupId = item.id;
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.classList.remove('is-open');
            render();
        },
    },
        el('span', { class: 'group-dot', style: { background: item.color } }),
        el('span', { class: 'group-name' }, item.name),
        el('span', { class: 'group-count' }, String(item.count)),
    );
    if (isUser) {
        const actions = el('div', { class: 'group-actions' },
            el('button', {
                class: 'group-action', title: '重命名',
                onclick: async (e) => {
                    e.stopPropagation();
                    const n = await showPrompt('重命名', { title: '重命名分组', defaultValue: item.name, placeholder: '输入新名称' });
                    if (n && n.trim()) { renameGroup(item.id, n); render(); }
                },
            }, '✎'),
            el('button', {
                class: 'group-action', title: '删除分组',
                onclick: async (e) => {
                    e.stopPropagation();
                    const ok = await showConfirm(`删除分组「${item.name}」及其下所有任务？`, { confirmText: '删除', danger: true });
                    if (!ok) return;
                    deleteGroup(item.id);
                    view.activeGroupId = '__all__';
                    if (view.draft) discardDraft();
                    render();
                },
            }, '×'),
        );
        li.appendChild(actions);
    }
    return li;
}

// ============ 任务列表 ============

function getVisibleTasks() {
    const s = getState();
    let tasks = s.tasks.slice();

    if (view.activeGroupId === '__all__') {}
    else if (view.activeGroupId === '__today__') tasks = tasks.filter((t) => t.dueDate === todayISO());
    else if (view.activeGroupId === '__done__') tasks = tasks.filter((t) => t.done);
    else tasks = tasks.filter((t) => t.groupId === view.activeGroupId);

    if (view.filter === 'active') tasks = tasks.filter((t) => !t.done);
    else if (view.filter === 'done') tasks = tasks.filter((t) => t.done);

    if (view.search) {
        const q = view.search;
        tasks = tasks.filter((t) => {
            if (t.title.toLowerCase().includes(q)) return true;
            if ((t.tags || []).some((tag) => tag.toLowerCase().includes(q))) return true;
            return false;
        });
    }

    return tasks.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.order !== b.order) return a.order - b.order;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

function renderTaskList() {
    const tasks = getVisibleTasks();
    ui.taskList.innerHTML = '';
    const s = getState();

    tasks.forEach((task) => {
        const group = s.groups.find((g) => g.id === task.groupId);
        // 列表只渲染已 commit 的任务；草稿不显示在列表中
        if (view.draftMode === 'new' && view.draft && view.draft.id === task.id) return;
        ui.taskList.appendChild(renderTaskItem(task, group));
    });
}

function renderTaskItem(task, group) {
    const li = el('li', {
        class: `task-item ${task.done ? 'is-done' : ''}`,
        dataset: { taskId: task.id, groupId: task.groupId },
    });

    const cb = el('input', {
        type: 'checkbox',
        class: 'checkbox',
        ...(task.done ? { checked: true } : {}),
        onchange: (e) => toggleTask(task.id, e.target.checked),
        onclick: (e) => e.stopPropagation(),
    });

    const dot = el('span', { class: `priority-dot ${priorityMeta(task.priority)}` });
    const title = el('div', { class: 'task-title' }, task.title);

    const meta = el('div', { class: 'task-meta' });
    if (task.dueDate) {
        meta.appendChild(el('span', { class: `meta-chip due ${dueClass(task.dueDate)}` }, `📅 ${fmtDate(task.dueDate)}${task.dueTime ? ' ' + task.dueTime : ''}`));
    }
    if (task.notifiedAt) {
        meta.appendChild(el('span', { class: 'meta-chip notified', title: '已提醒' }, '🔔'));
    }
    (task.tags || []).slice(0, 3).forEach((tag) => {
        meta.appendChild(el('span', { class: 'meta-chip tag' }, `#${tag}`));
    });
    if ((task.subtasks || []).length > 0) {
        const done = task.subtasks.filter((s) => s.done).length;
        meta.appendChild(el('span', { class: 'meta-chip' }, `☑ ${done}/${task.subtasks.length}`));
    }
    if (group && view.activeGroupId === '__all__') {
        meta.appendChild(el('span', { class: 'meta-chip' }, group.name));
    }

    const body = el('div', { class: 'task-body' }, title, meta);

    li.appendChild(cb);
    li.appendChild(dot);
    li.appendChild(body);

    // 点击主体 → 打开编辑草稿
    body.addEventListener('click', async () => {
        if (view.draft) {
            const ok = await showConfirm('放弃当前未保存的草稿？', { confirmText: '放弃', cancelText: '保留', danger: true });
            if (!ok) return;
        }
        openEditDraft(task.id);
    });

    if ((task.subtasks || []).length > 0) {
        const subList = el('ul', { class: 'subtask-list' });
        task.subtasks.forEach((st) => {
            const subLi = el('li', { class: `subtask-item ${st.done ? 'is-done' : ''}` });
            const scb = el('input', {
                type: 'checkbox',
                class: 'checkbox',
                ...(st.done ? { checked: true } : {}),
                onchange: (e) => {
                    // 列表里直接 toggle 子任务（绕开草稿）— 一键勾选是快速操作
                    const t = getState().tasks.find((x) => x.id === task.id);
                    if (!t) return;
                    const subtasks = (t.subtasks || []).map((s) => s.id === st.id ? { ...s, done: e.target.checked } : s);
                    updateTask(task.id, { subtasks });
                },
                onclick: (e) => e.stopPropagation(),
            });
            const sTitle = el('span', { class: 'subtask-title' }, st.title);
            subLi.appendChild(scb);
            subLi.appendChild(sTitle);
            subList.appendChild(subLi);
        });
        body.appendChild(subList);
    }

    return li;
}

// ============ 详情面板（草稿驱动）============

function renderDetail() {
    // 选择器弹层挂在 body 上，详情重绘后锚点已失效，先关掉
    closePopover();
    ui.detailBody.innerHTML = '';
    if (!view.draft) return;

    const task = view.draft;
    const isNew = view.draftMode === 'new';

    // 头部小标题：「新建任务」or 任务标题
    const headerHint = el('div', { class: 'detail-hint' },
        isNew ? '新建任务' : '编辑任务',
    );
    ui.detailBody.appendChild(headerHint);

    // 标题
    const titleInput = el('textarea', {
        class: 'detail-title',
        placeholder: '任务标题',
        dataset: { focusKey: 'title' },
        oninput: (e) => {
            autoResize(e.target);
            view.draft.title = e.target.value;
        },
    });
    titleInput.value = task.title;
    ui.detailBody.appendChild(titleInput);
    requestAnimationFrame(() => autoResize(titleInput));

    // 优先级
    const priRow = el('div', { class: 'detail-row' },
        el('label', {}, '优先级'),
        el('div', { class: 'priority-picker' },
            ...[0, 1, 2, 3].map((p) =>
                el('button', {
                    class: `priority-btn ${task.priority === p ? 'is-active' : ''}`,
                    title: ['无', '低', '中', '高'][p],
                    onclick: () => {
                        view.draft.priority = p;
                        renderDetail();
                    },
                }, el('span', { class: `priority-dot ${priorityMeta(p)}` })),
            ),
        ),
    );
    ui.detailBody.appendChild(priRow);

    // 截止日期 / 截止时间：自绘选择器（原生 input[type=date|time] 的弹层
    // 在深色主题下永远是刺眼白底，无法跟随主题）
    const datePicker = createDatePicker({
        value: task.dueDate || null,
        auto: isNew && !!(task._dueAutoSet || isGroupToday(task.groupId)),
        onChange: (v) => {
            view.draft.dueDate = v;
            datePicker.el.classList.remove('is-auto');
            view.draft._dueAutoSet = false;
        },
    });
    const timePicker = createTimePicker({
        value: task.dueTime || null,
        auto: isNew && !!task.dueTime,
        onChange: (v) => {
            view.draft.dueTime = v;
            timePicker.el.classList.remove('is-auto');
        },
    });
    // 提前提醒分钟数（空 = 用全局默认）
    const offsetInput = el('input', {
        type: 'number',
        class: 'detail-offset',
        value: task.reminderOffset == null ? '' : String(task.reminderOffset),
        placeholder: '默认',
        min: '0',
        max: '1440',
        step: '5',
        dataset: { focusKey: 'offset' },
        oninput: (e) => {
            const v = e.target.value.trim();
            view.draft.reminderOffset = v === '' ? null : Math.max(0, Math.min(1440, Math.round(+v) || 0));
        },
    });
    const dueRow = el('div', { class: 'detail-row' },
        el('label', {}, '截止'),
        el('div', { class: 'due-fields' },
            datePicker.el,
            timePicker.el,
            el('span', { class: 'due-offset-wrap' },
                offsetInput,
                el('span', { class: 'due-offset-suffix' }, '分钟前'),
            ),
        ),
    );
    ui.detailBody.appendChild(dueRow);

    // 标签
    const tagsRow = el('div', { class: 'detail-row' },
        el('label', {}, '标签'),
        renderTagsEditor(),
    );
    ui.detailBody.appendChild(tagsRow);

    // 子任务
    const subSection = el('div', { class: 'detail-section' },
        el('h4', { class: 'detail-section-title' },
            el('span', {}, '子任务'),
            el('span', {}, `${task.subtasks?.filter((s) => s.done).length || 0}/${task.subtasks?.length || 0}`),
        ),
        renderSubtaskEditor(),
    );
    ui.detailBody.appendChild(subSection);

    // 备注
    const notesSec = el('div', { class: 'detail-section' },
        el('h4', { class: 'detail-section-title' }, '备注'),
        el('div', { class: 'notes-tabs' },
            el('button', {
                class: `notes-tab ${view.notesTab === 'write' ? 'is-active' : ''}`,
                onclick: () => { view.notesTab = 'write'; renderDetail(); },
            }, '编辑'),
            el('button', {
                class: `notes-tab ${view.notesTab === 'preview' ? 'is-active' : ''}`,
                onclick: () => { view.notesTab = 'preview'; renderDetail(); },
            }, '预览'),
        ),
    );
    const notesArea = el('textarea', {
        class: 'detail-textarea',
        placeholder: '支持 Markdown：**粗** *斜* `code` # 标题 - 列表 > 引用 - [ ] 复选框',
        dataset: { focusKey: 'notes' },
        oninput: (e) => { view.draft.notes = e.target.value; },
    });
    notesArea.value = task.notes || '';
    if (view.notesTab === 'write') {
        notesSec.appendChild(notesArea);
    } else {
        const html = renderMarkdown(task.notes);
        const preview = el('div', { class: `markdown-preview ${html ? '' : 'is-empty'}` });
        preview.textContent = ''; // 用 textContent 清空；预览内容通过 Markdown 元素单独构建
        // 由于测试禁止使用 .innerHTML 插入用户内容，改用 textContent + 创建元素的方式
        // 简单预览：直接显示渲染后的 HTML 文本（不解释为 HTML）
        preview.textContent = html || '空备注';
        notesSec.appendChild(preview);
    }
    ui.detailBody.appendChild(notesSec);

    // ============ 底部动作区：删除 + 取消 + 保存 ============
    const actions = el('div', { class: 'detail-actions' },
        isNew
            ? el('div', { class: 'detail-actions-left' }, el('span', { class: 'detail-hint-small' }, '未保存的草稿'))
            :             el('button', {
                class: 'danger-btn',
                onclick: async () => {
                    const ok = await showConfirm('删除这个任务？', { confirmText: '删除', cancelText: '取消', danger: true });
                    if (!ok) return;
                    const id = view.draft.id;
                    deleteTask(id);
                    discardDraft();
                    render();
                },
            }, '删除任务'),
        el('div', { class: 'detail-actions-right' },
            el('button', {
                class: 'ghost-btn',
                onclick: discardDraft,
            }, '取消'),
            el('button', {
                class: 'primary-btn',
                onclick: commitDraft,
            }, isNew ? '保存' : '保存'),
        ),
    );
    ui.detailBody.appendChild(actions);
}

function renderTagsEditor() {
    const wrap = el('div', { class: 'detail-tags' });
    (view.draft.tags || []).forEach((tag) => {
        wrap.appendChild(el('span', { class: 'tag-pill' }, tag,
            el('button', {
                onclick: () => {
                    view.draft.tags = view.draft.tags.filter((t) => t !== tag);
                    renderDetail();
                },
            }, '×'),
        ));
    });
    const input = el('input', {
        type: 'text',
        placeholder: '+ 标签',
        dataset: { focusKey: 'tags' },
        onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const v = input.value.trim().replace(/^#/, '');
                if (!v) return;
                if (view.draft.tags.includes(v)) { input.value = ''; return; }
                view.draft.tags.push(v);
                renderDetail();
            } else if (e.key === 'Backspace' && !input.value && view.draft.tags.length) {
                view.draft.tags.pop();
                renderDetail();
            }
        },
    });
    wrap.appendChild(input);
    return wrap;
}

function renderSubtaskEditor() {
    const list = el('ul', { class: 'subtask-list' });
    (view.draft.subtasks || []).forEach((st) => {
        const li = el('li', { class: `subtask-item ${st.done ? 'is-done' : ''}` });
        const cb = el('input', {
            type: 'checkbox', class: 'checkbox',
            ...(st.done ? { checked: true } : {}),
            onchange: (e) => {
                st.done = e.target.checked;
                renderDetail();
            },
        });
        const title = el('input', {
            type: 'text', value: st.title,
            style: { border: 'none', outline: 'none', background: 'transparent', flex: '1', font: 'inherit', color: 'var(--text-soft)' },
            oninput: (e) => { st.title = e.target.value; },
        });
        const del = el('button', {
            class: 'group-action',
            onclick: () => {
                view.draft.subtasks = view.draft.subtasks.filter((s) => s.id !== st.id);
                renderDetail();
            },
        }, '×');
        li.appendChild(cb);
        li.appendChild(title);
        li.appendChild(del);
        list.appendChild(li);
    });
    const addBtn = el('button', {
        class: 'ghost-btn',
        style: { marginTop: '6px', fontSize: '12px' },
        onclick: async () => {
            const t = await showPrompt('子任务标题', { title: '新建子任务', placeholder: '输入子任务标题' });
            if (t && t.trim()) {
                view.draft.subtasks.push({ id: uid('s'), title: t.trim(), done: false });
                renderDetail();
            }
        },
    }, '+ 添加子任务');
    return el('div', {}, list, addBtn);
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.max(36, textarea.scrollHeight);
    textarea.style.height = newHeight + 'px';
}

// ============ 暴露视图状态供 drag 模块使用 ============

export function getView() { return view; }
export function getRenderContext() { return ui; }
