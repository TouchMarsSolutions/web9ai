# Web9.AI 迁移到 EmDash + Astro — 架构设计

- 日期：2026-10-15
- 分支：`main`（计划 1 的 PR #2 已合并；计划 2 在 `plan2` 分支）；仓库 `TouchMarsSolutions/web9ai`
- 进度：计划 1 完成（2026-10-15）；计划 2 完成（本地迁移和安全关口，2026-10-16）；计划 3（部署、生产迁移、切换）进行中，见 `docs/superpowers/plans/2026-10-17-emdash-plan3-deploy-cutover.md`
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
  - 生产：Cloudflare Workers + D1 + R2。不启用 sandboxed 插件。**已定（2026-10-17，计划 3）**：Workers 已经取消了压缩后体积的上限，只限未压缩 64 MiB，Free 和 Paid 一样（developers.cloudflare.com/workers/platform/limits，2026-10-17 查）。本站 `wrangler deploy --dry-run` 为 19238.86 KiB（gzip 5061.54 KiB 只作参考），不用裁剪。账号是 Workers Paid（owner 2026-10-09 确认，记在 touchmars.technology 仓库），每个请求的 CPU 默认上限 30 s；Free 只有 10 ms，渲染重的 doc 页会超。
  - **本地和生产用同一份配置（2026-10-15 修订）**：`@astrojs/cloudflare` 14.x 的 `astro dev` 直接跑在 workerd 里，不是 Node（adapter changelog #14306）。D1 和 R2 用 wrangler 的本地模拟，数据在 `.wrangler/state`；dev-bypass 照常可用。这样一来，Workers 兼容性问题在每次本地开发时就会暴露，不用等到部署。原先的 Node + SQLite（`data.db`）只在 POC 阶段使用。
  - 配置直接采用探针项目的做法（用 `--platform cloudflare` 生成后比对过）：`src/` 不变，多一个 `src/worker.ts`；adapter 用 `cloudflare()`，数据库用 `d1({binding:"DB", session:"auto"})`，存储用 `r2({binding:"MEDIA"})`，另加 `wrangler.jsonc` 和 `@emdash-cms/cloudflare`。
- 当前状态（计划 2 结束）：本地 workerd dev 里完整迁移可从空库重复（首次：`node scripts/migrate.mjs all --dry-run`，`node scripts/migrate.mjs menu --overwrite`，然后 `node scripts/migrate.mjs all`；再跑一次 `all` 不写入任何东西，因为 seed 的菜单与目标不同，直接跑 `all` 会在 `[WOULD_OVERWRITE] menu/primary` 停下，见 §7）；`npm test`、`npm run build`（含公开 CSS 检查）、`npm run typecheck` 通过；CI 跑测试和构建。
- **已验证（计划 1 Task 5）**：本地 dev 跑在 workerd 里（`navigator.userAgent` 为 `Cloudflare-Workers`），`marked` 和 `sanitize-html`（包括它依赖的 postcss 样式解析）都能正常渲染和过滤。

## 2. 内容模型

| Collection | 用途 | 字段 | 状态 |
|---|---|---|---|
| `docs` | AI / Dev 知识库 | `title`(string, searchable) · `description`(text) · `section`(select ai\|dev, 不可翻译) · `category`(string) · `sort_order`(integer, indexed, 不可翻译) · `body`(portableText, searchable) · `search_text`(text, searchable；由 `web9-blocks` 的 `content:beforeSave` hook 自动生成，不要手写)；supports drafts/revisions/preview/search/seo | **已定**，在 `seed/seed.json` 里定义（通过 MCP 建的 collection 没有全文搜索索引表） |
| `posts` | Blog | 模板自带字段 + `search_text`（text, searchable，hook 生成）；Docusaurus tags 映射到 `tag` taxonomy，5 个 term 定义在 seed 里，由迁移 runner 的 `terms` 步骤写进库 | **已定** |
| `pages` | 首页及落地页 | 字段 `title`、`content`、`search_text`、`layout`（`blocks`，`allowedTypes: hero, feature_grid`）；块类型由 seed 的 `blockTypes` 定义 | **已定**（owner 选择首页可在后台编辑） |

- **已定的规则**：doc 正文一律用 `portableText` 字段加内联块，**不用 `blocks` 字段**。原因是 issue #3670 还没解决，`blocks` 字段不会进入全文搜索。`blocks` 只用于首页这类以排版为主的页面。
- **建议**：URL 用 `/docs/{slug}` 和 `/zh-CN/docs/{slug}`。owner 已表示 URL 不重要。slug 全站唯一，转换脚本遇到重名时加前缀。
- **已定（计划 2 Task 8）**：`category` 存目录名去掉数字前缀（`cloud`、`prompt`、`usecase`、`article`、`model`；直接在 `ai/`、`dev/` 下的文档存 `general`），显示名由站点代码映射（Cloud / Prompt Engineering / Use Case / Articles / Model；zh-CN 的 usecase 显示"神兵利器"）。存显示名的话，zh-CN 只翻译了部分文档时同一个分类会分成两组。`sort_order` = section 序号 × 1,000,000 + 根条目名次 × 1000 + 分类内名次，复现 Docusaurus 的侧边栏顺序。slug 重名时整组改成 `<category 或 section>-<slug>`（目前没有重名）。规则实现在 `scripts/lib/legacy-tree.mjs`。显示名在 `packages/web9-site/lib/docs-nav.mjs`（计划 2 Task 12），根目录的文档组显示 section 名（AI / Dev）。fallback 页面的 canonical 指向 en URL。
- 首页路由 `/` 读取 `pages` 里 slug 为 `home` 的条目，用 `<Blocks>` 渲染。

## 3. 组件契约（目标 1）

| 层 | 内容 | 新增一种组件需要做什么 |
|---|---|---|
| 布局层 | 侧边栏、TOC、语言切换、全屏 | 在 `src/` 里写普通 Astro 组件 |
| 内联块（`@web9/blocks`） | 已实现：`callout`、`tabs`、`details`、`mermaid`、`tool_grid`、`investment_warning` | 在 `index.mjs` 加定义，在 `astro/` 加渲染组件，在 skill 里补 cookbook 条目，然后部署，**之后**内容才能使用 |
| core 自带 | `image`、`code`、`table`、`embed`（YouTube/Vimeo）、`htmlBlock`、`break`、`gallery`、`columns`、`button` | 直接使用，不重复实现。**例外：`htmlBlock` 不要用**：core 的 sanitizer 保留 `class`/`id`/`data-*`，不是 class-safe（见 §10） |
| 页面块（`pages.layout`） | `hero`、`feature_grid` | 在 `seed/seed.json` 的 `blockTypes` 里定义（新库首次启动时应用）；已经存在的库用 MCP `schema_create_block_type` 加上同样的定义，再 `schema_update_field` 把它加进 `pages.layout` 的 `allowedTypes`；在 `src/components/blocks/` 写渲染组件，在 `HomePage.astro` 的 components map 里登记 |

- 一句话：**用组件写内容**在后台或 MCP 里完成；**新增一种组件**需要改代码并部署。
- **已定的折中**：Block Kit 没有富文本类型的字段，repeater 里也不能放 `portableText`。所以 callout、tabs、details 的正文和工具介绍都存成 Markdown 字符串，由 `lib/markdown.mjs` 在服务端渲染（`marked`，支持 GFM、`:::tone title` 提示块、mermaid 代码块），再经过 `sanitize-html` 白名单过滤。代价是后台弹窗里看到的是 Markdown 原文，不是所见即所得。
- Docusaurus 里的 logo 表格统一转成 `tool_grid`：一组 `{name, tagline, logo, url, featured}`。core 的表格单元格只能放文字、强调和链接，放不了图片；而且结构化的数据更方便 AI 维护（"往声控必备里加一个工具"）。纯文字的表格转成 core `table`。
- **已验证（计划 1 Task 11）**：repeater 里的多行 `text_input` 在后台弹窗中能正常编辑。在 `ai-tools-adhoc` 里打开第一个 `tool_grid` 的弹窗，展开第一个工具，tagline 是多行文本框，已有的换行原样显示；按 Enter 是换行，不会提交表单；改成 `第一行` + Enter + `第二行`，弹窗 Save 后自动存成草稿，MCP 读到 `"第一行\n第二行"`，发布后页面上渲染成 `第一行<br />第二行`。没有 `_key` 的块（Task 10 的 `ai-e2e`）在后台也能正常打开、编辑、保存，保存时编辑器会自动补上 `_key`。后台把 `search_text` 显示成一个可编辑的文本框，但每次带正文保存都会被 hook 覆盖。
- **已验证（计划 1 Task 7）**：`ai-tools-adhoc` 的 51 个块（9 callout、8 tool_grid、5 details、1 tabs、1 table、1 mermaid、2 investment_warning）在 workerd dev 里全部渲染出来；tab 顺序正确；图片走站内的 `/img/`。

