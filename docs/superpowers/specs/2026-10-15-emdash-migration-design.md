# Web9.AI 迁移到 EmDash + Astro — 架构设计

- 日期：2026-10-15
- 分支：`emdash`（仓库 `TouchMarsSolutions/web9ai`）
- 状态标记：**已定** = 已验证或已由 owner 拍板；**建议** = 默认方案，可改；**待验证** = 计划第一个里程碑里实测

## 0. 目标与取舍

目标（按优先级）：

1. **自建 component**：内容里能用 Web9 自己定义的组件。
2. **AI 通过 API / MCP 管理内容**：Claude 等 agent 能读写、发布内容。
3. 后台可视化编辑；中英双语；托管在 Cloudflare。

明确放弃：手写 MDX、内容的 git 历史 / PR review、纯静态托管、Starlight。

## 1. 仓库与运行时

- **已定**：沿用现有仓库，在 `emdash` 分支上开发。Docusaurus 源文件放在 `legacy/`，只作为迁移脚本的输入，切换后删除。`static/` 改为 `public/`，所有 `/img/...` URL 保持不变。
- **已定**：目录结构
  - `src/` — Astro 路由、布局、`components/DocsPage.astro`
  - `packages/web9-blocks/` — native plugin（`file:` 依赖）：块定义 `index.mjs`、渲染组件 `astro/`、Markdown 渲染 `lib/markdown.mjs`
  - `scripts/` — 迁移脚本
  - `seed/` — 内容模型快照，用于复现环境（schema 变更后用 `site_export` 或手工同步）
  - `.agents/skills/` — 模板自带的 skill，加上新增的 `web9-blocks` skill
- **已定**：`output: "server"`，EmDash 1.3.x。
  - 生产：Cloudflare Workers + D1 + R2。不启用 sandboxed 插件，免费套餐即可。
  - **本地和生产用同一份配置（2026-10-15 修订）**：`@astrojs/cloudflare` 14.x 的 `astro dev` 直接跑在 workerd 里，不是 Node（adapter changelog #14306）。D1 和 R2 用 wrangler 的本地模拟，数据在 `.wrangler/state`；dev-bypass 照常可用。这样一来，Workers 兼容性问题在每次本地开发时就会暴露，不用等到部署。原先的 Node + SQLite（`data.db`）只在 POC 阶段使用。
  - 配置直接采用探针项目的做法（用 `--platform cloudflare` 生成后比对过）：`src/` 不变，多一个 `src/worker.ts`；adapter 用 `cloudflare()`，数据库用 `d1({binding:"DB", session:"auto"})`，存储用 `r2({binding:"MEDIA"})`，另加 `wrangler.jsonc` 和 `@emdash-cms/cloudflare`。
- 当前状态：`emdash` 分支在 Node 环境下 `npm run build` 和 `npm run typecheck` 都通过（0 errors），说明 `componentsEntry` 的解析和 `marked` / `sanitize-html` 的打包都没问题。
- **已验证（计划 1 Task 5）**：本地 dev 跑在 workerd 里（`navigator.userAgent` 为 `Cloudflare-Workers`），`marked` 和 `sanitize-html`（包括它依赖的 postcss 样式解析）都能正常渲染和过滤。

## 2. 内容模型

| Collection | 用途 | 字段 | 状态 |
|---|---|---|---|
| `docs` | AI / Dev 知识库 | `title`(string, searchable) · `description`(text) · `section`(select ai\|dev, 不可翻译) · `category`(string) · `sort_order`(integer, indexed, 不可翻译) · `body`(portableText, searchable)；supports drafts/revisions/preview/search/seo | **已定**，在 `seed/seed.json` 里定义（通过 MCP 建的 collection 没有全文搜索索引表） |
| `posts` | Blog | 模板自带；Docusaurus tags 映射到 `tag` taxonomy | **已定** |
| `pages` | 首页及落地页 | 加一个 `layout` 字段（`blocks` 类型），块类型包括 `hero`、`feature_grid`，以后可以继续加 | **已定**（owner 选择首页可在后台编辑） |

