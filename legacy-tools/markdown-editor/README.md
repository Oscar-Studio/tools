# Markdown 编辑器

> 即开即用的 Markdown 编辑器，支持 LaTeX 公式（`$$...$$`）与图片导出。

## 功能

- 📝 实时 Markdown 预览，支持标题、粗斜体、列表、引用、表格、代码块等所有基础语法
- 🧮 LaTeX 公式渲染（基于 KaTeX，`$...$` 行内 / `$$...$$` 块级）
- 🎨 4 套预设导出主题（白色 / 深邃 / 暖阳 / 天空蓝）+ 自定义配色
- 📸 一键导出为图片（基于 html2canvas）
- 💾 编辑内容自动保存到 localStorage

## 本地运行

```bash
python3 -m http.server 8080
# 访问 http://localhost:8080/markdown-editor/
```

或直接打开 `index.html`（无需构建）。

## 依赖

全部通过 CDN 加载：

- `markdown-it` — Markdown 解析
- `markdown-it-katex` — KaTeX 公式扩展
- `katex` — LaTeX 渲染
- `html2canvas` — DOM 转图片