## 4. 搜索

- **已验证（计划 1 Task 8）**：正文和 core `table` 单元格里的文字能搜到；`callout` 正文、`tabs` 的 tab 正文、`tool_grid` 的工具名称里的文字搜不到（workerd dev 实测）。所以需要做 Task 9。实测方法：建探针 doc `search-probe`，每个位置放一个独一无二的词，再对 `docs` 逐个搜索。
  - 实测：正文段落 1 条、`table` 单元格 1 条；`callout` 正文、`tabs` 正文、`tool_grid` 工具名称各 0 条。
  - 原因：core 的 FTS 触发器用 `json_tree` 只提取 portableText 字段里 key 为 `text`、`alt`、`caption`、`code` 的字符串（读 `emdash` 的 `fts-manager` 源码确认）。
  - 按这条规则**推断**（未实测）：`callout` 的 `title`、`tabs` 的 `label`、`tool_grid` 的 `title` 和 `tagline`、`details` 的 `summary` 和 `body` 同样不会被索引；`mermaid` 的 `code` 会被 core 索引。
  - 做法：在 `docs` 上加一个 `search_text`（text, searchable）字段，由 `web9-blocks` 插件的 `content:beforeSave` hook 把**本插件自己的块类型**里的文字摊平写进去（core 的块不处理，留给 core 的索引）。
  - **已实现并验证（计划 1 Task 9）**：`search_text` hook 已实现；重新保存并发布探针 doc 后，`callout` 正文、`tabs` 正文、`tool_grid` 工具名称、`table` 单元格四个探针词各搜到 1 条；其中 `table` 单元格那条来自 core 自己的索引，不是 hook 写的。字段定义没有 hidden 选项，所以在 label 里注明是自动生成。已有内容需要重新保存一次才会生成 `search_text`（计划 2 的迁移会自然覆盖）。
  - **已定（计划 2 Task 3）**：`posts.content`、`pages.content` 也用同一个 hook 写 `search_text`（hook 里的 collection → 字段映射 `{docs: body, posts: content, pages: content}`）。搜索只搜当前语言：zh-CN 页面上搜不到还没翻译的 en doc，接受（fallback 页面本来就是 en 内容）。
- **建议**：在布局里加上 core 自带的 `WebMcpSearch`，让访客浏览器里的 AI agent 可以通过 WebMCP 搜索本站。

## 5. i18n

- **已定**：Astro `i18n`，`en` 为默认语言、不加前缀；`zh-CN` 加前缀，fallback 到 `en`。EmDash 要求默认语言不加前缀，正好和现在的站点一致。
- 每种语言单独存一行，用 `translationOf` 关联。没有翻译的页面显示 fallback 提示条。`DocsPage` 根据 `getTranslations()` 渲染语言切换。
- 注意：现在默认语言下的源文件很多本身就是中文。迁移时保持原样：哪个目录的源文件就进哪个 locale，不按内容语言重新归类。
- hreflang：core 按 collection 的 `urlPattern` 给有翻译的条目生成 alternates（docs 是 `/docs/{slug}`，没问题）。首页是 `pages` 里 slug 为 `home` 的条目，pattern 会得到 `/pages/home` 和 `/zh-CN/pages/home`，都是重定向，爬虫会丢掉。所以 `@web9/blocks` 插件的 `page:metadata` hook（`pageMetadata`）给这两个首页贡献 `en` → `/`、`zh-CN` → `/zh-CN/`、`x-default` → `/`（绝对 URL，用 `page.siteUrl`，即 `Astro.site`）；插件的 link 排在 core 前面，同一个 hreflang 先到先得（`page/metadata.ts`），所以替换的是 core 的那三条，其他页面不受影响。`HomePage.astro` 仍然传 `content`（SEO 面板的覆盖需要它）。`verify` 检查两个首页恰好是这三条、不含 `/pages/home`。

## 6. 媒体

- **已定**：`public/img/` 直接沿用旧站的图片，URL 不变，mermaid 图里引用的图片节点也照常可用。转换脚本里的 `SITE` 常量改成 `""`。POC 期间用的 `https://www.web9.ai/img/...` 只在开发阶段临时使用，**不能上线**。
- prose 里的图片迁移成 core `image` 块，`asset.url` 直接是 `/img/...`（`_ref` 为空），不进媒体库（计划 2 Task 7）。12 张外链图片（cloudinary、lambdalabs 等）保持外链，风险不变。
- 媒体库（R2）只用于以后在后台或通过 MCP 新上传的图片。

## 7. 迁移流程

- `scripts/convert-mdx.mjs`：已经能把最复杂的一页转出 51 个块。正式使用前要修两个问题：
  1. `cssObjectToString` 会把 `rgba()` / `linear-gradient()` 里的逗号当成分隔符切断；
  2. tab 的顺序要按 `values` 数组排，而不是 `<TabItem>` 在源码里的顺序。
- **计划 2 补齐的转换规则（Task 6–7）**：key 由 slug 和遍历顺序决定（FNV-1a），输出可重复；标题 = frontmatter `title` ?? 第一个 H1，第一个 H1 总是从正文删掉；InvestmentWarning 的语言看 import；4 冒号 admonition 拆成两个 callout；图片 → core `image`；YouTube → core `embed`（块正文里是链接）；tools-gallery → `tool_grid`；details 里的 Tabs → 粗体标签 + 代码块；列表项里的 admonition → 该项之后的 callout；有序列表带 `listId`/`listStart` 续号；`MDXTemplate`、`AlignedText`、`TwitterFollowButton`、`<style>` 去掉标签；列表项里的代码块、`<details>` 和 HTML 按顶层同样的规则转换，放在该项之后（计划 2 Task 7 评审：之前这些内容被静默丢掉）；bilibili `<iframe>` 播放器：同一列表项或下一个块已经链接到该视频就丢掉，否则换成一段指向播放器的链接，永远不输出 iframe；其他 raw HTML（块级或行内，`<img>`、`<br>` 除外）直接报错，转换器不再产出 `htmlBlock`。图片、视频、callout 移出所在的块之后，块末尾留下的换行一并去掉（否则渲染成多余的 `<br>`）。gate：`scripts/lib/legacy-convert.test.mjs`（转换无错误、guard 通过、没有残留 MDX，并且源文件里每个代码块的第一行、每个 http(s) 链接、每个视频 id 都还在）。
  - **已知的版式损失**：嵌套列表中间插入的块（图片、embed、callout、代码块）之后，该嵌套列表剩下的项渲染到顶层：编号仍然正确（`listId`/`listStart`），但缩进丢失（emdash 的列表树遇到非列表块就清空父级）。旧内容里有 20 处，其中 7 处是有序列表：en `00_guide` 的 "Google Gemini"（`<ol start=2>`），以及 en/zh `02-replicate` 里被代码块隔开的 4 步（各 3 处，`start` 为 2、3、4）；编号全部正确。
