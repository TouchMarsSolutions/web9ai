# EmDash 迁移 · 计划 2：安全关口 + 本地完整迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 代码全部完成，并且在本地 workerd dev 里把旧站全部内容迁完：26 篇 en doc、9 篇 zh-CN 翻译、2 篇 blog、首页、菜单、旧 URL 重定向，全部能通过 `check-page`；内容安全关口（PT guard、`htmlBlock`/`embed` renderer 覆盖、`SAFE_VALUE` 收紧、公开 CSS 检查）全部落地。部署和切换是计划 3。

**Architecture:**
- **安全分三层**：写入时 `content:beforeSave` hook 里的 PT guard 拒绝危险的块和字段值（MCP、后台、API 的写入都经过 hook）；渲染时 web9 自己的 `htmlBlock`/`embed` renderer 覆盖 core；构建后 `check-public-css` 扫描公开页面加载的 CSS，防止 Tailwind 生成能做遮罩的 utility。
- **迁移 runner** `scripts/migrate.mjs` 只走 MCP（加上一个 admin 才能调用的 REST：redirects）。纯逻辑都在 `scripts/lib/` 里，用 vitest 测；runner 本身可以重复运行，第二次运行应当 0 写入。
- **legacy 清单**（`scripts/lib/legacy-tree.mjs`）按 Docusaurus 3.7 的规则推导 section、category、`sort_order`、旧 URL 和新 slug，converter 不再看路径以外的默认值。
- **主题改成显式 token**（方案 B）：浅色值放在 `@theme static`，深色值放在 `:root.dark` 和 `@media (prefers-color-scheme: dark) { :root:not(.light) }`，全仓库不再用 `light-dark()`。
- 首页 `/`、`/zh-CN/` 读 `pages/home` 的 `layout`（`blocks` 字段），块类型 `hero`、`feature_grid` 由 seed 定义。

**Tech Stack:** EmDash 1.3 · Astro 7 · `@astrojs/cloudflare` 14（dev 跑在 workerd）· Tailwind CSS 4.3.3 + `@tailwindcss/typography` · marked + sanitize-html · postcss（CSS 检查）· vitest 5

**Spec:** `docs/superpowers/specs/2026-10-15-emdash-migration-design.md`（执行前通读 §2、§3、§4、§7、§8、§10、§11）。计划 1：`docs/superpowers/plans/2026-10-15-emdash-plan1-foundation-gate.md`（"计划 2 路线图"和"计划 1 遗留"两节是本计划的输入）。

## Global Constraints

- EmDash 锁 minor：`emdash ~1.3.0`、`@emdash-cms/cloudflare ~1.3.0`。Astro 7.x（Task 14 把下限提到 `^7.4.0`）。Node ≥ 22.22.0。
- Tailwind `4.3.3`、`@tailwindcss/vite 4.3.3`、`@tailwindcss/typography 0.5.20`，版本写死。
- `astro.config.mjs` 里固定 `site: "https://www.web9.ai"`。绝对 URL 一律从 `Astro.site`（API route 里是 `site`）拼，不能用请求的 Host 或 `Astro.url`。
- i18n：`en` 是默认语言、不加前缀；`zh-CN` 加前缀，fallback 到 `en`。
- 不启用 sandboxed 插件（免费套餐）。
- doc 正文一律是 `portableText` 字段 + 内联块，**不用 `blocks` 字段**。`blocks` 字段只有 `pages.layout` 一个。
- `packages/web9-blocks/lib/markdown.mjs` 的 class / style 白名单**不能放宽**（`SAFE_VALUE` 只能收紧）。新增的 `sanitizeHtmlFragment` 不保留任何 `class`、`id`、`data-*`、`style`。
- 内容 HTML 不带 utility class。不用 `dark:` variant。Task 4 之后 `src/`、`packages/` 里不再出现 `light-dark(`；明暗切换靠 `:root.light` / `:root.dark` 显式 token（方案 B，owner 2026-10-15 定）。
- **公开页面的 Tailwind utility 不能有** `fixed`、`inset-*`、`z-*`、`*-screen`、`*-vh/-dvh/-svh/-lvh/-vw`、带视口单位的任意值。页头、下拉框这类需要层级或定位的 chrome，写在组件自己的 `<style>` 里（scoped CSS，选择器带 `data-astro-cid-*`，内容伪造不了，因为所有 sanitizer 都去掉 `data-*`）。Task 5 起由 `npm run build` 的 `postbuild` 强制检查。
- **MCP 写内容**（计划 1 实测）：
  - `content_create` 传 `status: "published"` 直接上线，否则是草稿；
  - `docs` 等支持 drafts 的 collection 上，`content_update` **总是**写成草稿，之后必须用新的 `_rev` 调 `content_publish`；
  - `translationOf` 要传 en 条目的 ULID（`item.id`），不是 slug；
  - 脚本写入的每个块都要带确定性的 `_key`：没有 `_key` 的块存进去也没有 `_key`，runtime 不会补；
  - 后台有人打开着某个条目时，写它会返回 `ENTRY_LOCKED`：runner 停下来报告，让人关掉那个后台标签页，**不准**用 `overrideLock`；
  - core 搜索只索引 portableText 里 key 为 `text`、`alt`、`caption`、`code` 的字符串，web9 块的文字靠 hook 写进 `search_text`；hook 在没带正文字段的保存上不动 `search_text`。
