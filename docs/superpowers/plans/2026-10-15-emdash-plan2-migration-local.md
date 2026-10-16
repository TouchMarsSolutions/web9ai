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

### Task 1: seed 定稿 + 重建本地库 🚦

**模型：** standard

把所有"只在空库首次启动时生效"的东西写进 seed，然后清空本地 D1/R2，让 seed 重新应用。本地库里现在是模板的 demo 数据（"My Blog"、8 篇 demo 帖子、`tools` 等 demo tag），会和迁移的数据冲突，重建后由后面的 runner 写入真实内容。

**Files:**
- Modify: `seed/seed.json`、`seed/seed.test.mjs`、`emdash-env.d.ts`（重新生成）、spec §2、§3、§7、§9
- Create: `seed/seed.apply.test.mjs`

**Interfaces:**
- Produces:
  - 块类型 `hero`（`title` 必填、`tagline`、`image`、`primary_label`、`primary_href`、`secondary_label`、`secondary_href`）和 `feature_grid`（`title`、`features` repeater：`title` 必填、`description`、`image`）；
  - `pages` 字段顺序 `title, content, search_text, layout`，`layout` 是 `blocks`，`allowedTypes: ["hero", "feature_grid"]`；
  - `posts` 字段顺序 `title, featured_image, content, excerpt, search_text`；
  - tag terms（en）：`ai`、`course`、`workshop`、`tools`、`tiny-course`；
  - `settings.url = "https://www.web9.ai"`（sitemap、robots 的绝对 URL 不再依赖请求的 Host）；
  - 生成类型 `PageLayoutBlock`、`PageLayoutHeroBlock`、`PageLayoutFeatureGridBlock`（`emdash-env.d.ts`）；
  - 新的 `.local/dev-token`（admin），本地库里没有任何内容条目。

- [ ] **Step 1: 写失败的测试**

把 `seed/seed.test.mjs` 里的 `"carries Web9.AI identity ..."` 整个 `it` 换成下面三个 `it`（放在同一个 `describe` 里）：

```js
	it("carries Web9.AI identity and no template demo content (applied once on first boot, spec §9)", () => {
		expect(seed.settings).toEqual({ title: "Web9.AI", tagline: "square of web3 to the power of AI", url: "https://www.web9.ai" });
		expect(seed.content).toBeUndefined();
		expect(seed.bylines).toBeUndefined();
		expect(seed.sections).toBeUndefined();
		expect(seed.redirects).toBeUndefined();
		expect(seed.taxonomies.find((t) => t.name === "category").terms).toEqual([]);
		expect(JSON.stringify(seed)).not.toMatch(/My Blog|\/pages\/about|stray thought/);
	});
	it("seeds the legacy blog tags as en terms (spec §7)", () => {
		const tag = seed.taxonomies.find((t) => t.name === "tag");
		expect(tag.terms.map((t) => t.slug)).toEqual(["ai", "course", "workshop", "tools", "tiny-course"]);
		expect(tag.terms.find((t) => t.slug === "ai").label).toBe("AI");
	});
	it("defines the home-page block types and pages.layout, and search_text on posts and pages (spec §2, §3, §4)", () => {
		expect(seed.blockTypes.map((b) => b.slug)).toEqual(["hero", "feature_grid"]);
		const fields = (slug) => seed.collections.find((c) => c.slug === slug).fields.map((f) => f.slug);
		expect(fields("pages")).toEqual(["title", "content", "search_text", "layout"]);
		expect(fields("posts")).toEqual(["title", "featured_image", "content", "excerpt", "search_text"]);
		const pages = seed.collections.find((c) => c.slug === "pages");
		expect(pages.fields.find((f) => f.slug === "layout")).toEqual({
			slug: "layout",
			label: "Layout",
			type: "blocks",
			validation: { allowedTypes: ["hero", "feature_grid"] },
		});
		for (const slug of ["posts", "pages"]) {
			expect(seed.collections.find((c) => c.slug === slug).fields.find((f) => f.slug === "search_text")).toMatchObject({
				type: "text",
				searchable: true,
			});
		}
	});
```