- Runner（`scripts/migrate.mjs`，走 MCP）：
  1. 遍历 `legacy/docs/**` 和 `legacy/i18n/zh-CN/.../current/**`；
  2. 先写 en 条目，再写 zh-CN 条目，用 `translationOf` 关联；
  3. 发布。

  幂等且默认不覆盖（计划 2 Task 9 实现：`scripts/migrate.mjs`）：按 slug + locale 用 `content_get` 查找；不存在就 `content_create`（直接 `status: "published"`，zh-CN 带 en 条目的 ULID 作为 `translationOf`）；存在就只比较 payload 里的字段（`content_get` 在有待发布草稿时返回的是草稿内容，`liveData` 才是线上版本），一样就不写。第二次运行必须是全部 unchanged；`node scripts/migrate.mjs verify` 检查 52 个 doc URL。生产上重跑时，runner **遇到会改动已有内容的情况就停下**，不会悄悄撤销编辑者或 AI 之后的修改，五条规则：
  1. 已发布条目与 payload 有差异：报 `[WOULD_OVERWRITE]`（带第一处差异）并停下；加 `--overwrite` 才会 `content_update`（它总是写草稿）再 `content_publish`。`--dry-run` 不报错，只把这类条目列为 "updated" 并给出差异，让操作者先看。
  2. 有待发布草稿（`draftRevisionId` 非空），**不管条目是什么状态**（对已发布条目是改动暂存的草稿；对 `draft` 状态的条目，后台任何一次保存都会暂存草稿；后台"取消发布"也会留下一份线上版本的草稿副本）：草稿与 payload 有差异就报 `[PENDING_DRAFT]` 并停下，即使加了 `--overwrite` 也一样（`--dry-run` 同样报错），要人在后台发布或丢弃草稿。草稿与 payload 完全一致（中断的上一次 `--overwrite` 留下的）且 payload 要发布，就直接 `content_publish`，这是恢复路径。payload 要的是草稿而草稿已和 payload 一致，保持 unchanged。
  3. 状态不符报 `[STATUS_MISMATCH]`：payload 要草稿而条目已发布；payload 要发布而条目是草稿（后台取消发布过，或有人手写的草稿）。runner 只会把条目变成已发布，不会取消发布，也不会把别人取消发布的条目重新发布。唯一的例外是**上一次运行崩溃留下的草稿**：MCP 的 `content_create` 带 `status: "published"` 实际是先建草稿再发布（`mcp/server.ts`），中间崩溃会留下一条从未发布、从未保存的草稿，判据是 `status` 为 `draft` 且 `liveRevisionId`、`draftRevisionId`、`publishedAt` 全为空（后台取消发布的条目有 `publishedAt` 和草稿副本，保存过的草稿有 `draftRevisionId`）。这种条目与 payload 一致才发布；有差异就报 `[STATUS_MISMATCH]`，加 `--overwrite` 和 `--dry-run` 也一样，因为人在后台新建后没再保存、或保存后又丢弃草稿的条目长得和遗留一模一样，不能替换。判据存疑就报错，让人发布或删除。带 `publishedAt` 的创建（Task 10 的 posts）会在草稿上写 `published_at`，不会被认作遗留：posts 的创建中途崩溃也按这里处理（报 `[STATUS_MISMATCH]`，人在后台发布或删除），Task 10 没有放宽。
  4. 菜单同理：`menu_get` 的内容与目标有差异就报 `[WOULD_OVERWRITE] menu/<name>`，要 `--overwrite` 才会 `menu_set_items`；`--dry-run` 列出差异。
  5. 重定向同理（计划 2 Task 10：`scripts/lib/redirects.mjs`）：组 `legacy-docusaurus` 里已有的规则，目标或类型与迁移不同，或被禁用（`enabled: false`），都是管理员改过的（禁用一条规则也是管理员的编辑），报 `[WOULD_OVERWRITE] redirect <source>`（带差异）并停下，要 `--overwrite` 才会用 `PUT` 改回迁移的值。先对整张表做完比较再动手，所以报错时一条都没写（缺的规则也不创建）；`--dry-run` 把它们列为 "updated" 并给出差异。组外的规则不读也不写（组外规则占了同一个 source 时，创建会得到 409 `CONFLICT`，同样停下）。组里多出来的规则只报告为 `extra`，永远不删除。

  遇到 `ENTRY_LOCKED`（更新或发布时）停下，永远不传 `overrideLock`。**生产第一次运行**会改 seed 里的菜单（Blog、GitHub 两项，GitHub 没有 `target`），所以先 `--dry-run` 看差异，确认之后带 `--overwrite` 运行 `menu`。
  已知的边界：(a) taxonomies 和 `publishedAt` 只在创建和更新时写入，不参与比较，所以这两项被人改了不会被发现；带 `--overwrite` 更新时 taxonomies 会被整体替换，不做 diff。(b) 按 slug + locale 找条目，所以改过 slug 或已被永久删除的条目会被重新创建；只在回收站里的 slug 会让 `content_create` 报 `SLUG_CONFLICT`，同样停下。(c) `draft` 状态的条目被 runner 自己的 `--overwrite` 更新过一次之后也带着草稿，之后 payload 再变就会报 `[PENDING_DRAFT]`，要人处理。

- Blog（计划 2 Task 10）：`scripts/lib/posts.mjs` 用同一个 converter 写入 `posts`；`<!-- truncate -->` 上面的文字成为 `excerpt` 并从 `content` 里去掉；tag 用 seed 里定义的 term（runner 的 `terms` 步骤从 `seed/seed.json` 补建，因为 `applySeed` 只在 `includeContent` 时写 terms）；日期 `publishedAt` 用文件第一次 git 提交的日期（真实的写作日期；目录名里的日期没有分隔符，Docusaurus 不认，旧站显示的是构建日期，所以不照搬旧站显示的日期）；`draft: true` 的文章保持草稿状态（`/posts/<draft-slug>` 和不存在的 slug 一样，返回 404 页面）。
- 旧 URL（计划 2 Task 10）：`scripts/lib/redirects.mjs` 生成 83 条 301（组 `legacy-docusaurus`：52 条 doc、10 条 blog、20 条 category、`/pages/home`）：26 篇 doc 的旧 URL 在 en 和 `/zh-CN` 下各一条；`/blog`、`/blog/archive`、`/blog/tags` → `/posts`，`/blog/[slug]` → `/posts/[slug]`，`/blog/tags/[tag]` → `/tag/[tag]`（en、zh-CN 各一套）；Docusaurus 自动生成的 `/category/<label>`（和可能存在的 `-1` 副本）→ 该分类的第一篇 doc，`/zh-CN/category/<label>[-1]` → `/zh-CN` + 该 doc 的新 URL（旧站两种语言都有这些页面，语言前缀保留，不绕到 en）；`/pages/home` → `/`。runner 用 admin token 通过 REST 同步（没有 MCP 工具），只创建、不删除；已有规则被改过时要 `--overwrite`（上面第 5 条）。带扩展名的路径不经过 EmDash 的重定向中间件，所以 `/blog/rss.xml`、`/blog/atom.xml` 和 `/zh-CN/blog/rss.xml`、`/zh-CN/blog/atom.xml`（旧站两种语言都有）→ `/rss.xml` 写在 `astro.config.mjs` 的 `redirects` 里（只有一个 en 的 feed）。已知不覆盖、会 404 的旧 URL：doc 的 `/tags`、`/tags/*`、`/markdown-page` 等；切换后看 `/_emdash/api/redirects/404s` 再补。**注意**：精确规则 `/category/{cloud,model,articles,use-case,prompt-engineering}[-1]`（和 `/zh-CN` 下同名的规则）先于 `/category/[slug]` 匹配，所以编辑在后台建一个 slug 与之相同的 category term 时，它的分类页会被重定向到 doc 而打不开；换一个 slug，或先删掉对应的规则。
- 首页（计划 2 Task 11）：块类型 `hero`、`feature_grid` 和 `pages.layout` 在 seed 里（Task 1）；runner 的 `home` 步骤写入 `pages/home` 的 en、zh-CN 两行（内容在 `scripts/lib/home-content.mjs`，来自旧首页的 hero、3 个 features 和 `code.json` 的中文；"Energe" 改成了 "Energy"）。`/`、`/zh-CN/` 由 `HomePage.astro` 用 `<Blocks>` 渲染，库里没有首页时显示占位。

## 8. AI 管理内容（目标 2）

