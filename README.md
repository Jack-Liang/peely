# Peely 🧅

轻巧好记的 JSON 工具：像剥洋葱一样层层剥开嵌套转义的 JSON。纯前端实现序列化 / 反序列化 / 分层解析，左右两栏布局：左侧粘贴原始 JSON（或被转义成字符串的嵌套 JSON），右侧实时解析为树形视图或高亮文本；内嵌 JSON 字符串点击即可逐层剥开，复制时可选择保留或去除转义。所有数据仅在浏览器本地处理，不上传任何服务器。

## 功能

- **解析（反序列化）**：输入后自动解析；右侧「树形 / 文本」两种视图
  - 树形：可折叠、类型分色、点击节点显示 JSONPath 并可复制、全部展开 / 收起
  - 文本：语法高亮 + 行号 + 虚拟滚动
- **嵌套 JSON 逐层解析**：字符串值本身是 JSON 时显示「⤵ 解析 JSON」按钮，点一次解一层，可「↩ 还原字符串」回到转义形态；文本视图中此类字符串带下划线，点击跳到树形解析
- **序列化（压缩 + 转义）**：「序列化复制」输出单行 JSON；配合「保留转义」全局开关，输出为可直接嵌回代码 / 报文的带引号转义字符串（`"{\"a\":1}"`）或还原内容（`{"a":1}`）
- **转义全局开关**：决定所有复制 / 序列化输出是否保留转义
- **中文还原开关**：`\u4e2d\u6587` 与中文双向切换显示
- **压缩开关**：格式化（2 空格缩进）与单行压缩切换
- **搜索**（Ctrl+F）：在树形 / 文本视图中搜索 key 或值（不区分大小写），上一个 / 下一个导航；树形视图支持「仅看匹配」过滤（只显示命中节点及其祖先链），搜索会穿透已解析的嵌套层
- **JSONPath 定位**：树形视图顶部路径栏可直接输入路径（如 `$.data.user.name`），回车跳转选中该节点；点击节点自动回填
- **Key 排序开关**：右侧结果的对象 key 按字母序递归重排（数组顺序不变），左侧原文不动
- **格式转换**：当前结果一键复制 / 下载为 YAML 或 XML（受「中文还原」开关影响）
- **错误定位**：JSON 非法时显示错误信息与行列号，点击「定位」跳转并高亮出错行
- **性能**：解析在 Web Worker 中进行，树形 / 文本视图均为虚拟滚动，MB 级大报文不卡顿（实测 845KB / 9.9 万节点解析约 70ms）
- **工具栏**：粘贴、清空、示例、上传 `.json/.txt/.log`、下载结果、最近输入历史（localStorage，最多 20 条、单条 ≤ 1MB）
- **主题**：跟随系统 / 浅色 / 深色

## 开发

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 产物输出到 dist/（tsc 类型检查 + vite 构建）
npm run preview  # 本地预览构建产物
```

技术栈：Vite + React 18 + TypeScript + CodeMirror 6，无后端、无网络请求。

## 部署到公网

构建产物是纯静态文件（`dist/`），且 `base: './'` 配置使资源使用相对路径，可部署到任意子路径，无需额外配置。

**任意静态服务器 / VPS（nginx）：**

```nginx
server {
    listen 80;
    server_name your.domain.com;
    root /var/www/json-tool;   # dist/ 内容放到这里
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**GitHub Pages：**

```bash
npm run build
npx gh-pages -d dist    # 或把 dist/ 推到 gh-pages 分支
```

**Vercel / Netlify：** 导入仓库，构建命令 `npm run build`，输出目录 `dist`，直接部署即可。

**Cloudflare Workers（推荐，支持 GitHub 推送自动部署）：**

1. 项目已含 `wrangler.jsonc`（静态资源指向 `dist/`，SPA 回退）。
2. Cloudflare 控制台 → **Workers & Pages → Create → Workers 标签 → Import a repository**，授权 GitHub 并选中 `peely` 仓库。
3. 构建配置：Build command 填 `npm run build`，Deploy command 填 `npx wrangler deploy`。
4. Save and Deploy。之后每次 `git push`，Cloudflare 自动构建并发布到 `https://peely.<你的子域>.workers.dev`，也可在 Settings → Domains & Routes 绑定自定义域名。

本地手动发布也可以：`npm run deploy`（需先 `npx wrangler login`）。

HTTPS 不是硬性要求，但若部署在公网建议启用（剪贴板 API 在非安全源下部分浏览器会受限）。

## 目录结构

```
src/
├── App.tsx                 # 状态组装与所有交互动作
├── components/
│   ├── EditorPane.tsx      # 左栏 CodeMirror 编辑器（行号 / 错误行高亮 / 跳转）
│   ├── TextView.tsx        # 文本视图（虚拟滚动 + 高亮 + 嵌套可点击）
│   ├── TreeView.tsx        # 树形视图（虚拟滚动 + 逐层解析 + 路径复制）
│   └── Chrome.tsx          # 工具栏 / 错误条 / 状态栏 / 历史菜单
├── lib/
│   ├── jsonx.ts            # 序列化、转义、Unicode、错误扫描定位、Key 排序、统计
│   ├── tokenize.ts         # JSON 文本分词（标注内嵌 JSON 及其路径）
│   ├── tree.ts             # 树展平、自动展开、全层解析、路径解析
│   ├── search.ts           # 树形 / 文本搜索匹配
│   ├── convert.ts          # YAML / XML 导出
│   ├── path.ts             # JSONPath 构造与解析
│   └── browser.ts          # 剪贴板 / localStorage / 下载
└── worker/parse.worker.ts  # Web Worker：解析 + 格式化 + 分词
```