`validateSeed` 对 `blocks` 字段很宽松（`allowedTypes` 里写不存在的块类型、`required: true`、`searchable: true` 都能通过，只有 `applySeed` 才报错，见计划 2 调研）。所以再加一个真正把 seed 应用到临时 SQLite 库的测试。Create `seed/seed.apply.test.mjs`：

```js
// validateSeed is lenient about blocks fields; only applySeed catches a bad allowedTypes or a required blocks field.
// So apply the real seed to a throwaway SQLite file (node:sqlite, no native deps) and read the schema back.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SchemaRegistry } from "emdash";
import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/sqlite";
import { applySeed } from "emdash/seed";
import { Kysely } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

const seed = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "web9-seed-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("seed/seed.json applied to an empty database", () => {
	it("creates the block types before pages.layout references them", async () => {
		const db = new Kysely({ dialect: createDialect({ url: `file:${join(dir, "seed.db")}` }) });
		try {
			await runMigrations(db);
			const res = await applySeed(db, seed, { includeContent: false, onConflict: "skip" });
			expect(res.blockTypes.created).toBe(2);
			const reg = new SchemaRegistry(db);
			const pages = await reg.getCollectionWithFields("pages");
			expect(pages.fields.map((f) => `${f.slug}:${f.type}`)).toEqual([
				"title:string",
				"content:portableText",
				"search_text:text",
				"layout:blocks",
			]);
			expect(pages.fields.find((f) => f.slug === "layout").validation).toMatchObject({ allowedTypes: ["hero", "feature_grid"] });
			const posts = await reg.getCollectionWithFields("posts");
			expect(posts.fields.find((f) => f.slug === "search_text")).toMatchObject({ type: "text", searchable: true });
		} finally {
			await db.destroy();
		}
	});
});
```