- MCP endpoint：`/_emdash/api/mcp`。仓库根目录的 `.mcp.json` 增加生产站点的连接，token 从环境变量读取，不写进仓库。AI 用的 access token 只有 1 小时有效期，运行环境要自己用 refresh token 续期（见下面的 runbook 第 5 步），环境变量里的静态 token 一小时后就失效。
- **已定（owner 选择 AI 可以直接发布；token 方式 2026-10-17 改定）**：
  - 为 AI 单独建一个用户，角色用 **Editor**：Author 只能发布和修改自己的内容，而迁移进来的内容属于管理员账号。
  - token 走 **OAuth device flow**，不用 PAT。PAT 只能由 Admin 给自己生成（`POST /_emdash/api/admin/api-tokens`），token 的身份就是这个 Admin（角色检查按 Admin，revision 记在 Admin 名下），只靠 scope 收窄；Editor 根本拿不到 PAT。device flow 发的 token 是"请求的 scope ∩ Editor 允许的 scope"。
  - scope 只要 `content:read content:write media:read media:write`。`content:write` 隐含 `menus:manage`、`taxonomies:manage`；不给 `schema:read`，也拿不到 `schema:write`、`settings:manage`、`admin`、`transfer:*`。schema 变更由开发者用 admin token 做。出错时用 `revision_list` 加 `content_update` 回滚（见 skill）。
- **runbook：发放 AI token（owner 操作，在 AI PAT 之前的 7 项都完成之后，见 `docs/superpowers/specs/2026-10-17-ai-pat-preconditions-design.md`）**
  1. 管理员在后台点 **Invite User**，填一个邮箱（如 `ai-agent@web9.ai`），角色选 Editor。没有配置邮件服务时，后台会生成邀请链接，打开它用 passkey 注册。
  2. 在 AI 的运行环境里调 `POST /_emdash/api/oauth/device/code`，body 为 `{"scope":"content:read content:write media:read media:write"}`。一定要显式传 scope：不传的话默认还会给 `schema:read`。
  3. 以 AI 用户登录后台，打开 `/_emdash/admin/device`，输入 user code 并批准。运行环境轮询 `POST /_emdash/api/oauth/device/token`，body 为 `{"device_code":"…","grant_type":"urn:ietf:params:oauth:grant-type:device_code"}`（`device_code` 来自第 2 步的响应，按响应里的 `interval` 轮询，默认 5 秒；device code 15 分钟过期），批准后拿到 access token（1 小时过期）和 refresh token（90 天）。
  4. 核对：
     - 用这个 token 调 MCP `content_list` 应该成功；
     - `schema_list_collections`、`settings_update`、`site_export_start`，以及 REST `GET /_emdash/api/admin/api-tokens`、`GET /_emdash/api/redirects` 都应该被拒。
  5. 续期：access token 1 小时后过期，运行环境调 `POST /_emdash/api/oauth/token/refresh`，body 为 `{"grant_type":"refresh_token","refresh_token":"…"}`，拿到新的 access token（旧的立即失效）。refresh token 不轮换，返回的还是同一个，续期也不延长它的 90 天；到期后要重新走一遍 device flow（第 2、3 步）。续期时 core 按这个用户当前的角色重新收窄 scope；用户被停用或删除后续期失败。
  6. refresh token 只放在 AI 运行环境的 secret 里。停用时调 `/_emdash/api/oauth/token/revoke`，或者在后台禁用这个用户。
  7. 永远不给 AI `transfer:*`、`admin` 或 import 权限；AI 发起的 transfer 请求一律不批准。R2 bucket 不开公开访问（不加 r2.dev 域名，也不绑自定义域名）。
- AI 写内容的方式，写进 `web9-blocks` skill：
  - 普通正文用 Markdown（EmDash 会自动转换；Markdown 的表格语法不会转换）；
  - 表格和其他复杂结构也用单独一行 `ec:block` 写 JSON 块：`table` 已实测可以（见下方 Task 10），不需要把整个 body 改成 Portable Text JSON；
  - 在 Markdown 里插入自定义块，用单独一行 `<!--ec:block {json} -->`，已从源码确认解析器支持；
  - skill 里列出每种块的 JSON 示例；
  - **发布**：MCP 的 `content_create` 默认创建草稿（已实测）。要直接上线，传 `status: "published"`，或者之后再调用 `content_publish`。
  - 写入时 guard：hook 拒绝 `htmlBlock`、`iframe`、带 `html` 的 `embed`、未知 `_type` 和 core 块里会被拼进 `class`/`style` 的非法字段值（计划 2 Task 3），错误码 `SAVE_REJECTED`。保存、发布和定时发布都会跑这套检查（发布时被拒：`PUBLISH_REJECTED` / `SCHEDULE_REJECTED`）；长度上限、body 总量上限和写入闸门见 `docs/superpowers/specs/2026-10-17-ai-pat-preconditions-design.md`。
- **已验证（计划 1 Task 10）**：agent 只通过 MCP（一次 `content_create`，`status: "published"`，`body` 是 Markdown 字符串，块用单独一行 `<!--ec:block {json} -->`）从头写了一篇带 callout ×2、tabs、表格的 doc（slug `ai-e2e`）。workerd 上页面返回 200，所有块都渲染了，页面里没有残留的 `ec:block` 文本。(a) 没写 `_key` 的块存下来**也没有** `_key`：原样存储，runtime 不会补，页面渲染不受影响；写了 `_key` 的块原样保留。所以 skill 要求每个块都带唯一 `_key`（后台编辑器的表现见 §3 的 Task 11 结果：没有 `_key` 的块能正常编辑，保存时编辑器会补上 key；只走 MCP 的内容仍然没有 key）。(b) 表格**可以**通过 `ec:block` 写入：core 的 `table` 块 JSON 原样存下，页面渲染成 `<table>`，不需要退回 Portable Text JSON 数组。同一次创建里，`content:beforeSave` 钩子还写入了 `search_text`（含 callout 和 tabs 的文字，不含表格），`search` 能找到这篇。cookbook 在 `.agents/skills/web9-blocks/SKILL.md`。
- 让 AI 读站点（计划 2 Task 13）：`/llms.txt`（en doc）和 `/zh-CN/llms.txt`（有翻译的 zh-CN doc），按侧栏分组列出，每个链接指向 `/docs/{slug}.md`。`.md` 由 `@web9/blocks/to-markdown` 的 `blocksToMarkdown` 生成：core 文本和图片用 `emdash/client` 的 `portableTextToMarkdown`；core 代码、web9 块、表格、分隔线写成 Markdown（代码的围栏比内容里最长的反引号串更长，内容里的 ``` 关不掉它）；`embed` 只在站点会渲染成播放器（YouTube、Vimeo，与 `embedSrc` 一致）时写成指向原始 URL 的链接，否则丢掉；`htmlBlock` 和未知块丢掉，输出里永远没有 `ec:block` JSON；站内相对链接和图片改成 `https://www.web9.ai/...`（代码块和行内代码里的不改）。链接规则（与 `sanitizeHref` 同一规则）只管 core 文本里的链接和图片、`tool_grid` 的 url 和 `embed`：不安全的链接只留文字，不安全的图片整块丢掉。callout、tabs、details 的正文是 Markdown 值，按作者写的原样输出（可能含 `javascript:` 链接或原始 HTML），不经过这条规则；它们是惰性的，因为响应是 `text/markdown` 并带 `nosniff`，不会被当作 HTML 渲染。内容由 AI agent 不经审核发布，所以任何格式错误的值只会让那个节点被丢掉，不会让页面 500，处理成本也只随内容大小线性增长；四个路由的所有响应（含 404）都带 `X-Content-Type-Options: nosniff`。缓存：已登录的编辑、edit 模式 cookie（`emdash-edit-mode=true`）或带 `_preview` 参数的请求能看到草稿修订，所以这类请求的每个响应（200、404、503）都是 `Cache-Control: private, no-store`，`.md` 此时返回 core 给出的版本（含草稿），不进共享缓存；其余请求是 `public, max-age=300`，且 `.md` 只返回已发布的版本（草稿、预览副本一律 404，zh-CN 没有翻译时 404）；读取出错时返回 503 `no-store`，不返回会被缓存的空 200。`rss.xml` 用同一个判断（`packages/web9-site/lib/cache-control.mjs`）。站内搜索另外通过 `WebMcpSearch`（Task 4）暴露给支持 WebMCP 的浏览器 agent。

