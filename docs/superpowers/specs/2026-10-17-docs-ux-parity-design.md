# 文档站 UX 对齐旧站（设计）

- 状态：owner 于 2026-10-17 批准（"行为对齐，视觉沿用新站"；"只做渲染层"；代码高亮用方案 A）。
- 上级 spec：`docs/superpowers/specs/2026-10-15-emdash-migration-design.md`（§10 安全模型、§11 样式规则）。
- 对照：旧站是 `gh-pages` 上的 Docusaurus 构建产物（`git archive origin/gh-pages` 解到本地，`python3 -m http.server` 打开 `.html`）；新站是 `https://www.web9.ai`。2026-10-17 用 CDP 在 1440 px 和 390 px 下逐页对照过 `/docs/learn_ai_coding`、`/docs/ai-tools-adhoc`。

## 1. 背景：差异清单

按影响从大到小：

1. **手机**：新站把整个 sidebar（AI 和 Dev 共 40 多项）平铺在正文前面，要滚很久才看到正文。旧站是汉堡菜单加抽屉，正文紧接在 header 后面。
2. **Sidebar**：
   - 旧站只显示当前 section（AI 或 Dev）；分类可以折叠，当前页所在的分类展开，其余收起并带箭头；当前页有底色并用主色。
   - 新站平铺 AI 和 Dev 的全部条目，分类不能折叠，当前页只加粗。
   - bug：header 是 sticky 的半透明层（`z-index: 100`，65% 背景），sidebar 的 sticky `top` 只有 1rem，滚动后 sidebar 顶部从 header 下面透出来。
3. **顶部导航**：
   - 旧站：logo 图标加 "Web9.AI"，AI / Dev / Blog 紧跟在左边，当前 section 高亮；右边是语言下拉、GitHub（外链图标）、主题切换。
   - 新站：只有文字 logo，链接在右边且没有高亮；语言链接在正文标题上方，主题切换在页脚。新站多了搜索框（保留）。
4. **页内导航**：旧站有面包屑、右侧 "On this page" 目录（滚动时高亮当前节）、标题锚点；新站都没有。标题没有 `id`，旧链接里的 `#what-is-not`、`#programming-code` 跳不过去（计划 2"未决事项"里已记）。
5. **内容**：代码没有语法高亮；正文上方多了一段 description 引言。（details 里的单个 tab 只剩代码块、标题用 title 字段而不是正文 H1，这两项是内容层，本次不做，见 §6。）
6. **视觉**：旧站主色绿色、行内代码带圆角框；新站蓝 / 黑。独立的 tabs 块已经基本一致（只差颜色和边框）。视觉按新站，不改。

## 2. 决定

- 目标是**行为对齐旧站，视觉沿用新站**：颜色、字体、间距用新站的 token，交互和信息结构照旧站。
- **只改渲染层，不改内容**：数据库里的 doc 一条都不动，不跑 `migrate --overwrite`。
- 代码高亮用**客户端 Prism**（方案 A）：只在有代码块的页面按需加载。理由：没有页面缓存，服务端高亮（方案 B，Shiki）每个请求都要付 CPU，代码多的页面可能多出几十 ms，还会让 worker 大几百 KB；Prism 和旧站是同一类高亮器，配色接近。不开 JS 时代码照常显示，只是没有颜色。

## 3. 设计

### 3.1 Header（所有页面，`src/layouts/Base.astro`）

- 左边：logo 图标加站名，再接菜单里的站内链接（AI、Dev、Blog）。
  - 图标是从 `public/img/web9.png` 裁出来的 64 px PNG（新文件 `public/img/logo-64.png`，约 5 KB，显示 32 px）。旧站用的 `logo.svg` 有 277 KB，不用。
  - 当前 section 的链接高亮（主色加 `aria-current="page"`）。判定是纯函数 `activeMenuHref`（`packages/web9-site/lib/nav.mjs`）：
    - doc 页：菜单项的 URL 是 `/docs/<slug>`（可带 `/zh-CN` 前缀），并且这个 slug 的 doc 和当前 doc 在同一个 section。DocsPage 把 `section` 和 `slug → section` 的表传给 Base；
    - `/posts`、`/posts/*`、`/tag/*`、`/category/*`：URL 是 `/posts` 的菜单项；
    - 其他页面：路径完全相同的菜单项；
    - 都不匹配就不高亮。