`kysely` 是 emdash 的依赖，已经被 hoist 到 `node_modules/kysely`；`emdash/db/sqlite` 用的是 Node 自带的 `node:sqlite`（Node ≥ 22.13 不需要 flag），CI 的 Node 22 也能跑。

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run seed/`
Expected: FAIL：`settings` 少了 `url`、没有 `blockTypes`、tag terms 是空的；`seed.apply.test.mjs` 里 `res.blockTypes.created` 是 0。

- [ ] **Step 3: 改 seed**

```bash
cd /Users/john/git/web9ai
node -e '
const fs = require("fs");
const f = "seed/seed.json";
const s = JSON.parse(fs.readFileSync(f, "utf8"));
const BLOCK_TYPES = [
  {
    slug: "hero", label: "Hero", description: "Page header: title, tagline, optional image and up to two buttons",
    category: "Web9", currentVersion: 1,
    versions: [{ version: 1, fields: [
      { slug: "title", label: "Title", type: "string", required: true },
      { slug: "tagline", label: "Tagline", type: "text" },
      { slug: "image", label: "Image", type: "image" },
      { slug: "primary_label", label: "Primary button label", type: "string" },
      { slug: "primary_href", label: "Primary button link", type: "url" },
      { slug: "secondary_label", label: "Secondary button label", type: "string" },
      { slug: "secondary_href", label: "Secondary button link", type: "url" },
    ] }],
  },
  {
    slug: "feature_grid", label: "Feature grid", description: "Row of features: title + description + image",
    category: "Web9", currentVersion: 1,
    versions: [{ version: 1, fields: [
      { slug: "title", label: "Section title (optional)", type: "string" },
      { slug: "features", label: "Features", type: "repeater", validation: { minItems: 1, maxItems: 12, subFields: [
        { slug: "title", label: "Title", type: "string", required: true },
        { slug: "description", label: "Description", type: "text" },
        { slug: "image", label: "Image", type: "image" },
      ] } },
    ] }],
  },
];
s.settings.url = "https://www.web9.ai";
const searchText = { slug: "search_text", label: "Search text (auto-generated, do not edit)", type: "text", searchable: true };
const coll = (slug) => s.collections.find((c) => c.slug === slug);
coll("posts").fields.push({ ...searchText });
coll("pages").fields.push({ ...searchText }, { slug: "layout", label: "Layout", type: "blocks", validation: { allowedTypes: ["hero", "feature_grid"] } });
s.taxonomies.find((t) => t.name === "tag").terms = [["ai", "AI"], ["course", "course"], ["workshop", "workshop"], ["tools", "tools"], ["tiny-course", "tiny-course"]].map(([slug, label]) => ({ slug, label }));
// blockTypes is applied before collections; keep it before them in the file too
const out = {};
for (const [k, v] of Object.entries(s)) { if (k === "collections") out.blockTypes = BLOCK_TYPES; out[k] = v; }
fs.writeFileSync(f, JSON.stringify(out, null, "\t") + "\n");
'
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test`
Expected: PASS（全部，包括 `seed/seed.apply.test.mjs`）。

- [ ] **Step 5: 重建本地库**

这一步会删掉本地 D1/R2 里的所有内容（模板 demo 数据和计划 1 的测试 doc：`ai-e2e`、`ai-tools-adhoc`、`search-probe`、`smoke-workerd`），这是预期的。

```bash
cd /Users/john/git/web9ai
npx astro dev stop
rm -rf .wrangler/state
npm run dev -- --port 4321
curl -s -X POST 'http://localhost:4321/_emdash/api/setup/dev-bypass?token=1&content=0' > .local/bypass.json
node -e "const r=JSON.parse(require('fs').readFileSync('.local/bypass.json','utf8'));require('fs').writeFileSync('.local/dev-token',r.data.token+'\n');console.log('token saved:',r.data.token.slice(0,8)+'…')"
```

`npm run dev` 是 daemon，启动后命令会返回；如果 curl 连不上，等几秒重试。dev 启动时会重新生成 `emdash-env.d.ts`。确认：

```bash
command grep -c 'PageLayoutHeroBlock\|PageLayoutFeatureGridBlock' emdash-env.d.ts
```

Expected: ≥ 2。如果是 0，运行 `npx emdash types` 再查。

- [ ] **Step 6: 🚦 核对 seed 在 workerd 里生效**

```bash
node scripts/mcp.mjs schema_list_block_types '{}'
node scripts/mcp.mjs schema_get_collection '{"slug":"pages"}' | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));const c=r.collection??r;console.log(c.fields.map(f=>f.slug+':'+f.type).join(', '))"
node scripts/mcp.mjs schema_get_collection '{"slug":"posts"}' | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));const c=r.collection??r;console.log(c.fields.map(f=>f.slug+':'+f.type).join(', '))"
node scripts/mcp.mjs taxonomy_list_terms '{"taxonomy":"tag"}'
node scripts/mcp.mjs settings_get '{}'
node scripts/mcp.mjs content_list '{"collection":"posts"}'
node scripts/mcp.mjs menu_get '{"name":"primary"}'
```

Expected：
- 块类型列表有 `hero` 和 `feature_grid`；
- `pages`：`title:string, content:portableText, search_text:text, layout:blocks`；`posts` 最后一个字段是 `search_text:text`；
- tag terms 正好是那 5 个；
- settings 是 `title: "Web9.AI"`、`tagline: "square of web3 to the power of AI"`、`url: "https://www.web9.ai"`；
- posts 列表为空；菜单只有 Blog、GitHub 两项。

任何一项不符：停下来报告（关口规则）。

- [ ] **Step 7: 浏览器重新登录**

本地库重建后，浏览器里的后台会话失效了。通过 CDP 操作已经打开的 page 8（不开新标签页）：`list_pages` → `select_page` 8 → `navigate_page` 到 `http://localhost:4321/_emdash/api/auth/dev-bypass?redirect=/_emdash/admin`，确认后台首页能打开。page 8 不在了就请用户打开一个 localhost 标签页。

- [ ] **Step 8: 更新 spec**

