# 待办清单 (Todo)

极简风格的待办管理工具。Linear/Notion 设计语言，纯 CSS + Web Animations API 动画。

## 功能

- 任务：新增 / 完成 / 删除 / 双击编辑 / 拖拽重排
- 优先级：无 / 低 / 中 / 高（颜色圆点）
- 截止日期：今天 / 明天 / 过期 高亮
- 分组：自定义 + 默认「收件箱 / 今日 / 个人」
- 子任务：勾选 / 文本 / 删除
- 标签：`#` 自动识别，多标签
- 备注：极简 Markdown 解析（标题 / 粗斜 / 代码 / 列表 / 引用 / 复选框）
- 主题：亮 / 暗 双主题
- 搜索 + 过滤：全部 / 进行中 / 已完成
- 云同步：登录后自动同步（debounce 1.5s + 失败重试 1s/3s/8s）
- 本地草稿导入：登录后弹对话框询问

## 文件

| 文件 | 作用 |
|------|------|
| `index.html` | 入口（三栏布局） |
| `styles.css` | 全部样式 + 双主题 |
| `js/app.js` | 入口、初始化、登录态联动 |
| `js/store.js` | 状态、订阅、不可变更新 |
| `js/render.js` | DOM 渲染 |
| `js/drag.js` | FLIP 拖拽 |
| `js/sync.js` | 云端同步（debounce + 重试） |
| `js/auth.js` | 跨子域 Cookie + localStorage 登录态 |
| `js/storage.js` | localStorage 适配 |
| `js/markdown.js` | 极简 MD 解析器 |
| `js/migrate.js` | 本地草稿 → 云端导入对话框 |

## API

`/api/todos`
- `GET` — 读取当前用户的 JSON
- `PUT` — 全量覆盖（最大 256 KB）
- `DELETE` — 清空

详见 `API/routes/todos.js`。

## 数据模型

```json
{
  "version": 1,
  "updatedAt": 1753939200000,
  "theme": "light",
  "groups": [{ "id": "g_xxx", "name": "工作", "color": "#5b8def", "collapsed": false, "order": 0 }],
  "tasks": [{
    "id": "t_xxx", "groupId": "g_xxx", "title": "...",
    "done": false, "priority": 2, "tags": [], "dueDate": null,
    "notes": "## Markdown", "subtasks": [],
    "order": 0, "createdAt": 1753939200000
  }]
}
```

## 快捷键

| 键 | 行为 |
|----|------|
| `⌘/Ctrl + K` | 聚焦搜索 |
| `Esc` | 失焦 |
| `!!` 前缀 | 添加任务时设高优先级 |
| `!` 前缀 | 添加任务时设中优先级 |
| `回车 / ,` | 在标签输入框中确认标签 |
| `Backspace` | 标签输入框为空时删除最后一个标签 |