- **已定的规则**：doc 正文一律用 `portableText` 字段加内联块，**不用 `blocks` 字段**。原因是 issue #3670 还没解决，`blocks` 字段不会进入全文搜索。`blocks` 只用于首页这类以排版为主的页面。
- **建议**：URL 用 `/docs/{slug}` 和 `/zh-CN/docs/{slug}`。owner 已表示 URL 不重要。slug 全站唯一，转换脚本遇到重名时加前缀。
- 首页路由 `/` 读取 `pages` 里 slug 为 `home` 的条目，用 `<Blocks>` 渲染。

## 3. 组件契约（目标 1）

| 层 | 内容 | 新增一种组件需要做什么 |
|---|---|---|
| 布局层 | 侧边栏、TOC、语言切换、全屏 | 在 `src/` 里写普通 Astro 组件 |
| 内联块（`@web9/blocks`） | 已实现：`callout`、`tabs`、`details`、`mermaid`、`tool_grid`、`investment_warning` | 在 `index.mjs` 加定义，在 `astro/` 加渲染组件，在 skill 里补 cookbook 条目，然后部署，**之后**内容才能使用 |
| core 自带 | `image`、`code`、`table`、`embed`（YouTube/Vimeo）、`htmlBlock`、`break`、`gallery`、`columns`、`button` | 直接使用，不重复实现 |
| 页面块（`pages.layout`） | `hero`、`feature_grid` | 通过 MCP 的 `schema_create_block_type` 定义块类型，在 `src/components/blocks/` 写渲染组件 |

- 一句话：**用组件写内容**在后台或 MCP 里完成；**新增一种组件**需要改代码并部署。
- **已定的折中**：Block Kit 没有富文本类型的字段，repeater 里也不能放 `portableText`。所以 callout、tabs、details 的正文和工具介绍都存成 Markdown 字符串，由 `lib/markdown.mjs` 在服务端渲染（`marked`，支持 GFM、`:::tone title` 提示块、mermaid 代码块），再经过 `sanitize-html` 白名单过滤。代价是后台弹窗里看到的是 Markdown 原文，不是所见即所得。
- Docusaurus 里的 logo 表格统一转成 `tool_grid`：一组 `{name, tagline, logo, url, featured}`。core 的表格单元格只能放文字、强调和链接，放不了图片；而且结构化的数据更方便 AI 维护（"往声控必备里加一个工具"）。纯文字的表格转成 core `table`。
- **待验证**：repeater 里的多行 `text_input` 在后台弹窗中能正常编辑。
- **已验证（计划 1 Task 7）**：`ai-tools-adhoc` 的 51 个块（9 callout、8 tool_grid、5 details、1 tabs、1 table、1 mermaid、2 investment_warning）在 workerd dev 里全部渲染出来；tab 顺序正确；图片走站内的 `/img/`。

## 4. 搜索

- **已验证（计划 1 Task 8）**：正文和 core `table` 单元格里的文字能搜到；`callout` 正文、`tabs` 的 tab 正文、`tool_grid` 的工具名称里的文字搜不到（workerd dev 实测）。所以需要做 Task 9。实测方法：建探针 doc `search-probe`，每个位置放一个独一无二的词，再对 `docs` 逐个搜索。
  - 实测：正文段落 1 条、`table` 单元格 1 条；`callout` 正文、`tabs` 正文、`tool_grid` 工具名称各 0 条。
  - 原因：core 的 FTS 触发器用 `json_tree` 只提取 portableText 字段里 key 为 `text`、`alt`、`caption`、`code` 的字符串（读 `emdash` 的 `fts-manager` 源码确认）。
  - 按这条规则**推断**（未实测）：`callout` 的 `title`、`tabs` 的 `label`、`tool_grid` 的 `title` 和 `tagline`、`details` 的 `summary` 和 `body` 同样不会被索引；`mermaid` 的 `code` 会被 core 索引。
  - 做法：在 `docs` 上加一个隐藏的 `search_text`（text, searchable）字段，由 `web9-blocks` 插件的 `content:beforeSave` hook 把块里的文字摊平写进去。
  - **已实现并验证（计划 1 Task 9）**：`search_text` hook 已实现；重新保存并发布探针 doc 后，`callout` 正文、`tabs` 正文、`tool_grid` 工具名称、`table` 单元格四个探针词各搜到 1 条。字段定义没有 hidden 选项，所以在 label 里注明是自动生成。已有内容需要重新保存一次才会生成 `search_text`（计划 2 的迁移会自然覆盖）。