- §2 表格：`posts` 行改成"模板自带字段 + `search_text`（text, searchable，hook 生成）；Docusaurus tags 映射到 `tag` taxonomy，5 个 term 写在 seed 里"；`pages` 行改成"字段 `title`、`content`、`search_text`、`layout`（`blocks`，`allowedTypes: hero, feature_grid`）；块类型由 seed 的 `blockTypes` 定义"。
- §3 表格最后一行"页面块"的"新增一种组件需要做什么"改成："在 `seed/seed.json` 的 `blockTypes` 里定义（新库首次启动时应用）；已经存在的库用 MCP `schema_create_block_type` 加上同样的定义，再 `schema_update_field` 把它加进 `pages.layout` 的 `allowedTypes`；在 `src/components/blocks/` 写渲染组件，在 `HomePage.astro` 的 components map 里登记"。
- §7 "首页"一条改成："首页：块类型 `hero`、`feature_grid` 和 `pages.layout` 由 seed 定义（**已定**，计划 2 Task 1）；内容由 runner 写入 `pages/home`（en + zh-CN），来自旧首页的 hero 和 3 个 features。"
- §9 "首次启动"一条末尾加一句："计划 2 Task 1 起，seed 还包含块类型、`pages.layout`、`posts`/`pages` 的 `search_text`、5 个 tag term 和 `settings.url`。"

- [ ] **Step 9: Commit**

```bash
git add seed/seed.json seed/seed.test.mjs seed/seed.apply.test.mjs emdash-env.d.ts docs/superpowers/specs/2026-10-15-emdash-migration-design.md
git commit -m "feat(seed): home block types, pages.layout, search_text on posts/pages, blog tags, settings.url

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 2: `sanitizeHtmlFragment` + 收紧 `SAFE_VALUE` + 站内链接不强制新窗口

**模型：** cheap（代码完整）

三处纯函数改动，都在 `packages/web9-blocks/lib/`。所有预期输出都是调研时用原型实际跑出来的。

**Files:**
- Create: `packages/web9-blocks/lib/html.mjs`、`html.test.mjs`、`css-value.mjs`、`css-value.test.mjs`
- Modify: `packages/web9-blocks/lib/markdown.mjs`（`SAFE_VALUE`、`transformTags`）、`markdown.test.mjs`、`packages/web9-blocks/package.json`（exports）

**Interfaces:**
- Produces:
  - `sanitizeHtmlFragment(html: unknown) → string`（`@web9/blocks/html`）：不跑 Markdown；只保留 markdown sanitizer 的标签集合；属性只留 `a[href,title,target,rel]`、`img[src,alt,width,height,loading]`、`td/th[colspan,rowspan]`、`th[scope]`；scheme 只允许 `http`、`https`、`mailto`，拒绝 `//host`；`a` 一律加 `rel="noopener noreferrer" target="_blank"`；
  - `isSafeCssValue(prop: string, value: string) → boolean`、`safeValueFor(prop) → { test(value): boolean }`（`css-value.mjs`）；
  - `renderMarkdown` / `renderInlineMarkdown` 签名不变；外部链接（`http(s)://`、`//`、`mailto:`）加 `rel="noopener noreferrer" target="_blank"`，站内链接（`/...`、`#...`、相对路径）去掉 `target`。

- [ ] **Step 1: 写失败的测试**

Create `packages/web9-blocks/lib/html.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { sanitizeHtmlFragment } from "./html.mjs";

describe("sanitizeHtmlFragment", () => {
	it("drops class, id, data-* and style", () => {
		expect(sanitizeHtmlFragment('<div class="fixed inset-0 z-50" id="x" data-a="1" style="position:fixed;inset:0">overlay</div>')).toBe("<div>overlay</div>");
	});
	it("cannot forge Astro-scoped component selectors", () => {
		expect(sanitizeHtmlFragment('<img class="emdash-cover__background" data-astro-cid-g6rigryn src="https://evil.example/x.png">')).toBe('<img src="https://evil.example/x.png" />');
	});
	it("drops the hooks web9 client scripts query for", () => {
		expect(sanitizeHtmlFragment("<div data-w9-tabs data-fs>x</div>")).toBe("<div>x</div>");
	});
	it("removes style, script, svg, form and button elements", () => {
		expect(sanitizeHtmlFragment("<style>.x{position:fixed}</style><script>alert(1)</script><svg onload=alert(1)></svg><form action=/x><input></form><button>b</button>")).toBe("b");
	});
	it("drops iframes", () => {
		expect(sanitizeHtmlFragment('<iframe src="https://www.youtube.com/embed/abc" width="560"></iframe>')).toBe("");
	});
	it("strips javascript: and protocol-relative hrefs, forces rel/target", () => {
		expect(sanitizeHtmlFragment('<a href="//evil.example">p</a>')).toBe('<a rel="noopener noreferrer" target="_blank">p</a>');
		expect(sanitizeHtmlFragment('<a href="javascript:alert(1)">j</a>')).toBe('<a rel="noopener noreferrer" target="_blank">j</a>');
	});
	it("does not run markdown over HTML", () => {
		expect(sanitizeHtmlFragment("<p>2*3*4 and a_b_c</p>")).toBe("<p>2*3*4 and a_b_c</p>");
		expect(sanitizeHtmlFragment("<div>\n\n    <span>x</span>\n\n</div>")).toBe("<div>\n\n    <span>x</span>\n\n</div>");
	});
	it("returns an empty string for non-strings", () => {
		expect(sanitizeHtmlFragment(undefined)).toBe("");
		expect(sanitizeHtmlFragment(null)).toBe("");
	});
});
```