## 9. 部署与运维

- **已定**：用 Cloudflare **Workers Builds** 连接 GitHub 仓库。
- **已定（owner，2026-10-15，计划 1 结束时）**：PR #2 在计划 1 结束时就合并进 `main`，不再等切换。合并前在 `main` 上打了 tag `docusaurus-final`（指向最后一个 Docusaurus 提交 `b2a8b275`）。Worker 的**生产分支直接用 `main`**。原来"迁移期间生产分支用 `emdash`"是为了不让 `main` 上的 Docusaurus 提交触发必然失败的 Worker 构建，合并后这个理由已经不存在。合并不影响线上：`main` 不再有部署旧站的 workflow，GitHub Pages 继续提供 `gh-pages` 上已经构建好的旧站。
- 切换步骤：
  1. 首次部署用本机 `wrangler deploy`（`CLOUDFLARE_API_TOKEN`）。Workers Builds（连接仓库，生产分支 `main`）在切换稳定后由 owner 在后台连接（2026-10-17 改定，理由见 `docs/superpowers/plans/2026-10-17-emdash-plan3-deploy-cutover.md` Task 5）；
  2. 在 `*.workers.dev` 上验证；
  3. 对生产环境跑迁移；
  4. 在 Worker 上绑定 `www.web9.ai` 和 `web9.ai` 两个 Custom Domain（DNS 已经在 Cloudflare），`src/worker.ts` 把 apex 重定向到 www。**已完成**：`wrangler.jsonc` 的 `routes` 写成 `custom_domain: true`（不用普通 route，Change domain 只认 Custom Domain）。非交互的 `wrangler deploy` 会不提示、直接覆盖冲突的 DNS 记录，所以先按 id 删掉 GitHub Pages 的 5 条记录（apex 的 4 条 A、`www` 的 CNAME，备份在 `.local/dns-backup.json`），再部署，部署后比对全部记录，MX、TXT 不变（计划 3 Task 4）。上线日期和 version 由 Task 6 补上；
  5. GitHub Pages 保留作为回退：回退靠的是 `gh-pages` 分支上**已经构建好的产物**（Pages 设置：source `gh-pages`，custom domain `www.web9.ai`），可以随时把 DNS 切回去。确认稳定后再关闭。旧站源码完整保存在 tag `docusaurus-final`，需要时从它重建；`legacy/` **不能**重新构建出线上站点（静态资源已经移到 `public/`），不要从它重新部署到 `gh-pages`。原来的 `static/CNAME` 和 `deploy.yml` 也放在 `legacy/static/` 和 `legacy/.github/workflows/`，只作记录，workflow 不会运行。
- **已定（2026-10-17）**：不开预览。`wrangler versions upload` 上传的版本（Workers Builds 给非生产分支构建时就是这样做的）和生产共用 D1、R2 binding，而 EmDash 在版本第一次收到请求时跑 core migration，所以一个升级了 emdash 的分支一旦能被访问，就会改生产库的 schema。真正起作用的是 Workers Builds 关掉非生产分支构建（计划 3 Task 5）。`preview_urls: false` 只是不给版本分配预览 URL，上传的版本照样带着生产 binding。`wrangler dev --remote` 也会连生产 D1，不要用。以后需要预览时，加一个用独立 D1、R2 的 staging environment。
- **已验证（2026-10-17）**：wrangler 按 `wrangler.jsonc` 里的名字连接资源，找不到就创建。D1 `web9-ai`（`721318a8-ef7b-46b0-9e7c-423d1496882a`，WNAM，read replication `auto`，`d1({session:"auto"})` 需要它）和 R2 `web9-ai-media`（WNAM，没有公开访问）已于 2026-10-17 建好。KV `SESSION` 不写名字，首次部署时由 wrangler 建成 `web9-ai-session`。`IMAGES` 不需要另建资源。`wrangler.jsonc` 只写名字、不写 id，和同账号的 itouchmars、touchmars.technology 一样。
- **首次启动**：EmDash 在空库第一次启动时自动应用一次 `seed/seed.json`（`applySeed`，`onConflict: "skip"`，之后不再应用，改 seed 也没用），写入 settings、collections、taxonomies、menus、widgetAreas；content 只在 setup 向导里选了才导入。所以 seed 只放 Web9.AI 自己的站点信息，不放模板 demo 内容；菜单只放稳定链接（Blog、GitHub），AI/Dev 入口由迁移 runner 建好 docs 后通过 MCP 加。上线后再改站点信息、菜单、widget，走后台或 MCP。计划 2 Task 1 起，seed 还包含块类型、`pages.layout`、`posts`/`pages` 的 `search_text`、5 个 tag term 和 `settings.url`。注意 `applySeed` 只在 `includeContent` 为 true 时写 taxonomy terms（运行时首次启动用的是 `onConflict: "skip"`、不带 `includeContent`；setup 向导取决于是否勾选导入内容），所以 terms 由迁移 runner 的 `terms` 步骤从 seed 补建（计划 2 Task 1 实测）。
- **登录域名（2026-10-17 核实）**：没设 `siteUrl` 和 `EMDASH_SITE_URL`，passkey 的 rpId 就是请求的 hostname。setup 在 workers.dev 上做，passkey 只在 workers.dev 能用；切换后在后台用 Settings › General › Change domain 迁到 `www.web9.ai`。它的自动检查注定失败（Worker 请求自己的 Custom Domain 不会回到本 Worker），所以先从外部 curl `POST /_emdash/api/site/domain-proof` 确认，再点 **Use … anyway**。setup 之后不要再设 `EMDASH_SITE_URL`，否则已有的 passkey 都会失效。空库时第一个完成 setup 的人就是管理员，所以首次部署后 owner 要马上完成 setup。
- 备份：
  - **已定（owner，2026-10-17）**：`EMDASH_ENCRYPTION_KEY` 只存在 Cloudflare 的 Worker secret 里（首次部署时用 `--secrets-file` 上传，本地文件随后删除），不另做备份。它只用来加密插件 secret。丢了就生成新 key，再在后台重填插件 secret；今天还没有插件 secret。
  - 定时导出 D1，再定期通过 MCP `site_export` 做整站导出。
- 缓存：v1 不配置。`Astro.cache` 的 warning 是预期内的。上线后先测性能，再按 EmDash 文档加 object cache。
- 模板的 cron trigger（`* * * * *`，用于定时发布）每天约 1440 次调用，在免费额度之内。
- worker 体积（计划 2 Task 15，`wrangler deploy --dry-run`）：Total Upload 19190.21 KiB，gzip 5044.82 KiB。