- **建议**：在布局里加上 core 自带的 `WebMcpSearch`，让访客浏览器里的 AI agent 可以通过 WebMCP 搜索本站。

## 5. i18n

- **已定**：Astro `i18n`，`en` 为默认语言、不加前缀；`zh-CN` 加前缀，fallback 到 `en`。EmDash 要求默认语言不加前缀，正好和现在的站点一致。
- 每种语言单独存一行，用 `translationOf` 关联。没有翻译的页面显示 fallback 提示条。`DocsPage` 根据 `getTranslations()` 渲染语言切换。
- 注意：现在默认语言下的源文件很多本身就是中文。迁移时保持原样：哪个目录的源文件就进哪个 locale，不按内容语言重新归类。

## 6. 媒体

- **已定**：`public/img/` 直接沿用旧站的图片，URL 不变，mermaid 图里引用的图片节点也照常可用。转换脚本里的 `SITE` 常量改成 `""`。POC 期间用的 `https://www.web9.ai/img/...` 只在开发阶段临时使用，**不能上线**。
- 媒体库（R2）只用于以后在后台或通过 MCP 新上传的图片。

## 7. 迁移流程

- `scripts/convert-mdx.mjs`：已经能把最复杂的一页转出 51 个块。正式使用前要修两个问题：
  1. `cssObjectToString` 会把 `rgba()` / `linear-gradient()` 里的逗号当成分隔符切断；
  2. tab 的顺序要按 `values` 数组排，而不是 `<TabItem>` 在源码里的顺序。
- Runner（`scripts/migrate.mjs`，走 MCP）：
  1. 遍历 `legacy/docs/**` 和 `legacy/i18n/zh-CN/.../current/**`；
  2. 先写 en 条目，再写 zh-CN 条目，用 `translationOf` 关联；
  3. 发布。

  幂等：按 slug 查找已有条目，存在就用 `_rev` 调 `content_update`，不存在就 `content_create`。
- Blog：用同一个转换脚本写入 `posts`，`draft: true` 的文章保持草稿状态。
- 首页：通过 MCP 创建 `hero`、`feature_grid` 块类型，再写入 `pages/home`，内容来自旧首页的 hero 和 3 个 features。

## 8. AI 管理内容（目标 2）

- MCP endpoint：`/_emdash/api/mcp`。仓库根目录的 `.mcp.json` 增加生产站点的连接，token 从环境变量读取，不写进仓库。
- **已定（owner 选择 AI 可以直接发布）**：为 AI 单独建一个用户，角色用 **Editor**。Author 只能发布和修改自己的内容，而迁移进来的内容属于管理员账号。PAT 或 OAuth 授予的 scopes 为 `content:write`、`media:write`、`menus:manage`、`taxonomies:manage`，**不给** `schema:write` 和 `settings:manage`。schema 变更由开发者用 admin token 做。出错时用 `revision_list` / `revision_restore` 回滚。
- **前置条件：创建 AI 账号（owner 手动操作一次）**。CLI 和 MCP 都没有创建用户的命令。步骤：
  1. 管理员在后台点 **Invite User**，填一个邮箱（如 `ai-agent@web9.ai`），角色选 Editor；
  2. 没有配置邮件服务时，后台会生成邀请链接，复制出来；
  3. 打开链接，用 passkey 注册账号；
  4. 以这个账号登录，创建 `ec_pat_` token，勾选上面列出的 scopes。

  简化方案：用管理员自己的 PAT，只勾选同样的 scopes。权限上等价，因为 scope 本身就会挡住 schema 和 settings 类工具；缺点是修订记录里分不清是人改的还是 AI 改的。