Create `packages/web9-blocks/lib/css-value.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { isSafeCssValue } from "./css-value.mjs";

describe("isSafeCssValue", () => {
	it.each([
		["color", "#E6E6FA"],
		["color", "rgb(10, 20, 30)"],
		["background", "linear-gradient(135deg, rgba(148, 0, 211, 0.9), #4B0082)"],
		["background", "radial-gradient(circle, rgba(255,255,255,.4), transparent)"],
		["width", "calc(100% - 20px)"],
		["max-width", "min(100%, 600px)"],
		["padding", "100px 20px"],
		["margin", "0 auto"],
		["box-shadow", "0 2px 8px rgba(0,0,0,0.2)"],
		["font-size", "1.2em"],
	])("accepts %s: %s", (prop, value) => expect(isSafeCssValue(prop, value)).toBe(true));
	it.each([
		["background", "red\nurl(//evil.example/t.gif)"],
		["background", "url(https://evil.example/t.gif)"],
		["background", "image-set('//evil.example/t.gif' 1x)"],
		["background", "-webkit-image-set(x 1x)"],
		["background", "cross-fade(a, b)"],
		["background", "src(x)"],
		["background", "element(#foo)"],
		["background", "paint(foo)"],
		["width", "attr(data-w px)"],
		["color", "var(--x, red)"],
		["background", "//evil.example/t.gif"],
		["box-shadow", "0 0 0 9999px red"],
		["box-shadow", "0 0 0 100vmax #000"],
		["width", "100vw"],
		["margin", "-9999px 0 0 -9999px"],
		["margin", "-1px"],
		["padding", "99999px"],
		["font-size", "9999px"],
		["color", "red /* x */"],
		["color", "expression(alert(1))"],
		["width", "calc((100% - 1px)"],
		["color", ""],
	])("rejects %s: %j", (prop, value) => expect(isSafeCssValue(prop, value)).toBe(false));
});
```

在 `packages/web9-blocks/lib/markdown.test.mjs` 的 `describe("renderMarkdown sanitizer")` 里加：

