// =====================================================
// 极简 Markdown 解析器（~50 行，零依赖）
// 支持：# h1-h3、**粗**、*斜*、`code`、- 列表、> 引用、段落、\n、复选框
// XSS 安全：先 HTML 实体转义再做有限替换
// =====================================================

const ESCAPE_MAP = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

// 内联格式（粗、斜、行内代码）
function inline(escaped) {
    return escaped
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
}

export function renderMarkdown(src) {
    if (!src || !src.trim()) return '';

    const lines = src.split('\n');
    const out = [];
    let inList = false;
    let listType = null;

    const closeList = () => {
        if (inList) { out.push(`</${listType}>`); inList = false; listType = null; }
    };

    for (const raw of lines) {
        const line = raw.trimEnd();

        if (!line.trim()) { closeList(); continue; }

        // 标题
        const h = line.match(/^(#{1,3})\s+(.+)$/);
        if (h) {
            closeList();
            const level = h[1].length + 1; // h2 / h3 / h4
            out.push(`<h${level}>${inline(escapeHtml(h[2]))}</h${level}>`);
            continue;
        }

        // 任务复选框
        const task = line.match(/^-\s+\[( |x|X)\]\s+(.+)$/);
        if (task) {
            if (!inList || listType !== 'ul') { closeList(); out.push('<ul>'); inList = true; listType = 'ul'; }
            const checked = task[1].toLowerCase() === 'x' ? ' checked disabled' : ' disabled';
            out.push(`<li class="md-task"><input type="checkbox"${checked}>${inline(escapeHtml(task[2]))}</li>`);
            continue;
        }

        // 列表
        const li = line.match(/^[-*]\s+(.+)$/);
        if (li) {
            if (!inList || listType !== 'ul') { closeList(); out.push('<ul>'); inList = true; listType = 'ul'; }
            out.push(`<li>${inline(escapeHtml(li[1]))}</li>`);
            continue;
        }

        // 引用
        const q = line.match(/^>\s+(.+)$/);
        if (q) {
            closeList();
            out.push(`<blockquote>${inline(escapeHtml(q[1]))}</blockquote>`);
            continue;
        }

        // 段落
        closeList();
        out.push(`<p>${inline(escapeHtml(line))}</p>`);
    }
    closeList();

    return out.join('');
}