- AI 写内容的方式，写进 `web9-blocks` skill：
  - 普通正文用 Markdown（EmDash 会自动转换；不支持表格）；
  - 表格、复杂结构用 Portable Text JSON；
  - 在 Markdown 里插入自定义块，用单独一行 `<!--ec:block {json} -->`，已从源码确认解析器支持；
  - skill 里列出每种块的 JSON 示例；
  - **发布**：MCP 的 `content_create` 默认创建草稿（已实测）。要直接上线，传 `status: "published"`，或者之后再调用 `content_publish`。
- **已验证（计划 1 Task 10）**：agent 只通过 MCP（一次 `content_create`，`status: "published"`，`body` 是 Markdown 字符串，块用单独一行 `<!--ec:block {json} -->`）从头写了一篇带 callout ×2、tabs、表格的 doc（slug `ai-e2e`）。workerd 上页面返回 200，所有块都渲染了，页面里没有残留的 `ec:block` 文本。(a) 没写 `_key` 的块存下来**也没有** `_key`：原样存储，runtime 不会补，页面渲染不受影响；写了 `_key` 的块原样保留。所以 skill 要求每个块都带唯一 `_key`（后台编辑器是否依赖 `_key`，由 Task 11 检查）。(b) 表格**可以**通过 `ec:block` 写入：core 的 `table` 块 JSON 原样存下，页面渲染成 `<table>`，不需要退回 Portable Text JSON 数组。同一次创建里，`content:beforeSave` 钩子还写入了 `search_text`（含 callout 和 tabs 的文字，不含表格），`search` 能找到这篇。cookbook 在 `.agents/skills/web9-blocks/SKILL.md`。
- 让 AI 读站点：`/llms.txt` 路由，从 `docs` 集合生成；可以再加 `/docs/{slug}.md`，用 `emdash/client` 的 `portableTextToMarkdown` 输出。

## 9. 部署与运维

- **已定**：用 Cloudflare **Workers Builds** 连接 GitHub 仓库。
- **迁移期间生产分支设为 `emdash`**，切换时再改成 `main`。这样做有两个好处：
  - 切换前推到 `main` 的提交仍然是 Docusaurus，不会触发一次必然失败的 Worker 构建；
  - "预览环境是否和生产共用数据库"这个问题，可以等到真正有第二个环境需要保护时再处理。
- 切换步骤：
  1. 在 Cloudflare 后台创建 Worker，连接仓库，生产分支选 `emdash`（需要 owner 操作）；
  2. 在 `*.workers.dev` 上验证；
  3. 对生产环境跑迁移；
  4. 把 `emdash` 合并到 `main`，再把 Worker 的生产分支改成 `main`；
  5. 在 Worker 上绑定 `www.web9.ai` custom domain（DNS 已经在 Cloudflare），apex 重定向到 www；
  6. GitHub Pages 保留作为回退：`gh-pages` 分支还在，可以随时把 DNS 切回去。确认稳定后再关闭。
- **待验证（切换后）**：Workers 的预览版本是否和生产共用 D1/R2 binding。如果共用，就加一个 staging environment，使用独立的 D1 和 R2，再开启分支预览。
- **待验证**：D1 和 R2 是由 wrangler 在部署时自动创建，还是需要先手动创建。
- 备份：首次部署前备份 `EMDASH_ENCRYPTION_KEY`；定时导出 D1，再定期通过 MCP `site_export` 做整站导出。
- 缓存：v1 不配置。`Astro.cache` 的 warning 是预期内的。上线后先测性能，再按 EmDash 文档加 object cache。
- 模板的 cron trigger（`* * * * *`，用于定时发布）每天约 1440 次调用，在免费额度之内。