## 10. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 自定义块里的文字不进搜索 | 搜索结果残缺 | §4 的 `search_text` hook |
| Markdown 字段不是所见即所得 | 后台编辑体验一般 | 已接受；AI 和开发者是主要作者 |
| EmDash 1.x 刚发布（1.1.0 在 10-01） | API 变动较快 | 锁定 minor 版本，升级前读 changelog |
| 预览环境和生产共用数据库 | 分支代码可能改到生产数据 | §9 staging environment |
| AI 直接发布的 Markdown / HTML | XSS、CSS 注入（全屏遮罩钓鱼、`url()` 追踪） | `sanitize-html` 白名单（已实现并测试）：<br>• 去掉事件属性和 `javascript:` 链接<br>• class 只允许白名单里的几个。用了 Tailwind 之后，这条白名单**不能放宽**：`<div class="fixed inset-0 z-50">` 只靠 class 就能做出全屏遮罩<br>• inline style 只允许排版类属性，不允许定位，也不允许 `url()`、`expression()` 和 CSS 转义<br>• **`htmlBlock` 不在这条白名单里，不是 class-safe**：core 的 sanitizer 保留 `class`/`id`/`data-*`，`ec:block` 解析器接受任意 `_type`，所以任何能写内容的人都能发布带 class 的 `htmlBlock`<br>• **三层控制（计划 2 落地，必须在创建 AI Editor 账号之前）**：① 写入时 `content:beforeSave` 里的 PT guard（拒绝 `htmlBlock`、`iframe`、带 `html` 的 `embed`、未知类型，以及 `cover.minHeight`、`image.dominantColor`、`columns[].width`、`button.style`、`code.language` 等会被 core renderer 原样拼进 `style`/`class` 的字段值）；② 渲染时 web9 的 `htmlBlock`/`embed` renderer 覆盖 core（`sanitizeHtmlFragment` 去掉 class/id/data-*/style；`isolated` 直接忽略，不交给 core 的 srcdoc iframe，因为它能在点击时导航顶层页面）；③ 构建后 `check-public-css`：公开页面加载的 CSS 里不能有 `fixed`、`inset-*`、`z-*`、`*-screen`、视口单位这类 utility（emdash 后台的样式表只在 `/_emdash/admin` 加载，按来源排除）<br>• `data-*` 必须去掉：Astro 的 scoped CSS 选择器是 `[data-astro-cid-*]`，`class` + `data-astro-cid-*` 能复用公开 CSS 里任何组件规则（例如 `.emdash-cover__background{position:absolute;inset:0}`）<br>• guard 的两处补充（计划 2 Task 3 评审）：`block.children` 只允许 `span`（其他类型会按顶层块同样的渲染器渲染，例如 `cover`、`iframe`）；块的 `style`、`listItem`、`marks`、`markDefs[]._type` 只允许 core 渲染的名字（astro-portabletext 用 `map[name] || map` 查组件，`constructor`、`call` 这类继承属性会让页面渲染抛错），`cover.content`、`columns[].content`、`blockquoteGroup.blocks` 里只允许块并同样检查；`image` 字段（`posts.featured_image`，含 `meta`、`darkVariant`）和 PT `image`、`gallery` 的 `dominantColor`、`blurhash` 也检查（颜色会拼进 `style`，解不出的 blurhash 会让页面 500；2026-10-17 起 guard 不解码，只做解码器抛错前的结构检查：首字符在 base83 字母表里，长度等于首字符给出的 `4 + 2 × numX × numY`，和"解码不抛错"完全等价，见 2026-10-17 spec §3.6）<br>• `pages.layout`（`blocks` 字段，计划 2 Task 11）：`hero.image` 和 `feature_grid.features[].image` 是 `<Image>`（`emdash/ui`）渲染的 `image` 值，和 `posts.featured_image` 同一个组件（`EmDashImage.astro`）：`dominantColor` 原样拼进 `style`（`background-color: ${dominantColor};`，第 201–209 行；实测 `red;position:fixed;inset:0;z-index:99999` 在首页上做出全屏遮罩），`blurhash` 进解码器（解不出就抛错），`darkVariant` 和 `meta` 里的同名字段是回退来源，`meta.storageKey` 不是字符串时在模板字符串里抛错（`media/url.ts`；页面在响应头发出后被截断）。core 对这些只要求字符串（`meta` 是自由 record），`normalizeBlocksData` 不管，所以 hook 里的 `guardBlockImages` 按 `BLOCK_IMAGE_FIELDS`（`index.test.mjs` 把它和 seed 的块类型对齐，seed 加了带图片的块类型就会失败）遍历 `layout`，对每个 `hero.image` 和 `features[].image` 跑和 `posts.featured_image` 同一套检查（`meta.storageKey` 必须是字符串，对 `featured_image` 同样生效）。hook 在 `normalizeBlocksData` 之前运行（`emdash-runtime.ts`），看到的是原始值，所以遍历对任何形状都不抛错，块类型用 `Object.hasOwn` 查，问题格式 `layout: #1 feature_grid features[1].image.dominantColor: value "…" is not allowed`。块的 `_type` 不需要 guard：core 用 Map 和 Set 查块类型，`constructor`、`__proto__`、`toString` 这类名字保存时就被拒绝（`block type "constructor" is unavailable`；`home-content.test.mjs` 固定这一点），所以 `<Blocks>` 的 `components[block._type]`（普通对象，会查到继承属性）碰不到它们<br>• widget 走 REST，不经过 hook：页脚和文章侧栏用 `SafeWidgetArea`（`@web9/blocks/astro`），渲染前检查每个 widget，任何一个不通过就整个 area 不渲染（检查本身 try/catch，出错也当作不安全）：**`content` widget 一律不渲染**，文字放进 doc 或 page（widget 里的 PT 在 core `<WidgetArea>` 内渲染，renderer 抛错在那里接不住，页脚又在每一页上，一个 widget 就能让全站报错；网站不用 content widget：seed 的页脚是空的，侧栏是 5 个 core 组件）；`component` 的 `componentId` 必须是 5 个 core id 之一，`componentProps` 的每个 key 都必须是该组件声明的 prop，并且符合声明的类型（未声明的 key 不通过：Astro 在组件运行前自己读 `server:component-directive` 这类 key）；`menu` 的 `menuName` 可以没有或为 null，有的话必须是字符串，它指向的菜单还要通过 `menuIsSafe`（2026-10-17：`SafeWidgetArea` 为此用 `getMenu` 读菜单；项数 ≤ 50，`label` ≤ 80，`url` ≤ 2048，`titleAttr` ≤ 200，读取出错也不通过，因为 core 的 `WidgetRenderer` 不截断这些字段）；未知 `type` 不通过；页脚在每一页上，所以凡是会放大输出的都有上限：`title`（任何 widget）和声明为字符串的 prop（`placeholder`）最多 200 字符，`menuName` 最多 100，一个 area 最多 20 个 widget，每个 `componentId` 最多出现一次，`menu` widget 最多 2 个；`core:recent-posts` 的 `count` ≤ 20，`core:tags` 的 `limit` ≤ 50，`core:archives` 的 `limit` ≤ 24（都是 ≥ 1 的整数）；`core:recent-posts` 不接受 `urlTemplate`（网站用 RecentPosts 默认的 `/posts/${post.id}`，RecentPosts.astro:53-63；模板对每篇文章展开 `:slug`/`:path`，插入的 slug 里的 `:path` 还会再展开，输出按平方增长）<br>• guard 的输出有上限（50 条加一条“…and more”）；规模上限：每个 span 最多 20 个 mark（renderer 每个 mark 嵌套一层组件，3000 个就栈溢出），每个块最多 1000 个 children（mark 排序是 O(n²)，2 万个 span 要 12 秒 CPU），`_key` 有的话必须是字符串（core 把它拼进模板字符串，例如 `${_key}-group`）；guard 在原始请求数据上运行，所以永远只返回问题、不抛错：消息里的值用 `show()` 打印（`JSON.stringify` 在嵌套几千层的值上栈溢出，所以先 try/catch，失败就打印 `[unprintable array]`，字符串先截断再序列化），`search_text` 的文字提取用显式栈而不是递归；表格单元格也检查（2026-10-17）：`rows` 和 `cells` 必须是对象数组，单元格里只能是 span，单个 span 的上限同上，每张表最多 500 行、写下来的单元格最多 2000 个；guard 还跑 core 自己的 `normalizePortableTextTable`（`Table.astro` 用的同一个模块，是 emdash 的传递依赖），core 排不出来的表被拒（单元格里的 mark 名字和 markDefs 也在这里检查），它铺出来的网格（宽 × 高，colspan、rowspan 最多各按 100 算）同样最多 2000 个"单元格"，所以这里的"单元格"指网格格子；表格、row、cell 的 `_key` 不能重复（core 的去重是平方级），表格、row、cell，以及表格和单元格的 markDef，每条记录最多 16 个字段。整个值最多 2000 个顶层节点、20000 个 span、5000 个 mark，另有四项总量：表格网格格子 20000（每张表按网格格子数和原始行数中大的那个计）、markDefs 5000（渲染成本是 mark 数 × markDefs 数；每个 block、表格、单元格另限 100 个）、换行（每个 span 1000 个、整个值 5000 个；toolkit 按换行切 span，是平方级）、图片 500（`image` 块算 1 张，`gallery` 每张图算 1 张；渲染时每张都要解码 blurhash）；`buttons`、`tabs`、`tool_grid` 的列表必须是对象数组（最多 10、20、100 项），文字字段必须是字符串，`buttons: null` 被拒，`tabs.default_tab` 有的话必须是 1 到 tab 数之间的整数（Tabs 渲染时遇到别的值按 1）；`sanitizeHref` 会对非字符串抛错，所以链接 `href`、`url`、`logo` 必须是字符串；renderer 打印的每个块文本字段（core 和 web9 的，含 `block.textAlign`，以及 `pages.layout` 里 hero、feature_grid 的文字和图片 alt）存在时必须是字符串（Astro 转义和 `renderMarkdown` 调 `String()`，`{"toString":1}` 会抛错、整页 500；PR 评审修复轮，字段和打印位置的清单见 2026-10-17 spec §3.6），Markdown 字段限长（body 25000、callout title / details summary / tool tagline 300），整个值的 Markdown 合计 52000，`code` 和 `mermaid` 20000，`pages.layout` 的文字按 title 200、tagline / description / alt 1000、按钮文字 80、链接 2048 限长；web9 的 renderer（Callout、Details、Tabs、ToolGrid、Mermaid、首页 Hero 和 FeatureGrid）把不是字符串的文本当空字符串。这些上限只限大小，marked 在密集分隔符上的超线性 CPU 仍是残留（2026-10-17 spec §5）<br>• 有序列表续号（计划 2 Task 7）：块的 `listId` 有的话必须是不超过 128 字符的字符串（和 emdash 的 `normalizeListId` 一致，更长的 emdash 会当作没有 `listId`），`listStart` 有的话必须是 1–100000 的整数（`OrderedList.astro` 输出成 `<ol start>`）；emdash 只把 `listId` 当 Map key 和 JSON 字符串用（`portable-text-lists.ts`），不查普通对象，所以 `__proto__` 这类名字无害 |
| 用请求的 Host 头拼绝对 URL（模板代码） | RSS / OG 链接被投毒 | `astro.config` 固定 `site: "https://www.web9.ai"`；`rss.xml.ts`、`posts/[slug]`、`pages/[slug]` 改为用 `site`（已修） |

