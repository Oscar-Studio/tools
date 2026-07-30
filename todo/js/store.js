// =====================================================
// 响应式状态：subscribe / patch / 不可变更新
// 数据模型：
//   {
//     version: 1,
//     updatedAt: number,
//     theme: 'light' | 'dark',
//     groups: [{ id, name, color, collapsed, order }],
//     tasks: [{ id, groupId, title, done, priority, tags, dueDate, notes, subtasks, order, createdAt }]
//   }
// =====================================================

import { loadLocal, saveLocal } from './storage.js';
import { pushDebounced } from './sync.js';
import { isLoggedIn } from './auth.js';

const SCHEMA_VERSION = 1;

function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export { uid };

export function emptyState() {
    return {
        version: SCHEMA_VERSION,
        updatedAt: Date.now(),
        theme: 'light',
        groups: [],
        tasks: [],
    };
}

export function defaultGroups() {
    const now = Date.now();
    return [
        { id: uid('g'), name: '收件箱', color: '#5b8def', collapsed: false, order: 0, createdAt: now },
        { id: uid('g'), name: '今日', color: '#f59e0b', collapsed: false, order: 1, createdAt: now },
        { id: uid('g'), name: '个人', color: '#22c55e', collapsed: false, order: 2, createdAt: now },
    ];
}

// ============ 订阅 ============

const listeners = new Set();
let state = (() => {
    const local = loadLocal();
    if (local && local.version === SCHEMA_VERSION) return local;
    // 首次进入：注入默认分组
    const init = emptyState();
    init.groups = defaultGroups();
    return init;
})();

export function getState() { return state; }

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function notify(meta = {}) {
    state.updatedAt = Date.now();
    saveLocal(state);
    if (isLoggedIn()) pushDebounced(state);
    listeners.forEach((fn) => fn(state, meta));
}

// ============ 变更方法（不可变更新） ============

export function patch(updater, meta) {
    const next = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...next };
    notify(meta);
}

export function setTheme(theme) {
    patch({ theme });
}

export function setGroupCollapsed(groupId, collapsed) {
    patch((s) => ({
        groups: s.groups.map((g) => g.id === groupId ? { ...g, collapsed } : g),
    }));
}

export function addGroup(name, color = '#5b8def') {
    const id = uid('g');
    patch((s) => {
        const order = s.groups.length;
        return {
            groups: [...s.groups, { id, name: name.trim() || '新分组', color, collapsed: false, order, createdAt: Date.now() }],
        };
    }, { kind: 'addGroup', id });
    return id;
}

export function renameGroup(groupId, name) {
    patch((s) => ({
        groups: s.groups.map((g) => g.id === groupId ? { ...g, name: name.trim() || g.name } : g),
    }));
}

export function deleteGroup(groupId) {
    patch((s) => ({
        groups: s.groups.filter((g) => g.id !== groupId),
        tasks: s.tasks.filter((t) => t.groupId !== groupId),
    }));
}

// 添加任务。title 可带前缀：!!高 / !中（去掉前缀写入 priority）
export function addTask({ title, groupId, priority = 0, dueDate = null, tags = [] }) {
    const id = uid('t');
    patch((s) => {
        const sameGroup = s.tasks.filter((t) => t.groupId === groupId);
        const order = sameGroup.length;
        const task = {
            id,
            groupId,
            title: title.trim(),
            done: false,
            priority,
            tags,
            dueDate,
            notes: '',
            subtasks: [],
            order,
            createdAt: Date.now(),
        };
        return { tasks: [...s.tasks, task] };
    }, { kind: 'addTask', id });
    return id;
}

export function updateTask(taskId, partial) {
    patch((s) => ({
        tasks: s.tasks.map((t) => t.id === taskId ? { ...t, ...partial } : t),
    }));
}

export function deleteTask(taskId) {
    patch((s) => ({
        tasks: s.tasks.filter((t) => t.id !== taskId),
    }));
}

export function toggleTask(taskId, done) {
    updateTask(taskId, { done });
}

export function addSubtask(taskId, title) {
    const id = uid('s');
    patch((s) => ({
        tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const subtasks = [...(t.subtasks || []), { id, title: title.trim(), done: false }];
            return { ...t, subtasks };
        }),
    }), { kind: 'addSubtask', taskId });
    return id;
}

export function updateSubtask(taskId, subtaskId, partial) {
    patch((s) => ({
        tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const subtasks = (t.subtasks || []).map((st) => st.id === subtaskId ? { ...st, ...partial } : st);
            return { ...t, subtasks };
        }),
    }));
}

export function deleteSubtask(taskId, subtaskId) {
    patch((s) => ({
        tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const subtasks = (t.subtasks || []).filter((st) => st.id !== subtaskId);
            return { ...t, subtasks };
        }),
    }));
}

// 重排序：传入完整的新数组（同级）
export function reorderTasks(groupId, newOrderedIds) {
    patch((s) => {
        const orderMap = new Map(newOrderedIds.map((id, i) => [id, i]));
        const tasks = s.tasks.map((t) => {
            if (t.groupId !== groupId) return t;
            const order = orderMap.get(t.id);
            return order === undefined ? t : { ...t, order };
        });
        return { tasks };
    });
}

// 把任务移到另一分组（保持插入位置）
export function moveTaskToGroup(taskId, toGroupId, beforeTaskId = null) {
    patch((s) => {
        const tasks = s.tasks.filter((t) => t.id !== taskId).map((t) => ({ ...t }));
        const moving = s.tasks.find((t) => t.id === taskId);
        if (!moving) return {};
        const movedTask = { ...moving, groupId: toGroupId };

        const inGroup = tasks.filter((t) => t.groupId === toGroupId);
        const others = tasks.filter((t) => t.groupId !== toGroupId);
        const newInGroup = [];
        let inserted = false;
        for (const t of inGroup) {
            if (t.id === beforeTaskId) {
                newInGroup.push({ ...movedTask, order: newInGroup.length });
                inserted = true;
            }
            newInGroup.push({ ...t, order: newInGroup.length });
        }
        if (!inserted) newInGroup.push({ ...movedTask, order: newInGroup.length });
        return { tasks: [...others, ...newInGroup] };
    });
}

// 替换整个状态（拉取云端成功后用）
export function replaceState(newState) {
    if (!newState || newState.version !== SCHEMA_VERSION) return;
    state = {
        ...newState,
        updatedAt: Date.now(),
    };
    saveLocal(state);
    listeners.forEach((fn) => fn(state, { kind: 'replace' }));
}

// 合并本地到云端（导入对话框使用）
export function mergeFromCloud(cloudState) {
    if (!cloudState || cloudState.version !== SCHEMA_VERSION) return;
    state = cloudState;
    state.updatedAt = Date.now();
    saveLocal(state);
    listeners.forEach((fn) => fn(state, { kind: 'merge' }));
}