## 10. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 自定义块里的文字不进搜索 | 搜索结果残缺 | §4 的 `search_text` hook |
| Markdown 字段不是所见即所得 | 后台编辑体验一般 | 已接受；AI 和开发者是主要作者 |
| EmDash 1.x 刚发布（1.1.0 在 10-01） | API 变动较快 | 锁定 minor 版本，升级前读 changelog |
| 预览环境和生产共用数据库 | 分支代码可能改到生产数据 | §9 staging environment |
| AI 直接发布的 Markdown / HTML | XSS、CSS 注入（全屏遮罩钓鱼、`url()` 追踪） | `sanitize-html` 白名单（已实现并测试）：<br>• 去掉事件属性和 `javascript:` 链接<br>• class 只允许白名单里的几个。用了 Tailwind 之后，这条白名单**不能放宽**：`<div class="fixed inset-0 z-50">` 只靠 class 就能做出全屏遮罩<br>• inline style 只允许排版类属性，不允许定位，也不允许 `url()`、`expression()` 和 CSS 转义<br>`htmlBlock` 使用 core 的 `sanitizeContent` |
| 用请求的 Host 头拼绝对 URL（模板代码） | RSS / OG 链接被投毒 | `astro.config` 固定 `site: "https://www.web9.ai"`；`rss.xml.ts`、`posts/[slug]`、`pages/[slug]` 改为用 `site`（已修） |

## 11. 样式（2026-10-15 新增：owner 要求用 Tailwind）

- **已定**：Tailwind CSS 4.3.3，通过 `@tailwindcss/vite` 接入；Markdown 和 Portable Text 正文用 `@tailwindcss/typography` 0.5.20 的 `prose`。入口文件是 `src/styles/global.css`，由 `Base.astro` 第一个 import。
- **颜色沿用模板的 token**（`--color-bg`、`--color-text`、`--color-surface`、`--color-border`、`--color-brand` 等），名字不变，挪进 `@theme static`，生成 `bg-surface`、`text-muted`、`border-border` 这类 utility：
  - token 用的是 `light-dark()`，模板自带的明暗切换（cookie 控制 `color-scheme`）可以直接生效；
  - **不用 `dark:` variant**，因为它只认系统偏好，和模板的手动切换会不一致；
  - 用 `static` 是因为模板里不经过 Tailwind 的 CSS 也在读这些变量。Tailwind 默认只输出用到的变量，不加 `static` 它们会消失。
  - `prose` 的配色同样通过 `--tw-prose-*` 变量指向这些 token，因此也不需要 `prose-invert`。
- **内容 HTML 不带 utility class**（安全规则，见 §10）。`renderMarkdown()` 输出的 HTML 只能靠两种方式加样式：外层容器上的 `prose`，以及 `packages/web9-blocks/astro/blocks.css` 里针对 `.callout`、`pre.mermaid` 这类白名单 class 写的选择器。块组件自己的 markup（Tabs、ToolGrid 等）是代码，可以直接写 utility。
- `blocks.css` 里的规则放在 **`@layer utilities`**，不放 `components`。已实测：`@tailwindcss/typography` 把 `.prose` 放在 utilities layer，而 layer 的优先级高于选择器权重，放在 components layer 的规则会被 `prose` 的段落边距覆盖。
- `blocks.css` 里用了 `@apply`，所以必须由 `global.css` 用 `@import "@web9/blocks/styles.css"` 引入，块组件里不再各自 import CSS。
- 扫描范围：`@source not` 排除 `legacy/` 和 `docs/`，否则 Docusaurus 源文件和 spec 里的单词会生成多余的 utility（已实测，排除后不再生成）。
- 分期：计划 1 只把 docs 页面和 web9 块改成 Tailwind；`Base.astro`、blog 列表、文章页这些模板页面在计划 2 里整体重写。在此期间，Tailwind 的 preflight 可能让模板页面出现细微的样式变化，这在预期之内。