**`check-public-css` 已接受的残余（计划 2 Task 5）**

- EmDash 工具栏的 `<style>`（`.emdash-img-popover-backdrop`，带 `position:fixed`）只由 middleware 注入给已登录的编辑者，检查不扫描它。它的 class 进不了内容：内容 HTML 不带 class。
- 不扫描：`is:inline` 样式、CDN 样式表、JS 注入的 CSS（TipTap、mermaid）。sticky 定位、`scale-*`、`position:var(...)` 不在威胁清单里。
- 计划 3 的 Workers Builds 构建命令必须是 `npm run build`：`npx astro build` 不会跑 `postbuild`，检查就被跳过了。

## 11. 样式（2026-10-15 新增：owner 要求用 Tailwind）

- **已定**：Tailwind CSS 4.3.3，通过 `@tailwindcss/vite` 接入；Markdown 和 Portable Text 正文用 `@tailwindcss/typography` 0.5.20 的 `prose`。入口文件是 `src/styles/global.css`，由 `Base.astro` 第一个 import。
- **颜色沿用模板的 token**（`--color-bg`、`--color-text`、`--color-surface`、`--color-border`、`--color-brand` 等），名字不变，挪进 `@theme static`，生成 `bg-surface`、`text-muted`、`border-border` 这类 utility：
  - **已定（owner，2026-10-15，方案 B）**：token 用显式值，浅色在 `@theme static`，深色在 `:root.dark` 和 `@media (prefers-color-scheme: dark) { :root:not(.light) }`（不分层，所以覆盖 Tailwind 的 `@layer theme`）。不用 `light-dark()`：生产构建的 Lightning CSS 会把它降级成 `--lightningcss-light/-dark`，手动切换失效（计划 1 实测）。验收：公开 CSS 里没有 `var(--lightningcss-light` / `var(--lightningcss-dark` 的使用（计划 2 Task 5 的检查脚本强制；Lightning CSS 会在每个 `color-scheme` 声明旁边自动加 `--lightningcss-light: ;` 这类定义，这些定义无害，不算）。
  - **不用 `dark:` variant**，因为它只认系统偏好，和模板的手动切换会不一致；
  - 用 `static` 是因为模板里不经过 Tailwind 的 CSS 也在读这些变量。Tailwind 默认只输出用到的变量，不加 `static` 它们会消失。
  - `prose` 的配色同样通过 `--tw-prose-*` 变量指向这些 token，因此也不需要 `prose-invert`。
- **内容 HTML 不带 utility class**（安全规则，见 §10）。`renderMarkdown()` 输出的 HTML 只能靠两种方式加样式：外层容器上的 `prose`，以及 `packages/web9-blocks/astro/blocks.css` 里针对 `.callout`、`pre.mermaid` 这类白名单 class 写的选择器。块组件自己的 markup（Tabs、ToolGrid 等）是代码，可以直接写 utility。
- `blocks.css` 里的规则放在 **`@layer utilities`**，不放 `components`。已实测：`@tailwindcss/typography` 把 `.prose` 放在 utilities layer，而 layer 的优先级高于选择器权重，放在 components layer 的规则会被 `prose` 的段落边距覆盖。
- `blocks.css` 里用了 `@apply`，所以必须由 `global.css` 用 `@import "@web9/blocks/styles.css"` 引入，块组件里不再各自 import CSS。
- 扫描范围：`@import "tailwindcss" source(none)`，再用 `@source` 只扫 `src/` 和 `packages/web9-blocks/astro`。测试文件、`docs/`、`legacy/`、`scripts/`、`seed/`、`public/` 和内容都不扫：否则它们里面的单词（包括 sanitizer 测试里的 `fixed inset-0 z-50 bg-black`）会生成真实的 utility（已实测，见 §10）。
- 分期（2026-10-15 修订）：计划 1 把 docs 页面和 web9 块改成 Tailwind；计划 2 只重写 `Base.astro`（页头、页脚、主题），`posts/[slug]` 只给正文容器加 `prose`；blog 列表和文章页的整体重写留给以后的样式计划，在此之前模板 blog 页面可能有 preflight 带来的细小样式差异。

## 12. 未决事项（计划 2 结束时已知，计划 3 的输入）