```js
	it("drops url() smuggled past a newline", () => {
		expect(renderMarkdown('<div style="background: red\nurl(//evil.example/t.gif)">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="background: red&#10;url(//evil.example/t.gif)">x</div>')).toBe("<div>x</div>");
	});
	it("drops every function that can fetch or leak: image-set, cross-fade, src, attr, var", () => {
		for (const fn of ["image-set", "-webkit-image-set", "cross-fade", "src", "element", "paint"]) {
			expect(renderMarkdown(`<div style="background: ${fn}('//evil.example/t.gif' 1x)">x</div>`)).toBe("<div>x</div>");
		}
		expect(renderMarkdown('<div style="width: attr(data-w px)">x</div>')).toBe("<div>x</div>");
	});
	it("drops protocol-relative URLs", () => {
		expect(renderMarkdown('<div style="background: //evil.example/t.gif">x</div>')).toBe("<div>x</div>");
	});
	it("keeps rgb()/hsl()/gradients/calc()/min()", () => {
		expect(renderMarkdown('<div style="color: rgb(10, 20, 30); background: radial-gradient(circle, rgba(255,255,255,.4), transparent)">x</div>')).toBe(
			'<div style="color:rgb(10, 20, 30);background:radial-gradient(circle, rgba(255,255,255,.4), transparent)">x</div>',
		);
		expect(renderMarkdown('<div style="width: calc(100% - 20px); max-width: min(100%, 600px)">x</div>')).toBe(
			'<div style="width:calc(100% - 20px);max-width:min(100%, 600px)">x</div>',
		);
	});
	it("drops full-page box-shadow spreads and viewport units", () => {
		expect(renderMarkdown('<div style="box-shadow: 0 0 0 9999px red">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="box-shadow: 0 0 0 100vmax #000">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="width: 100vw; color: red">x</div>')).toBe('<div style="color:red">x</div>');
		expect(renderMarkdown('<div style="box-shadow: 0 2px 8px rgba(0,0,0,0.2)">x</div>')).toBe('<div style="box-shadow:0 2px 8px rgba(0,0,0,0.2)">x</div>');
	});
	it("drops negative margins and absurd sizes", () => {
		expect(renderMarkdown('<div style="margin: -9999px 0 0 -9999px">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="margin: -1px">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="padding: 99999px; font-size: 9999px">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="margin: 0 auto; padding: 100px 20px">x</div>')).toBe('<div style="margin:0 auto;padding:100px 20px">x</div>');
	});
	it("drops upper-case property names (the whitelist is case-sensitive, so they fail closed)", () => {
		expect(renderMarkdown('<div style="POSITION: fixed; Background-Color: red; color: red">x</div>')).toBe('<div style="color:red">x</div>');
	});
	it("opens only external links in a new tab", () => {
		expect(renderMarkdown("[a](/docs/intro) [b](#top) [c](https://example.com)")).toBe(
			'<p><a href="/docs/intro">a</a> <a href="#top">b</a> <a href="https://example.com" rel="noopener noreferrer" target="_blank">c</a></p>\n',
		);
		expect(renderMarkdown('<a href="/docs/x" target="_top">t</a>')).toBe('<p><a href="/docs/x">t</a></p>\n');
	});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run packages/web9-blocks/lib/`
Expected: FAIL：`html.mjs`、`css-value.mjs` 不存在；markdown 新用例里的 newline、`image-set`、`box-shadow`、负 `margin`、站内链接几条失败。

- [ ] **Step 3: 实现**

Create `packages/web9-blocks/lib/css-value.mjs`：

```js
// Inline-style values allowed in rendered Markdown. Content is published by AI agents without review, so
// every value is checked against a small grammar: known CSS functions only, no quotes, no escapes, no
// comments, no protocol-relative URLs, no viewport units, and per-property size caps (a 9999px
// box-shadow spread or a -9999px margin paints over or off the page).
export const CSS_FUNCTIONS = new Set([
	"rgb", "rgba", "hsl", "hsla", "hwb",
	"linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient",
	"calc", "min", "max", "clamp",
]); // no var(): it can carry fallbacks

const ALLOWED_CHARS = /^[a-z0-9 #%.,()+\-/]*$/i; // plain space only: no \t \n \r \f, quotes, `_`, `:`, `;`, `\`, `*`, `@`, `!`
const FUNCTION_CALL = /(-?[a-z][a-z0-9-]*)\s*\(/gi;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/gi;
const NEGATIVE_NUMBER = /(?:^|[\s(,])-(?=[\d.])/;
const VIEWPORT_UNIT = /[\d.](?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))\b/i;
const MAX_NUMBER = { "box-shadow": 64, border: 32, "border-radius": 1000, margin: 256, padding: 256, "font-size": 128 }; // default 2000
const NO_NEGATIVE = new Set(["margin"]);

export function isSafeCssValue(prop, value) {
	const v = String(value).trim();
	if (!v || v.length > 200 || !ALLOWED_CHARS.test(v)) return false;
	if (v.includes("/*") || v.includes("//")) return false;
	for (const m of v.matchAll(FUNCTION_CALL)) if (!CSS_FUNCTIONS.has(m[1].toLowerCase())) return false;
	let depth = 0;
	for (const ch of v) {
		if (ch === "(") depth++;
		else if (ch === ")" && --depth < 0) return false;
	}
	if (depth !== 0 || VIEWPORT_UNIT.test(v)) return false;
	if (NO_NEGATIVE.has(prop) && NEGATIVE_NUMBER.test(v)) return false;
	const max = MAX_NUMBER[prop] ?? 2000;
	for (const n of v.replace(HEX_COLOR, " ").matchAll(/\d+(?:\.\d+)?|\.\d+/g)) if (Number(n[0]) > max) return false;
	return true;
}

/** sanitize-html's allowedStyles only calls `.test(value)` on each entry. */
export const safeValueFor = (prop) => ({ test: (value) => isSafeCssValue(prop, value) });
```

