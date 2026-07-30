// =====================================================
// 拖拽：FLIP + Web Animations API
// 支持：同组内重排、跨分组移动、子任务缩进提示
// =====================================================

import { getView, getRenderContext } from './render.js';
import { reorderTasks, moveTaskToGroup, getState } from './store.js';

const ROW_HEIGHT_FALLBACK = 36;
const SUBTASK_INDENT = 30;

export function initDrag() {
    const ui = getRenderContext();
    const list = ui.taskList;

    let dragState = null;

    list.addEventListener('pointerdown', onPointerDown);

    function onPointerDown(e) {
        const li = e.target.closest('.task-item');
        if (!li) return;
        // 拖拽手柄：整个 li 都能拖，但点 checkbox / input 不触发
        if (e.target.matches('input, textarea, button')) return;

        e.preventDefault();
        const taskId = li.dataset.taskId;
        const groupId = li.dataset.groupId;
        const startY = e.clientY;
        const rect = li.getBoundingClientRect();
        const offsetY = startY - rect.top;

        dragState = {
            taskId,
            groupId,
            startY,
            offsetY,
            li,
            ghost: null,
            targetLi: null,
            dropMode: 'none', // 'before' | 'after' | 'in' | 'none'
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp, { once: true });
        document.addEventListener('pointercancel', onPointerUp, { once: true });
    }

    function onPointerMove(e) {
        if (!dragState) return;
        const { li } = dragState;

        if (!dragState.ghost) {
            // First：记录所有同级初始位置
            const siblings = [...list.querySelectorAll('.task-item')]
                .filter((n) => n.dataset.groupId === dragState.groupId);
            dragState.firstRects = new Map(siblings.map((n) => [n.dataset.taskId, n.getBoundingClientRect()]));
            li.classList.add('is-dragging');

            // 创建 ghost
            const rect = li.getBoundingClientRect();
            const ghost = li.cloneNode(true);
            ghost.classList.add('is-drag-ghost');
            ghost.style.position = 'fixed';
            ghost.style.left = rect.left + 'px';
            ghost.style.top = rect.top + 'px';
            ghost.style.width = rect.width + 'px';
            ghost.style.pointerEvents = 'none';
            ghost.style.margin = '0';
            ghost.dataset.ghost = '1';
            document.body.appendChild(ghost);
            dragState.ghost = ghost;
        }

        // 移动 ghost
        const ghost = dragState.ghost;
        ghost.style.top = (e.clientY - dragState.offsetY) + 'px';

        // 命中检测：找出鼠标 Y 所在的 li（按任务本体高度）
        const elementsAt = document.elementsFromPoint(e.clientX, e.clientY);
        const targetLi = elementsAt.map((n) => n.closest('.task-item')).find((n) => n && n !== dragState.ghost && !n.dataset.ghost);
        if (!targetLi) {
            clearDropMarkers();
            dragState.targetLi = null;
            dragState.dropMode = 'none';
            return;
        }

        // 跨组：放到目标组末尾
        if (targetLi.dataset.groupId !== dragState.groupId) {
            clearDropMarkers();
            targetLi.classList.add('drop-after');
            dragState.targetLi = targetLi;
            dragState.dropMode = 'after';
            return;
        }

        // 同组：根据鼠标 Y 在目标行内的位置决定 before / after
        const tRect = targetLi.getBoundingClientRect();
        const ratio = (e.clientY - tRect.top) / tRect.height;
        clearDropMarkers();
        if (ratio < 0.4) {
            targetLi.classList.add('drop-before');
            dragState.dropMode = 'before';
        } else {
            targetLi.classList.add('drop-after');
            dragState.dropMode = 'after';
        }
        dragState.targetLi = targetLi;
    }

    function clearDropMarkers() {
        list.querySelectorAll('.drop-before, .drop-after').forEach((n) => {
            n.classList.remove('drop-before', 'drop-after');
        });
    }

    function onPointerUp() {
        document.removeEventListener('pointermove', onPointerMove);
        if (!dragState) return;

        const { taskId, groupId, ghost, targetLi, dropMode } = dragState;
        clearDropMarkers();
        if (ghost) ghost.remove();
        const original = list.querySelector(`.task-item[data-task-id="${taskId}"]`);
        if (original) original.classList.remove('is-dragging');

        if (!targetLi || dropMode === 'none') {
            dragState = null;
            return;
        }

        // 计算新位置
        const sameGroup = (targetLi.dataset.groupId === groupId);
        if (sameGroup) {
            const ids = getGroupTaskIds(groupId);
            const fromIdx = ids.indexOf(taskId);
            const toIdxRaw = ids.indexOf(targetLi.dataset.taskId);
            let toIdx = toIdxRaw;
            if (dropMode === 'after') toIdx = toIdxRaw + 1;
            if (fromIdx < toIdx) toIdx -= 1;
            if (fromIdx === toIdx) { dragState = null; return; }
            ids.splice(fromIdx, 1);
            ids.splice(toIdx, 0, taskId);
            animateAndApply(() => reorderTasks(groupId, ids));
        } else {
            // 跨组
            animateAndApply(() => moveTaskToGroup(taskId, targetLi.dataset.groupId, targetLi.dataset.taskId));
        }
        dragState = null;
    }

    function getGroupTaskIds(gid) {
        const s = getState();
        return s.tasks
            .filter((t) => t.groupId === gid && !t.done)
            .sort((a, b) => a.order - b.order)
            .map((t) => t.id);
    }

    function animateAndApply(applyFn) {
        // Last：记录 apply 前的 rect
        const siblings = [...list.querySelectorAll('.task-item')];
        const lastRects = new Map(siblings.map((n) => [n.dataset.taskId, n.getBoundingClientRect()]));

        applyFn();

        // 触发 render（在下一个 tick 让 DOM 更新）
        requestAnimationFrame(() => {
            const view = getView();
            const newSiblings = [...list.querySelectorAll('.task-item')];
            newSiblings.forEach((node) => {
                const id = node.dataset.taskId;
                const before = lastRects.get(id);
                if (!before) return;
                const after = node.getBoundingClientRect();
                const dx = before.left - after.left;
                const dy = before.top - after.top;
                if (dx === 0 && dy === 0) return;
                node.animate(
                    [
                        { transform: `translate(${dx}px, ${dy}px)` },
                        { transform: 'translate(0, 0)' },
                    ],
                    { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
                );
            });
            // render 由 store 的 notify 触发（已在 applyFn 内 patch 过）
        });
    }
}