- **AI PAT 之前**（2026-10-17 全部完成，见 `docs/superpowers/specs/2026-10-17-ai-pat-preconditions-design.md`）：计划 2 落地的只是 `content:beforeSave` 里的写入 guard（§10）。发放 AI Editor 账号的 token（计划 3 路线图第 6 步）之前，以下每一项都要先做到：
  - 长度上限：post 和 doc 的 slug、title，term 的 label，menu 的 label，在 REST/MCP 层或 core 里加上限（`beforeSave` 拿不到 slug，修不了）。例：Editor 写一个 5 MB 的菜单 label（core `api/schemas/menus.ts` 只有 `min(1)`），`Base.astro` 在每个页面打印它两次；doc title 同理出现在每个 doc 页的侧栏（计划 2 Task 3 N3(b)）。**已做**：guard 管 title、description、excerpt 和 docs 的 `category`（侧栏分组名，渲染时也截到 80）；`src/middleware.ts` 的写入闸门管 slug、`seo.image`、`seo.canonical`、byline 的 `roleLabel`、菜单项（`label`、`customUrl`、`titleAttr`、`target`）、term、byline（`displayName`、`slug`、`avatarMediaId`，含 REST `admin/bylines`），闸门按 `context.routePattern` 判定，不看 URL；菜单渲染只取前 50 项，label 截到 80，widget area（footer、文章侧栏）里的菜单 widget 由 `SafeWidgetArea` 在渲染前检查，不通过就整个 area 不渲染。
  - publish、schedule、duplicate、trash restore、`revision_restore` 都不重新跑 guard。今天库里的值都过了 guard；以后收紧规则时，要先重新扫描已存的内容和所有 revision。skill 的撤销流程因此用 `content_update` 写回旧 `body`，不用 `revision_restore`。**已做**：发布、定时发布前的 hook 重跑 guard 并检查 slug，fail closed；`scripts/guard-scan.mjs` 扫描所有条目、回收站、revision、菜单、term、byline、widget area（widget area 经 REST 读；trash restore 仍不经过 hook，由这个扫描覆盖；回收站条目的 `seo.image`、`seo.canonical`、`roleLabel` 除外，扫描读不到它们，见 2026-10-17 spec §3.2）。汇总单独写出 revision 里的问题数：编辑修不了它们，core 每个条目只留最新 50 个 revision。skill 的撤销流程仍然用 `content_update`。
  - `PT_FIELDS`、`IMAGE_FIELDS`、`BLOCK_IMAGE_FIELDS`（`packages/web9-blocks/lib/entry-guard.mjs`）钉在 seed 上，不读线上 schema：Admin 新加的 portableText、image 字段或 collection 不受 guard 保护，加字段时要同步改这三张表。**已做**：hook 读线上 schema（`schema:read`），和钉死的表取并集；`migrate verify` 报告 schema 漂移。
  - `sections` 只要 `content:write` 就能写（core `astro/middleware/auth.ts` 的 SCOPE_RULES），没有 guard；只要没有页面渲染它就是安全的，所以给它加 guard 之前，任何页面都不能渲染 `sections`。**已做**：`render-sinks.test.mjs` 锁定 `src/` 和 `packages/` 不调用 `getSection`/`getSections`。
  - `site_import_*`（site transfer import）和 WordPress import 不经过 `content:beforeSave`；它们要 `transfer:import`、`import:execute`（Admin），transfer 还要管理员批准。所以 AI 的 token 永远不能有 transfer 或 import scope，管理员也不能批准它发起的 transfer 请求。**已做**：AI 用 Editor 账号的 device flow token，没有 transfer、admin、import 权限（§8 runbook）。
  - 媒体一直经 `/_emdash/api/media/file/...` 提供（`sandbox` CSP、`nosniff`、SVG 和 PDF 作为附件），不改成公开的 R2 域名：那样上传的 SVG 会不带这些头直接内联渲染。**已做**：`render-sinks.test.mjs` 锁定 `astro.config.mjs` 和 `wrangler.jsonc` 里没有 `publicUrl`。
  - 计划 2 文末"未决事项"里标了 **AI PAT 之前修** 的三项：单页 CPU、表格单元格不受 guard 约束、块形状错误导致本页 500。**已做**：guard 现在限制 body 总量（span 20000、mark 5000、表格网格格子 20000、markDefs 5000、换行 5000、图片 500）和每个 block、表格、单元格的 markDefs（100）、检查表格单元格（形状、`_key` 不重复、每条表格记录（表格、row、cell，含表格和单元格的 markDef）最多 16 个字段，并跑 core 的表格 normalizer）和块结构（含 `tabs.default_tab`）；blurhash 改为结构检查，不再解码；Tabs、ToolGrid 遇到异常结构不再抛错。PR 评审修复轮又加了：renderer 打印的块文本字段（含 `block.textAlign`、`pages.layout` 的文字）必须是字符串，Markdown 和代码限长（25000、300、20000），整个值的 Markdown 合计 52000，`pages.layout` 的文字限长；web9 的 renderer 把非字符串当空字符串；读线上 schema 限时 1500 ms。PR 评审 I2 又加了 Markdown 字段的分隔符密度上限：marked 的渲染成本在密集的 link opener 上是三次方（opener 数 × destination 里的 `(` 数 × 长度），在 `*`、`_`、`~`、`` ` ``、`!`、`<`、`\` 上是平方，list 的 lazy 行是换行数 × 后面的长度，一行几千个 list/quote marker 会让渲染栈溢出，裸链接末尾每个被 backpedal 去掉的标点或 entity 都让整段重扫一遍，所以每个字段和每个值都限这些量（换行按换行数 × 字段长度限，裸链接末尾的步数和一段里的链接开头数按字段限，2026-10-17 spec §3.6）；admonition 扩展改成只在 block 开头试、找 closer 时遇到下一个 opener 就停，不再是平方；`renderMarkdown`、`renderInlineMarkdown` 抛错时渲染成空字符串。仍然残留的：fuzz 没覆盖到的 pattern、线性但重的内容（宽表格、大量要转义的字符）、workerd 的栈没量过、REST 逐项加菜单项时闸门数不了项数，见 2026-10-17 spec §5。
- `DocsPage.astro` 的侧栏每个语言只取 `limit: 500` 篇 doc，没有 `orderBy`：超过 500 篇时侧栏会静默少掉条目；而且每个 doc 页都打印全部 doc 的 title（title 已限 200 字符，见上面第 1 项）。
- 路径里有残缺的百分号编码（`/docs/%E0%A4%A`、`/%E0%A4%A`）时返回 500。这是 core 的既有行为，响应不带 `Cache-Control`、不进共享缓存；生产上再确认一次。
- `npm audit` 有两项：katex（经 mermaid）、postcss-selector-parser（经 `@tailwindcss/typography`）；两项的修复都是 breaking，计划 3 评估后再升级。
- CI job 已改名为 "Tests and build"（原来是 "Unit tests"）：如果 `main` 的 branch protection 规则要求 "Unit tests" 这个 check，会挡住所有 PR；计划 3 配置 GitHub 时要改成新名字。**已核实（2026-10-17）**：`main` 的 branch protection 没有 required status check，不阻塞。
- 生产第一次运行迁移 runner：先 `node scripts/migrate.mjs all --dry-run`，再 `node scripts/migrate.mjs menu --overwrite`（seed 里的菜单与目标不同，§7），然后 `node scripts/migrate.mjs all`；再跑一次 `all` 确认全是 `unchanged`，最后 `verify`。
- 浏览器验收（计划 2 Task 15 Step 5）2026-10-16 补做完毕，结果通过。通过 CDP :9222 借用一个已有标签页逐页检查，做完导航回原页面。
  - 首页：浅色、深色、跟随系统三种主题都检查了，切换主题后 `<html>` 的 class 和颜色都跟着变；`/zh-CN/` 也检查了。
  - Docs 页面：`/docs/intro` 侧栏 7 组；`tools-summary` 8 组卡片、27 个 logo 都是 100×100；`learn_ai_coding` 的 details、Tabs 展平、有序列表续号和 Mermaid 都正常；`guide` 的 5 个 `youtube-nocookie` 嵌入都能加载，行内 code 没有反引号；深色主题下抽查了 `/docs/ai-tools-adhoc` 的 Mermaid 图，文字清楚；`/zh-CN/docs/lambda` 显示 fallback 提示条，canonical 指向 en。
  - 其他页面：`/posts/ai-tools-adhoc` 正常；`/search?q=Coze` 有结果；嵌套标题字号不再叠加（4 层都是 36px）。
  - 后台：Docs 列表有 en 26 篇、zh-CN 9 篇；`tool_grid` 编辑窗口能打开，只看了，点了 Cancel，没有保存。
  - 除浏览器插件自己的警告外，站点没有控制台错误。
  - 发现 3 个外观问题，记在计划 2 的"未决事项"里。
- 开发环境（dev）的一条 warning：`[astro-portabletext] Cache missed for unknown component on node type "@span"`。原因是 emdash core 的 `Table.astro`（`emdash/src/components/Table.astro`）里嵌套的 `<PortableText>` 覆盖了 astro-portabletext 的全局 context，表格之后的默认 `Mark.astro`（strong/em/code）就会走 `getUnknownComponent`。只在 dev 出现（受 `import.meta.env.DEV` 控制），生产不会出现；没有内容丢失（表格 105 个单元格与旧站一致，链接、粗体、标题、callout 都在）。`lambda` 是目前唯一有表格后接粗体、斜体或行内代码的 doc。
- 其余已知问题（深色主题下的深色 logo、标题没有 `id`、热链图片、`tool_grid` 宽 logo 等）记在计划 2 文末的"未决事项"里（`docs/superpowers/plans/2026-10-15-emdash-plan2-migration-local.md`）。