- 图片 URL 保持站内相对路径 `/img/...`，不加 `https://www.web9.ai` 前缀。
- **seed 只在空库第一次启动时应用一次**（`onConflict: "skip"`）。所有"首次启动才生效"的东西（块类型、字段、tag terms、`settings.url`）都在 Task 1 写进 seed，并且在 Task 1 重建本地库之前定稿；计划 3 的生产首次启动用的也是这份 seed。
- **安全关口（Task 2、3、5）必须在任何 AI PAT 存在之前落地**。AI Editor 账号和 PAT 是计划 3 的事，本计划不创建。
- 本计划不部署、不改 Cloudflare 和 GitHub 的设置、不碰 `gh-pages`。分支 `plan2`；push 和 PR 在计划结束时按 finishing 流程由用户决定。
- **dev server**：`npm run dev -- --port 4321`（daemon）。`npm run build`、`npm run typecheck` **不能在 dev 运行时跑**：先 `npx astro dev stop`，构建或检查完再启动。需要这样做的任务标了 ⏹。
- 本机 shell 环境：
  - `grep` 是 ugrep，复杂正则要用 `command grep`；glob 要加引号（`--include='*.mjs'`）；
  - `sed -i ''` 会报错，原地改文件用 node 或 python；
  - zsh 不会对变量做 word-split。