- 右边：搜索框（保留现有 `LiveSearch`）、语言下拉、外链菜单项、主题切换。
  - 外链菜单项（URL 以 `http://` 或 `https://` 开头）放右边并带外链图标，站内链接放左边。拆分是纯函数 `splitMenu`。菜单本身仍由内容管理（`primary` 菜单），代码不写死 GitHub。
  - 语言下拉用 `<details>`/`<summary>`，不需要 JS。doc 页由 DocsPage 传入每种语言的链接（现有的 `languages` 计算，改成 prop）；其他页面链接到各语言的首页。
  - 主题切换：一个按钮，按 浅色 → 深色 → 跟随系统 循环，图标显示当前状态，`aria-label` 写出当前和下一个状态。沿用现有的 cookie 逻辑和 head 里的首屏脚本，页脚那组三个按钮删掉。
- 容器宽度从 1200 px 改成 1400 px，和 docs 页对齐。

### 3.2 Docs 页（`src/components/DocsPage.astro`）

- **Sidebar**（≥ 1024 px）：
  - 只显示当前 doc 所在 section 的条目。纯函数 `docsSidebar(groups, section, currentSlug)` 返回 `{ rootItems, categories: [{ label, open, items }] }`：section 根下的 doc（category `general`）在最前面，后面每个分类一组，顺序沿用 `groupDocs` 的 `sort_order`。
  - 分类用 `<details>`，只有包含当前页的那个带 `open`，`<summary>` 右边是箭头（展开时旋转）。不需要 JS。
  - 当前页：底色（`bg-surface`）加主色，`aria-current="page"`。
  - sticky，`top` 等于 header 高度（4rem），`max-height: calc(100dvh - 4rem)`，自己滚动。高度写在 scoped CSS 里（`check-public-css` 只拦 viewport 单位的 utility 类名，不拦声明；见 §4）。这一条修掉 header 透出 sidebar 的 bug。
  - 抽成组件 `src/components/DocsSidebar.astro`，桌面 sidebar 和手机抽屉（§3.3）各渲染一次。
- **面包屑**：首页图标 › section 名 › 分类名（`general` 不显示）› 当前页标题。section 和分类是纯文本（旧站也不能点），首页图标链到当前语言的首页。`<nav aria-label="Breadcrumbs">` 加 `<ol>`。纯函数 `breadcrumbs(doc, locale)`。
- **标题锚点**：
  - 给 `PortableText` 传 `components={{ block: Heading }}`：一个组件接管所有 block 样式。h2–h6 渲染成 core 的 `Block`（`emdash/ui` 导出）加上 `id`（core `Block` 把多余的 prop 展开到元素上，所以保留了它的 text-align class），标题后面跟一个悬停才显示的 `<a href="#id" aria-label="Direct link to …">#</a>`；其他样式原样交给 core `Block`。不能传 `block: { h2, … }` 这样的对象：emdash 的 `block` 是单个组件，`mergeComponents` 遇到组件就整个替换，段落会落到 `UnknownBlock`（2026-10-17 写计划时核对 `astro-portabletext` 0.11.4 发现，修订本节）。
  - id 在 DocsPage 里一次算好：纯函数 `headingAnchors(body, legacyIds)` 按文档顺序遍历顶层 `_type: "block"`、`style` 为 h2–h6 的块，标题文字是 children 里 span 文字的拼接。id 的来源依次是：
    1. 旧站自定义 id 表（下面），命中就用；
    2. `github-slugger`（Docusaurus 用的同一个库）对标题文字生成，按页去重（同名标题得到 `-1`、`-2` 后缀）。
  - `Heading.astro` 按块的 `_key` 查 id，id 表由 DocsPage 放在 `Astro.locals.headingIds`（按请求隔离；`PortableText` 只给块组件传 `node`）。不能把 id 写进一个新的 `value` 数组：`PortableText` 靠 `value` 上不可枚举的 edit meta 判断编辑模式，换成新数组会让 owner 的行内编辑失效。没有 `_key` 的块（只可能来自没按 skill 写的 MCP 内容）退回到不去重的 slug，也不用旧 id 表。编辑模式下 `PortableText` 渲染行内编辑器，标题没有 id，这是预期的。
  - **旧站自定义 id 表**：旧站 5 个文件里有 22 个 `{#id}`，站内有 8 处链接用了其中 3 个（`#what-is-not`、`#programming-code`、`#function`）。转换器把 `{#id}` 去掉了（`scripts/lib/mdx-to-pt.mjs:212`），所以从标题文字推不回来。做法：一个生成脚本用迁移同一套转换（`docPayloads(readLegacyTree())`，就是数据库里的 body）处理带 `{#id}` 的文件，按文字把每个源标题（去掉 `{#id}` 和行内的反引号、加粗、链接语法）对到级别相同、文字相同的那一个 heading 块，对不上或对上不止一个就报错（不按"第 k 个"对：H1 被转换器用作标题，`<details>` 里的标题变成块里的 Markdown），写成 `packages/web9-site/lib/legacy-anchors.json`（`{ "<locale>/<slug>": { "<标题文字>": "<id>" } }`），提交进仓库。测试在 `legacy/` 还在时重新生成并比对（和 `docs-nav.test.mjs` 同样的做法），`legacy/` 删掉后跳过。
