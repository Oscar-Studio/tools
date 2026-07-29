# 🧰 Tools

> 收录各类日常用得上的 H5 小工具集。

[![GitHub Repo](https://img.shields.io/badge/GitHub-OSCAR--Studio%2Ftools-blue?logo=github)](https://github.com/Oscar-Studio/tools)
[![Netlify](https://img.shields.io/badge/在线访问-tools.oscarstudio.cn-brightgreen?logo=netlify)](https://tools.oscarstudio.cn)

---

## 🏗️ 项目结构

与 `games`、`teaching-tools` 同款 React 入口：每个工具单独一个文件夹，`tools-config.json` 注册。

```
tools/
├── index.html              # Vite 入口
├── tools-config.json       # 工具配置
├── public/                 # 静态资源
├── src/                    # React + TS 入口
└── <工具文件夹>/            # 每个工具一个子目录，根目录有 index.html
```

新增工具：在 `tools-config.json` 加一项 + 新建 `<工具名>/index.html`。

---

## 🌐 在线访问

**https://tools.oscarstudio.cn**

---

## 📦 本地开发

```bash
npm install
npm run dev
```

构建并部署到 GitHub Pages：

```bash
npm run deploy
```

---

*由 [Oscar Studio](https://oscarstudio.cn) 出品 · [查看主站 →](https://oscarstudio.cn)*