- 浏览器只能通过 CDP（localhost:9222）操作**已经打开**的 Chrome 标签页：`list_pages` → `select_page` → `navigate_page`。不准开新标签页或新的 Chrome 实例，不准 `new_page`、`close_page`，不准从 Bash 启动 Chrome；没有合适的标签页就请用户去打开。用户的 localhost 标签页是 page 8。
- 每个 commit message 末尾加两行：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB
  ```
- 不提交：`.env`、`.dev.vars`、`.local/`、`.wrangler/`、`data.db`、`dist/`、`.superpowers/`。
- **关口规则**：标了 🚦 的步骤是验证关口。结果和预期不符时，**停下来**，把命令和输出原样报告给用户。不要临场换库、改架构或绕过去。

## 已定的取舍（执行时不再讨论）

每条后面是"如果错了的代价"。

| 取舍 | 代价 |
|---|---|
| 计划 2 只把 `Base.astro`（页头、页脚、主题）改成 Tailwind；blog 列表和文章页留给以后的样式计划，`posts/[slug]` 只加 `prose` | 模板 blog 页面继续带着 preflight 的细小样式问题 |
| 块类型 `hero`、`feature_grid` 和 `pages.layout` 写进 seed，不用 MCP `schema_create_block_type` | seed 改了对已有库无效；本地靠 Task 1 重建，生产是空库首次启动，所以没有实际代价 |
| `posts`、`pages` 也加 `search_text`，hook 用 collection → 正文字段的映射 `{docs: "body", posts: "content", pages: "content"}` | 后台多一个"自动生成，勿改"的文本框 |
| 写入时拒绝 `htmlBlock`、`iframe`、带 `html` 的 `embed` 和未知 `_type`；`isolated` 的 `htmlBlock` 渲染时直接忽略，不交给 core | owner 在后台也不能用这几种块；需要时再单独放开某一种 |
| redirects 由 runner 通过 REST 写入（幂等），不写进 seed | runner 需要 admin token；本来写内容也要 |
| blog 日期用 git 首次提交时间（Docusaurus 显示的日期），不用目录名里的日期 | `ai-tools-adhoc` 帖子显示 2025-04-11，不是 05-18 |
| `legacy/blog/20250518-ai-tools-adhoc` 作为一篇短帖迁移，链接改成 `/docs/ai-tools-adhoc` | 多一篇只有一句话的帖子 |
| doc 标题 = frontmatter `title`，没有才用正文第一个 H1；第一个 H1 总是从正文删掉 | 9 篇 doc 的页面大标题和旧站不同（旧站页面显示 H1，侧栏显示 frontmatter title） |
| `category` 存目录名（`cloud`、`usecase`……），显示名由 `DocsPage` 映射（zh-CN 的 `usecase` 显示"神兵利器"） | 改显示名要改代码 |
| 只有一个 en `primary` 菜单；zh-CN 页面上 `Base` 给 `/`、`/docs/...` 链接加 `/zh-CN` 前缀 | zh-CN 菜单文字是英文 |
| 搜索只搜当前语言（现状）：zh-CN 页面上搜不到没翻译的 en doc | 写进 spec §4，不改 |
| 首页 feature 文案里的 "Energe" 改成 "Energy" | owner 想保留原文时在后台改回 |

## 文件结构

| 文件 | 职责 | 任务 |
|---|---|---|
| `seed/seed.json`、`seed/seed.test.mjs` | 块类型、`pages.layout`、`posts`/`pages` 的 `search_text`、tag terms、`settings.url` | 1 |
| `emdash-env.d.ts` | 生成的类型（新增 `PageLayoutBlock` 等），随 seed 一起提交 | 1 |
| `packages/web9-blocks/lib/html.mjs` + test | `sanitizeHtmlFragment()`：给 `htmlBlock`/`embed` 用，不跑 Markdown，不留 class/id/data-*/style | 2 |
| `packages/web9-blocks/lib/css-value.mjs` + test | `isSafeCssValue()`：替换 `SAFE_VALUE` 正则 | 2 |
| `packages/web9-blocks/lib/markdown.mjs` + test | 用新的 CSS 值检查；站内链接不再强制 `target="_blank"` | 2 |
| `packages/web9-blocks/lib/pt-guard.mjs` + test | `guardPortableText()`：写入时的块/字段检查 | 3 |
| `packages/web9-blocks/index.mjs` + `index.test.mjs` | hook：guard + `search_text`，覆盖 docs/posts/pages | 3 |
| `packages/web9-blocks/astro/HtmlBlock.astro`、`Embed.astro`、`index.mjs` | 覆盖 core 的 `htmlBlock`、`embed` renderer | 3 |
| `.agents/skills/web9-blocks/SKILL.md` | AI 写作手册：guard 规则、posts 可搜索 | 3 |
| `src/styles/global.css`、`tokens.css`、`theme.css` | 方案 B 主题 token | 4 |
| `src/layouts/Base.astro` | 页头/页脚/主题切换改成 Tailwind；`WebMcpSearch`；菜单链接本地化 | 4 |
| `packages/web9-site/lib/nav.mjs` + test | `localizeHref()` | 4 |
| `scripts/lib/public-css.mjs` + test、`scripts/check-public-css.mjs` | 构建后扫描公开 CSS（`postbuild`） | 5 |
| `scripts/lib/mdx-to-pt.mjs` + test、`scripts/lib/fixtures/` | converter：确定性 `_key`、frontmatter、标题、`lang`、四冒号提示块、链接改写、图片、YouTube、tools gallery、Tabs-in-details、blog 模式 | 6、7、10 |
| `scripts/lib/legacy-tree.mjs` + test | legacy 清单：section/category/`sort_order`、旧 URL、slug 去重、翻译配对、链接解析 | 8 |
| `scripts/lib/sync.mjs` + test | 幂等写入一个条目（create / update + publish / 跳过） | 9 |
| `scripts/migrate.mjs` | runner CLI：`docs`、`menu`、`posts`、`redirects`、`home` | 9、10、11 |
| `scripts/lib/redirects.mjs` + test | 旧 URL → 新 URL 的规则表和 REST 同步 | 10 |
| `astro.config.mjs` | feed 重定向（带扩展名的路径不经过 EmDash 重定向中间件） | 10 |
| `src/pages/posts/[slug].astro` | 正文容器加 `prose` | 10 |
| `src/components/blocks/Hero.astro`、`FeatureGrid.astro`、`src/components/HomePage.astro` | 首页块渲染 | 11 |
| `src/pages/index.astro`、`src/pages/zh-CN/index.astro` | 首页路由（en、zh-CN） | 11 |
| `scripts/lib/home-content.mjs` | 首页内容（en、zh-CN） | 11 |
| `packages/web9-site/lib/docs-nav.mjs` + test | 侧栏分组和显示名 | 12 |
| `src/components/DocsPage.astro` | 分组显示名、canonical、侧栏对比度 | 12 |
| `src/pages/pages/[slug].astro` | 不存在时 `Astro.rewrite("/404")` | 12 |
| `packages/web9-blocks/lib/to-markdown.mjs` + test | `blocksToMarkdown()`：给 LLM 的 Markdown，不输出 `ec:block` JSON | 13 |
| `packages/web9-blocks/lib/investment-warning.mjs` | 风险提示文字（`.astro` 和 Markdown 共用） | 13 |
| `packages/web9-site/lib/llms.mjs` + test | `buildLlmsTxt()` | 13 |
| `src/pages/llms.txt.ts`、`src/pages/zh-CN/llms.txt.ts`、`src/pages/docs/[slug].md.ts`、`src/pages/zh-CN/docs/[slug].md.ts` | 给 AI 读的入口 | 13 |
| `packages/web9-blocks/astro/ToolGrid.astro`、`src/styles/global.css` | 样式小问题 | 14 |
| `package.json`、`.github/workflows/ci.yml` | 依赖清理；CI 加构建和 CSS 检查 | 14 |
| spec、`CLAUDE.md`、`AGENTS.md` | 记录结论和规则 | 各任务 |

`packages/web9-site/lib/` 是站点自己的纯函数（不属于块插件），`src/` 直接用相对路径 import。测试放在这里而不是 `src/`：Tailwind 扫描 `src/`，测试里的字符串会变成真实的 utility（spec §10、§11）。vitest 已经包含 `packages/**/*.test.mjs`。

## 任务总览

| # | 任务 | 依赖 | 模型 | ⏹ / 🚦 |
|---|---|---|---|---|
| 1 | seed 定稿 + 重建本地库 | — | standard | 🚦 |
| 2 | `sanitizeHtmlFragment` + 收紧 `SAFE_VALUE` + 站内链接 | — | cheap | |
| 3 | PT guard + hook（三个 collection）+ `htmlBlock`/`embed` 覆盖 | 1、2 | standard | 🚦 |
| 4 | 方案 B 主题 + `Base.astro` 改 Tailwind + `WebMcpSearch` | — | standard | |
| 5 | 公开 CSS 检查（`postbuild`）| 4 | standard | ⏹ 🚦 |
| 6 | converter（一）：确定性、frontmatter、标题、lang、四冒号、链接改写钩子、golden fixture | — | standard | |
| 7 | converter（二）：图片、YouTube、旧组件、tools gallery、Tabs-in-details；legacy 全量 0 `htmlBlock` | 3、6 | most capable | 🚦 |
| 8 | legacy 清单（sidebar 排序、旧 URL、slug、配对、链接解析）| 6 | standard | |
| 9 | runner：docs + 菜单；本地全量迁移 | 3、7、8 | standard | 🚦 |
| 10 | runner：posts + redirects；feed 重定向；posts `prose` | 9 | standard | 🚦 |
| 11 | 首页（块渲染、路由、内容）| 1、9 | standard | |
| 12 | `DocsPage`：分组显示名、canonical、对比度；`/pages/<missing>` | 9 | cheap | |
| 13 | 给 AI 读的入口：`to-markdown`、`.md`、`llms.txt` | 9、12 | standard | |
| 14 | 样式小问题、依赖清理、CI | 5 | cheap | ⏹ |
| 15 | 全量验收 + 文档收尾 | 全部 | standard | ⏹ 🚦 |

---