- **目录（On this page）**：
  - 数据来自 `headingAnchors` 里 h2、h3 的条目（Docusaurus 默认的范围），纯函数 `tocEntries`。少于 2 条就不显示。
  - ≥ 1280 px：右侧一列（约 220 px），sticky，`max-height: calc(100dvh - 5rem)`，自己滚动。一个小脚本用 `IntersectionObserver` 给当前节的链接设 `aria-current="true"`，样式随之高亮。
  - < 1280 px：正文顶部一个 `<details>`，`<summary>` 是 "On this page"（zh-CN："本页目录"），默认收起。
- **去掉 description 引言**：正文上方不再显示 `doc.data.description`，它仍然在 `<meta name="description">` 里。语言链接移到 header 的下拉里，正文上方也不再显示。
- 布局：容器 1400 px，`grid-cols-[240px_minmax(0,1fr)]`，≥ 1280 px 时加第三列 `220px`。正文列约 850 px，和现在（约 888 px）接近，图片宽度上限（spec §9"图片"，1600 px）不用改。

### 3.3 手机和窄屏（< 1024 px）

- header 只有 ☰、logo 和站名；搜索框和菜单都进抽屉。
- ☰ 打开一个原生 `<dialog>`（`showModal()`），从左边滑出，宽 `min(20rem, 85vw)`，高 `100dvh`：
  - 内容依次是：搜索框、菜单链接（当前项高亮）、语言、主题切换；doc 页再加当前 section 的 `DocsSidebar`。
  - 浏览器把模态 `<dialog>` 放进 top layer，所以不需要作者写 `position: fixed` 或 `z-index`（`check-public-css` 对任何 `position: fixed` 声明都报错，§4）。背景遮罩用 `::backdrop`。
  - Esc 关闭（原生行为）；点遮罩关闭（脚本判断点击落在 dialog 盒子外面）；点抽屉里的链接后正常跳转。打开时焦点在关闭按钮上，焦点被困在 dialog 里，背景 inert（都是原生行为）。关闭后焦点回到 ☰。
  - ☰ 带 `aria-label="Menu"`、`aria-haspopup="dialog"`、`aria-expanded`。
- 正文紧接在 header（和面包屑）后面。

### 3.4 代码高亮（客户端 Prism）

- 依赖 `prismjs`（钉住版本）。只打包用到的语言：python、bash、yaml、typescript、javascript、json、kotlin、java、csharp、swift、markdown（旧站代码块用到的语言，加 javascript、json）。未知语言不处理。
- 一个客户端模块 `packages/web9-blocks/astro/prism-client.mjs`（和 `mermaid-client.mjs` 并列）。DocsPage 和 posts 页的脚本只在页面里有 `pre code[class*="language-"]` 时才 `import()` 它，所以没有代码的页面不下载。设 `window.Prism = { manual: true }`，然后对正文容器调用 `highlightAllUnder`。
- 范围：core `code` 块（`<pre><code class="language-x">`），以及 callout、tabs、details 正文 Markdown 里的代码块（`markdown.mjs` 保留 `language-*` class）。
- 配色（2026-10-17 写计划时修订）：emdash 的 core `code` 块在两种主题下都是深色底（`Code.astro` 写死 `#1e1e1e` / `#e0e0e0`），而 callout、tabs、details 里 Markdown 的代码块用 `prose` 的 `--color-surface` 底，浅色主题下是浅色。一套配色不能在两种底色上都可读。决定：Markdown 的代码块也改成同样的深色底（`.prose pre:not(.mermaid)`，写在 `blocks.css`），整站只用一套深色 Prism 配色（VS Code Dark+ 的颜色），token 类（`pre .token.keyword` 等）写在 `packages/web9-blocks/astro/blocks.css`。这样占绝大多数的 core 代码块外观不变（视觉沿用新站），只有少量 Markdown 代码块在浅色主题下从浅底变成深底。配色不随主题变，所以不新增 `--color-*` token，`theme.test.mjs` 不受影响；仍然不用 `dark:` 也不用 `light-dark()`。
- 安全：Prism 读 `textContent`，输出转义后的 token span；它加的 class 只存在于运行时的 DOM，不进存储的内容。内容 HTML 里的 class 仍由 sanitizer 白名单控制，内容不能自己写 `token` 类（白名单不放宽）。

