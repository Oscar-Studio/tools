// =====================================================
// 极简 Markdown 解析器（支持常见语法）
// 支持：# h1-h6、**粗**、*斜*、`code`、- 列表、> 引用、段落、复选框、
//       --- 横线、``` 代码块、[text](url) 链接、<url> 自动链接、\* 转义
// XSS 安全：先 HTML 实体转义再做有限替换，链接/图片协议白名单
// =====================================================

const ESCAPE_MAP = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function escapeAttr(s) {
    return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function escapeUrl(url) {
    // 只允许安全 URL：拒绝含 " < > 空白 等危险字符
    const trimmed = url.trim();
    if (!trimmed) return '';
    // 任何含 " ' < > 空白 = 等危险字符的 URL 视为不安全
    if (/["'<>`\s=]/.test(trimmed)) return '';
    // 必须以 http(s):// / mailto: / / / # 开头
    if (/^(https?:\/\/|mailto:|\/|#)/i.test(trimmed)) return escapeAttr(trimmed);
    // 相对路径允许（不含协议前缀）
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(trimmed)) return escapeAttr(trimmed);
    return ''; // 禁止的协议（javascript: data: vbscript: 等）
}

// 内联格式（粗、斜、行内代码、链接）
function inline(escaped) {
    // 先处理反斜杠转义：将 \X 替换为占位符，避免 X 被其他规则处理
    let s = escaped.replace(/\\([\\*_`\[\]()#+\-.!>])/g, (_m, ch) => '\\Z' + ch.charCodeAt(0) + 'Z');
    // 1) 行内代码（先处理，避免内部被其他规则改）
    s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
    // 2) 粗体
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 3) 斜体
    s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    // 4) 自动链接 <https://...>
    s = s.replace(/&lt;(https?:\/\/[^\s<>]+)&gt;/g, (_, url) => {
        return `<a href="${escapeUrl(url)}">${url}</a>`;
    });
    // 5) 图片 ![alt](url) — 必须在链接前解析（链接 regex 不会匹配 ![ 但顺序更清晰）
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
        const safeUrl = escapeUrl(url);
        if (!safeUrl) return ''; // 危险 URL 整张图丢弃（XSS 防护）
        return `<img src="${safeUrl}" alt="${escapeAttr(alt)}">`;
    });
    // 6) 显式链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
        const safeUrl = escapeUrl(url);
        if (!safeUrl) return ''; // 危险 URL 链接也丢弃
        return `<a href="${safeUrl}">${text}</a>`;
    });
    return s;
}

export function renderMarkdown(src) {
    if (src == null) return '';
    if (!src.trim()) return '';

    const lines = String(src).split('\n');
    const out = [];
    let inList = false;
    let listType = null;
    let inCodeBlock = false;
    let codeLang = '';
    let codeBuf = [];

    const closeList = () => {
        if (inList) { out.push(`</${listType}>`); inList = false; listType = null; }
    };

    for (const raw of lines) {
        const line = raw.trimEnd();

        // 代码块
        if (line.startsWith('```')) {
            if (!inCodeBlock) {
                closeList();
                inCodeBlock = true;
                codeLang = line.slice(3).trim();
                codeBuf = [];
            } else {
                // 关闭代码块
                const codeText = escapeHtml(codeBuf.join('\n'));
                const langClass = codeLang ? ` class="language-${escapeAttr(codeLang)}"` : '';
                out.push(`<pre><code${langClass}>${codeText}</code></pre>`);
                inCodeBlock = false;
                codeLang = '';
                codeBuf = [];
            }
            continue;
        }
        if (inCodeBlock) {
            codeBuf.push(raw);
            continue;
        }

        if (!line.trim()) { closeList(); continue; }

        // 水平线 --- 或 *** 或 ___
        if (/^([-*_])\s*\1\s*\1[\s\1]*$/.test(line) || /^[-*_]{3,}\s*$/.test(line)) {
            closeList();
            out.push('<hr>');
            continue;
        }

        // 标题（h1-h6）
        const h = line.match(/^(#{1,6})\s+(.+)$/);
        if (h) {
            closeList();
            const level = Math.min(h[1].length + 1, 6); // #→h2 ... #####/######→h6
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

        // 列表（含缩进嵌套）
        const liIndent = line.match(/^(\s*)([-*])\s+(.+)$/);
        if (liIndent) {
            const indent = liIndent[1].length;
            const text = liIndent[3];
            if (indent === 0) {
                if (!inList || listType !== 'ul') { closeList(); out.push('<ul>'); inList = true; listType = 'ul'; }
                out.push(`<li>${inline(escapeHtml(text))}</li>`);
            } else {
                // 嵌套：把缩进项作为前一个 <li> 的子 <ul><li>
                // 将最近一个 <li>...</li> 改为 <li>...<ul><li>nested</li></ul></li>
                const rendered = `<li>${inline(escapeHtml(text))}</li>`;
                for (let i = out.length - 1; i >= 0; i--) {
                    if (/^<li>[\s\S]*<\/li>$/.test(out[i])) {
                        // 如果 <li> 内已有 <ul>，追加到那个 <ul>
                        if (/<ul>/.test(out[i])) {
                            out[i] = out[i].replace(/<ul>([\s\S]*)<\/ul>/, (_m, inner) => `<ul>${inner}${rendered}</ul>`);
                        } else {
                            out[i] = out[i].replace(/<\/li>$/, `<ul>${rendered}</ul></li>`);
                        }
                        break;
                    }
                }
            }
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

    // 处理反斜杠转义：在最终输出中替换 \\<tag> 为 \<tag> 形式（不重新解析）
    return out.join('').replace(/\\Z(\d+)Z/g, (_m, code) => String.fromCharCode(Number(code)));
}