Create `packages/web9-blocks/lib/html.mjs`：

```js
// Sanitizer for raw HTML fields (htmlBlock.html, embed.html). Unlike renderMarkdown it never runs marked
// (which would turn indented children into code blocks and inject <em>), and it keeps no class, id,
// data-* or style: class + data-astro-cid-* can reproduce any scoped component rule in the public CSS,
// for example a position:absolute; inset:0 cover background (spec §10).
import sanitizeHtml from "sanitize-html";
import { ALLOWED_TAGS } from "./markdown.mjs";

const OPTIONS = {
	allowedTags: ALLOWED_TAGS,
	allowedAttributes: {
		a: ["href", "title", "target", "rel"],
		img: ["src", "alt", "width", "height", "loading"],
		td: ["colspan", "rowspan"],
		th: ["colspan", "rowspan", "scope"],
	},
	allowedSchemes: ["http", "https", "mailto"],
	allowProtocolRelative: false,
	transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }, true) },
};

export function sanitizeHtmlFragment(html) {
	if (typeof html !== "string") return "";
	return sanitizeHtml(html, OPTIONS);
}
```

Modify `packages/web9-blocks/lib/markdown.mjs`：

1. 在文件顶部的 import 后面加：

```js
import { safeValueFor } from "./css-value.mjs";
```

2. 把 `const SAFE_VALUE = ...` 那一行（连同它上面两行注释）删掉，换成：

```js
// Content is published by AI agents without review, so inline CSS is limited to cosmetic
// properties (no positioning) and every value goes through isSafeCssValue (css-value.mjs).
```

3. 把 `SANITIZE` 定义前面加一个导出的标签集合，`SANITIZE.allowedTags` 改用它；`allowedStyles` 改用 `safeValueFor`；`transformTags` 换成区分站内、站外链接的版本：

```js
/** Tags renderMarkdown keeps; html.mjs reuses the same set. */
export const ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat(["img", "details", "summary", "del", "s", "h1", "h2"]);

/** Absolute (http(s)://), protocol-relative (//) and mailto: links leave the site; everything else stays on it. */
const isExternalHref = (href = "") => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || /^mailto:/i.test(href);

function transformLink(tagName, attribs) {
	if (isExternalHref(attribs.href)) return { tagName, attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" } };
	const { target, ...rest } = attribs;
	return { tagName, attribs: rest };
}
```

`SANITIZE` 里对应三处改成：

```js
	allowedTags: ALLOWED_TAGS,
```

```js
	allowedStyles: { "*": Object.fromEntries(STYLE_PROPS.map((p) => [p, [safeValueFor(p)]])) },
```

```js
	transformTags: { a: transformLink },
```

`packages/web9-blocks/package.json` 的 `exports` 里，在 `"./markdown"` 后面加一行：

```json
    "./html": "./lib/html.mjs",
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test`
Expected: PASS。原有的 style 用例（渐变保留、定位去掉、`url()`/转义去掉）不用改也能通过；原有的外链用例仍然带 `rel`/`target`。

- [ ] **Step 5: Commit**

```bash
git add packages/web9-blocks/lib/ packages/web9-blocks/package.json
git commit -m "fix(blocks): sanitizeHtmlFragment for raw HTML, stricter inline CSS values, internal links stay in tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---