## 4. 约束（来自上级 spec 和 CLAUDE.md）

- `check-public-css`（`scripts/lib/public-css.mjs`）：公开 CSS 里任何 `position: fixed` 声明都失败；类名不能是 `fixed`、`inset-*`、`z-*`、`*-screen`、viewport 单位的 utility。所以：
  - 抽屉用模态 `<dialog>` 的 top layer，不写 `position: fixed`；
  - 需要 viewport 单位的高度写在组件的 scoped `<style>` 里，不用 Tailwind 的 `h-screen`、`h-[100dvh]`；
  - 不新增 `z-index` 类。header 现有的 `z-index: 100` 在 scoped CSS 里，不变。
- Tailwind 只扫 `src/` 和 `packages/web9-blocks/astro`；颜色只用模板 token；不用 `dark:` 变体和 `light-dark()`。
- 内容 HTML 不带 class；sanitizer 的 class / style 白名单不放宽。
- `render-sinks.test.mjs` 钉住每个 `set:html`：图标 SVG 的 `set:html` 移动或新增时，同步更新这个测试。
- widget area 只走 `SafeWidgetArea`（页脚保留）。
- 菜单项、标题文字都是 agent 可写的内容：渲染时照旧 `clampText`，`aria-label` 里的标题文字由 Astro 转义。

## 5. 测试和验收

- 单元测试（vitest）：
  - `splitMenu`、`activeMenuHref`：doc 页按 section、posts 类页面、精确匹配、不匹配、zh-CN 前缀；
  - `docsSidebar`：只返回当前 section，根条目在前，只有当前分类 `open`，顺序沿用 `sort_order`；zh-CN 的分类名；
  - `breadcrumbs`：有分类、`general`、zh-CN；
  - `headingAnchors`：slug 和 Docusaurus 一致（中文、标点、行内代码；期望值取自旧站页面）、同名去重、旧 id 表优先、没有 `_key` 的块；`tocEntries` 只取 h2、h3。2026-10-17 写计划时把全部 35 篇 doc 转换后的标题 id 和旧站页面逐个比对过，完全一致；
  - `legacy-anchors.json`：`legacy/` 在时重新生成并比对，并确认 `#what-is-not`、`#programming-code` 在表里。
- `npm test`、`npm run build`（含 `check-public-css`）、`npm run typecheck` 通过。
- 浏览器（CDP，本地 dev，合并前）：
  - 1440 px：`/docs/learn_ai_coding`、`/docs/ai-tools-adhoc`、`/zh-CN/docs/…` 一篇、`/posts` 一篇、首页：sidebar 只有当前 section，当前分类展开，header 高亮正确，面包屑、目录和滚动高亮正常，滚动后 header 不再盖住 sidebar；`/docs/learn_ai_coding#what-is-not` 直接定位；
  - 1024 px 和 390 px：☰ 打开抽屉，Esc 和点遮罩都能关，Tab 不跑出抽屉，关闭后焦点回到 ☰；正文紧接在 header 后面；
  - 深色和浅色主题下代码高亮可读，主题按钮按三态循环，刷新后保持；
  - 控制台没有报错。
- 上线后：`check-page.mjs` 对几页查标记（`id="what-is-not"`、`aria-label="Breadcrumbs"`、`On this page`），`verify` 仍是 54/54、86/86。

## 6. 不在范围内

- 内容层的改动：恢复 details 里的 tabs、用正文 H1 当页面标题（owner 2026-10-17 选择不动内容）。
- 收起整个 sidebar 的按钮（旧站左下角的 «）：用处小。
- 视觉上照搬旧站：绿色主色、行内代码样式、引用块样式。
- 服务端代码高亮（方案 B）。
- 博客页的 sidebar、目录（本次只改 header；posts 页只加代码高亮）。
