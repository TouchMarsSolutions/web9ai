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

### Task 3: PT guard + hook 覆盖三个 collection + `htmlBlock`/`embed` renderer 覆盖 🚦

**模型：** standard

计划 1 遗留的安全关口，按调研结论扩大范围（调研：`p2-research-1-security.md` §0、§5）：
- 只管 `htmlBlock` 不够。core 的 `embed.html` 走同一个保留 `class`/`id`/`data-*` 的 sanitizer；另有 9 个 core renderer 把块字段原样拼进 `style=` 或 `class=`。例如 `cover.minHeight = "300px;position:fixed;inset:0;z-index:99999"` 直接变成全屏遮罩，不经过任何 CSS 文件，构建期 CSS 检查看不到。
- 写入路径不校验块结构：portableText 字段只校验 `{_type: string}`，MCP 的 Markdown 正文里一行 `<!--ec:block {json} -->` 就能写入任意块。所以"agent 不要用 `htmlBlock`"只能靠代码强制。
- 做法：`content:beforeSave` hook 里先跑 PT guard，有问题就抛 `ContentSaveRejectedError`（编辑者和 agent 会看到这条消息，保存被取消）；没问题再生成 `search_text`。hook 对 docs、posts、pages 三个 collection 都生效。渲染时再用 web9 自己的 `htmlBlock`/`embed` renderer 覆盖 core，作为第二道防线（覆盖 seed/import 等可能不经过 hook 的写入）。

**Files:**
- Create: `packages/web9-blocks/lib/pt-guard.mjs`、`pt-guard.test.mjs`、`packages/web9-blocks/lib/embed-url.mjs`、`embed-url.test.mjs`、`packages/web9-blocks/index.test.mjs`、`packages/web9-blocks/astro/HtmlBlock.astro`、`packages/web9-blocks/astro/Embed.astro`
- Modify: `packages/web9-blocks/index.mjs`（hook）、`packages/web9-blocks/astro/index.mjs`、`.agents/skills/web9-blocks/SKILL.md`、spec §4、§8、§10

**Interfaces:**
- Consumes: Task 1 的 `posts.search_text`、`pages.search_text` 字段；Task 2 的 `sanitizeHtmlFragment`（`../lib/html.mjs`）
- Produces:
  - `guardPortableText(value: unknown) → string[]`：问题列表，空数组表示通过。只查顶层块（嵌套在 `columns`/`cover`/表格里的块由 astro-portabletext 渲染，没有 type map，自定义类型只会渲染成隐藏的 unknown 提示）。规则：
    - 拒绝 `htmlBlock`、`iframe`、未知 `_type`；
    - `embed.html` 必须为空（embed 只按 `url` 渲染）；
    - `image.alignment` ∈ left/center/right/wide/full；`image.dominantColor`、`image.asset.meta.dominantColor`、`gallery.images[].dominantColor`、`cover.overlayColor` 必须是 `#hex` 或 `rgb()/rgba()`；
    - `gallery.columns` 是 1–6 的整数；`columns.columns[].width` 是 `数字 + px|rem|em|%`；
    - `cover.minHeight` 是 `数字 + px|rem|em` 或 ≤ 100 的 `vh`；`cover.overlayOpacity` 是 0–1 的数字；`cover.alignment` ∈ left/center/right；
    - `button.style`、`buttons.buttons[].style` ∈ default/outline/fill；`buttons.layout` ∈ horizontal/vertical；
    - `code.language` 匹配 `^[\w+#.-]{1,32}$`；
    - `tool_grid.logo_size` 是 16–300 的数字；`investment_warning.lang` ∈ zh/en；
    - 字段不存在（`undefined`/`null`）一律通过；正文不是数组（字符串）时返回 `[]`。
  - `PT_FIELDS = { docs: ["body"], posts: ["content"], pages: ["content"] }`（`index.mjs` 导出）：每次保存都 guard；第一个字段生成 `search_text`。
  - `beforeSave({ content, collection }) → content`（`index.mjs` 导出，hook 的 handler）。
  - `embedSrc(url: unknown) → string | null`（`lib/embed-url.mjs`）：YouTube（`watch?v=`、`youtu.be/`、`embed/`、`shorts/`，`t=644s` → `?start=644`）→ `https://www.youtube-nocookie.com/embed/<id>`；Vimeo → `https://player.vimeo.com/video/<id>`；其他返回 `null`。
  - renderer：`htmlBlock` 只输出 `sanitizeHtmlFragment(node.html)`，忽略 `css`、`js`、`isolated`；`embed` 只对 YouTube/Vimeo 输出 iframe，其他 URL 输出一个外链，`html` 字段永远不用。

- [ ] **Step 1: 写失败的测试**

Create `packages/web9-blocks/lib/pt-guard.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { guardPortableText } from "./pt-guard.mjs";

const p = (text) => ({ _type: "block", _key: "b", style: "normal", markDefs: [], children: [{ _type: "span", _key: "s", text, marks: [] }] });

describe("guardPortableText", () => {
	it("passes prose, web9 blocks and safe core blocks", () => {
		expect(
			guardPortableText([
				p("hello"),
				{ _type: "callout", _key: "c", tone: "tip", title: "t", body: "md" },
				{ _type: "tool_grid", _key: "g", logo_size: 100, tools: [] },
				{ _type: "image", _key: "i", asset: { _ref: "x", url: "/img/a.png", meta: { dominantColor: "rgb(10,20,30)" } }, alignment: "center" },
				{ _type: "embed", _key: "e", url: "https://www.youtube.com/watch?v=SKS-URw9a18" },
				{ _type: "code", _key: "k", language: "c#", code: "x" },
				{ _type: "cover", _key: "v", minHeight: "60vh", overlayColor: "#000", overlayOpacity: 0.4, alignment: "left" },
				{ _type: "columns", _key: "o", columns: [{ width: "33.33%", content: [] }] },
				{ _type: "buttons", _key: "u", layout: "vertical", buttons: [{ text: "a", style: "outline" }] },
			]),
		).toEqual([]);
	});
	it("rejects htmlBlock, iframe and unknown types", () => {
		const problems = guardPortableText([
			{ _type: "htmlBlock", _key: "h", html: "<b>x</b>" },
			{ _type: "iframe", _key: "f", src: "https://example.com" },
			{ _type: "marquee", _key: "m" },
		]);
		expect(problems).toHaveLength(3);
		expect(problems[0]).toMatch(/#0 htmlBlock/);
		expect(problems[1]).toMatch(/#1 iframe/);
		expect(problems[2]).toMatch(/#2 marquee: unknown block type/);
	});
	it("rejects values that core renderers paste into style or class", () => {
		const problems = guardPortableText([
			{ _type: "cover", _key: "a", minHeight: "300px;position:fixed;inset:0;z-index:99999" },
			{ _type: "image", _key: "b", asset: { meta: { dominantColor: "red;position:fixed" } } },
			{ _type: "image", _key: "c", alignment: "x fixed inset-0" },
			{ _type: "columns", _key: "d", columns: [{ width: "50%;position:fixed" }] },
			{ _type: "button", _key: "e", style: "default fixed" },
			{ _type: "code", _key: "f", language: "js fixed inset-0" },
			{ _type: "gallery", _key: "g", columns: "3;position:fixed", images: [{ dominantColor: "url(//x)" }] },
			{ _type: "cover", _key: "h", overlayOpacity: "0.5;position:fixed" },
			{ _type: "embed", _key: "i", url: "https://x.example", html: '<div class="fixed">x</div>' },
			{ _type: "tool_grid", _key: "j", logo_size: 5000 },
			{ _type: "cover", _key: "k", minHeight: "500vh" },
		]);
		expect(problems.map((x) => x.split(":")[0])).toEqual([
			"#0 cover minHeight",
			"#1 image asset.meta.dominantColor",
			"#2 image alignment",
			"#3 columns columns[].width",
			"#4 button style",
			"#5 code language",
			"#6 gallery columns",
			"#6 gallery images[].dominantColor",
			"#7 cover overlayOpacity",
			"#8 embed html",
			"#9 tool_grid logo_size",
			"#10 cover minHeight",
		]);
	});
	it("ignores absent fields and non-array values", () => {
		expect(guardPortableText([{ _type: "image", _key: "a", asset: { _ref: "x" } }, { _type: "cover", _key: "b" }])).toEqual([]);
		expect(guardPortableText("# markdown")).toEqual([]);
		expect(guardPortableText(undefined)).toEqual([]);
	});
});
```

Create `packages/web9-blocks/lib/embed-url.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { embedSrc } from "./embed-url.mjs";

describe("embedSrc", () => {
	it.each([
		["https://www.youtube.com/watch?v=SKS-URw9a18", "https://www.youtube-nocookie.com/embed/SKS-URw9a18"],
		["https://youtu.be/SKS-URw9a18", "https://www.youtube-nocookie.com/embed/SKS-URw9a18"],
		["https://www.youtube.com/embed/SKS-URw9a18", "https://www.youtube-nocookie.com/embed/SKS-URw9a18"],
		["https://www.youtube.com/watch?v=trXPfpV5iRQ&t=644s", "https://www.youtube-nocookie.com/embed/trXPfpV5iRQ?start=644"],
		["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"],
	])("%s", (url, src) => expect(embedSrc(url)).toBe(src));
	it.each([["https://evil.example/watch?v=SKS-URw9a18"], ["javascript:alert(1)"], ["http://www.youtube.com/watch?v=SKS-URw9a18"], [undefined]])(
		"returns null for %s",
		(url) => expect(embedSrc(url)).toBeNull(),
	);
});
```

Create `packages/web9-blocks/index.test.mjs`：

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PT_FIELDS, beforeSave } from "./index.mjs";

const seed = JSON.parse(readFileSync(new URL("../../seed/seed.json", import.meta.url), "utf8"));
const callout = { _type: "callout", _key: "c1", tone: "tip", title: "T", body: "probe-word" };

describe("content:beforeSave", () => {
	it("guards every portableText field the seed defines", () => {
		const fromSeed = Object.fromEntries(
			seed.collections
				.map((c) => [c.slug, c.fields.filter((f) => f.type === "portableText").map((f) => f.slug)])
				.filter(([, fields]) => fields.length),
		);
		expect(PT_FIELDS).toEqual(fromSeed);
	});
	it("mirrors web9 block text into search_text for docs, posts and pages", async () => {
		expect((await beforeSave({ collection: "docs", content: { body: [callout] } })).search_text).toBe("T\nprobe-word");
		expect((await beforeSave({ collection: "posts", content: { content: [callout] } })).search_text).toBe("T\nprobe-word");
		expect((await beforeSave({ collection: "pages", content: { content: [callout] } })).search_text).toBe("T\nprobe-word");
	});
	it("leaves saves without the body field, and unknown collections, alone", async () => {
		const c = { title: "x" };
		expect(await beforeSave({ collection: "posts", content: c })).toBe(c);
		const other = { body: [{ _type: "htmlBlock" }] };
		expect(await beforeSave({ collection: "other", content: other })).toBe(other);
	});
	it("rejects a save with a message the editor sees", async () => {
		await expect(
			beforeSave({ collection: "docs", content: { body: [{ _type: "htmlBlock", _key: "h", html: "<b>x</b>" }] } }),
		).rejects.toMatchObject({ name: "ContentSaveRejectedError", message: expect.stringContaining("body: #0 htmlBlock") });
	});
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run packages/web9-blocks/`
Expected: FAIL：`pt-guard.mjs`、`embed-url.mjs` 不存在，`index.mjs` 没有导出 `PT_FIELDS`、`beforeSave`。

- [ ] **Step 3: 实现 guard 和 embed URL**

Create `packages/web9-blocks/lib/pt-guard.mjs`：

```js
// Write-time check of Portable Text values (spec §10). Returns a list of problems; empty means OK.
// Core renderers paste some block fields straight into class="" or style="" (cover.minHeight,
// image.dominantColor, columns[].width, button.style, code.language ...), core's htmlBlock/embed
// sanitizer keeps class/id/data-*, and MCP accepts any _type through a `<!--ec:block {json} -->` line.
// Only top-level blocks are checked: nested blocks (columns, cover, table cells) are rendered by
// astro-portabletext without a type map, so a nested custom type renders as a hidden "unknown" div.

const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i;
const LENGTH = /^\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%)$/;
const MIN_HEIGHT = /^(?:\d{1,4}(?:\.\d{1,2})?(?:px|rem|em)|(?:100|\d{1,2})(?:\.\d{1,2})?vh)$/;
const LANGUAGE = /^[\w+#.-]{1,32}$/;

const oneOf = (...values) => (v) => values.includes(v);
const matches = (re) => (v) => typeof v === "string" && re.test(v);
const numberIn = (min, max) => (v) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integerIn = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const BUTTON_STYLE = oneOf("default", "outline", "fill");

/** Field checks per allowed _type. Paths use `a.b` for nesting and `list[].field` for arrays. */
const RULES = {
	block: {},
	blockquoteGroup: {},
	break: {},
	table: {},
	file: {},
	pullquote: {},
	video: {},
	image: { alignment: oneOf("left", "center", "right", "wide", "full"), dominantColor: matches(COLOR), "asset.meta.dominantColor": matches(COLOR) },
	gallery: { columns: integerIn(1, 6), "images[].dominantColor": matches(COLOR), "images[].asset.meta.dominantColor": matches(COLOR) },
	columns: { "columns[].width": matches(LENGTH) },
	cover: { minHeight: matches(MIN_HEIGHT), overlayColor: matches(COLOR), overlayOpacity: numberIn(0, 1), alignment: oneOf("left", "center", "right") },
	button: { style: BUTTON_STYLE },
	buttons: { layout: oneOf("horizontal", "vertical"), "buttons[].style": BUTTON_STYLE },
	code: { language: matches(LANGUAGE) },
	embed: { html: (v) => v === "" }, // web9's Embed renders from url only
	callout: {},
	tabs: {},
	details: {},
	mermaid: {},
	tool_grid: { logo_size: numberIn(16, 300) },
	investment_warning: { lang: oneOf("zh", "en") },
};

const FORBIDDEN = {
	htmlBlock: "raw HTML blocks are not allowed; use Markdown or a Web9 block",
	iframe: "iframes are not allowed; use an embed block with a YouTube or Vimeo url",
};

/** Every value at `path` (absent ones skipped). */
function valuesAt(node, path) {
	let current = [node];
	for (const part of path.split(".")) {
		const list = part.endsWith("[]");
		const key = list ? part.slice(0, -2) : part;
		current = current.flatMap((v) => {
			const next = v && typeof v === "object" ? v[key] : undefined;
			if (list) return Array.isArray(next) ? next : [];
			return [next];
		});
	}
	return current.filter((v) => v !== undefined && v !== null);
}

export function guardPortableText(value) {
	if (!Array.isArray(value)) return [];
	const problems = [];
	value.forEach((node, i) => {
		const type = typeof node?._type === "string" ? node._type : "(no _type)";
		if (Object.hasOwn(FORBIDDEN, type)) {
			problems.push(`#${i} ${type}: ${FORBIDDEN[type]}`);
			return;
		}
		if (!Object.hasOwn(RULES, type)) {
			problems.push(`#${i} ${type}: unknown block type`);
			return;
		}
		for (const [path, ok] of Object.entries(RULES[type])) {
			for (const v of valuesAt(node, path)) {
				if (!ok(v)) problems.push(`#${i} ${type} ${path}: value ${JSON.stringify(v).slice(0, 60)} is not allowed`);
			}
		}
	});
	return problems;
}
```

Create `packages/web9-blocks/lib/embed-url.mjs`：

```js
// The only embeds the site renders: YouTube and Vimeo, from the block's url (never its html).
const YOUTUBE = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})(?:[?&#].*)?$/;
const VIMEO = /^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[?#/].*)?$/;

export function embedSrc(url) {
	if (typeof url !== "string") return null;
	const yt = YOUTUBE.exec(url);
	if (yt) {
		const start = /[?&]t=(\d+)s?(?:&|$)/.exec(url)?.[1];
		return `https://www.youtube-nocookie.com/embed/${yt[1]}${start ? `?start=${start}` : ""}`;
	}
	const vimeo = VIMEO.exec(url);
	return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
}
```

- [ ] **Step 4: 改 hook**

`packages/web9-blocks/index.mjs` 第一行改成：

```js
import { ContentSaveRejectedError, definePlugin } from "emdash";
import { guardPortableText } from "./lib/pt-guard.mjs";
import { extractBlockText } from "./lib/search-text.mjs";
```

在 `const BLOCK_TYPES = ...` 那行后面加：

```js
/** Portable Text fields per collection: all are guarded on every save; the first one feeds search_text. */
export const PT_FIELDS = { docs: ["body"], posts: ["content"], pages: ["content"] };

/**
 * content:beforeSave. Rejects unsafe blocks (spec §10), then mirrors this plugin's block text into
 * search_text, because core search only indexes text/alt/caption/code strings (spec §4).
 */
export async function beforeSave({ content, collection }) {
	const fields = PT_FIELDS[collection];
	if (!fields) return content;
	const problems = fields.flatMap((f) => (content[f] === undefined ? [] : guardPortableText(content[f]).map((p) => `${f}: ${p}`)));
	if (problems.length) throw new ContentSaveRejectedError(`Save rejected (spec §10): ${problems.join("; ")}`.slice(0, 1000));
	const [main] = fields;
	// Updates pass only the changed fields; when the body didn't change, keep search_text as is.
	if (content[main] === undefined) return content;
	return { ...content, search_text: extractBlockText(content[main], BLOCK_TYPES) };
}
```

`createPlugin()` 里的 `hooks` 换成：

```js
		hooks: {
			"content:beforeSave": beforeSave,
		},
```

（原来那段注释和 `collection !== "docs"` 判断一起删掉，逻辑已经在 `beforeSave` 里。）

- [ ] **Step 5: 跑测试，确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 6: renderer 覆盖**

Create `packages/web9-blocks/astro/HtmlBlock.astro`：

```astro
---
// Replaces core's htmlBlock renderer (spec §10). Core keeps class/id/data-* and can render an isolated
// srcdoc iframe that may navigate the top page on click; this renderer only ever emits sanitized inline
// HTML. css, js and isolated are ignored on purpose. The save hook rejects new htmlBlocks; this covers
// rows that reached the database some other way (seed, import).
import { sanitizeHtmlFragment } from "../lib/html.mjs";

interface Props {
	node: { _type: "htmlBlock"; _key: string; html?: string; css?: string; js?: string; isolated?: boolean };
}
const { node } = Astro.props;
const html = sanitizeHtmlFragment(node?.html);
if (!html.trim()) return null;
---

<div class="my-6" set:html={html} />
```

Create `packages/web9-blocks/astro/Embed.astro`：

```astro
---
// Replaces core's embed renderer (spec §10): core passes embed.html through a sanitizer that keeps
// class/id/data-*. Only YouTube and Vimeo urls become an iframe; any other url is a plain external link.
import { sanitizeHref } from "emdash";
import { embedSrc } from "../lib/embed-url.mjs";

interface Props {
	node: { _type: "embed"; _key: string; url?: string; caption?: string };
}
const { node } = Astro.props;
const src = embedSrc(node?.url);
const href = node?.url ? sanitizeHref(node.url) : "#";
const caption = typeof node?.caption === "string" ? node.caption : "";
---

{
	src ? (
		<figure class="not-prose my-6">
			<div class="aspect-video w-full overflow-hidden rounded-lg bg-surface">
				<iframe
					class="size-full"
					src={src}
					title={caption || "Video"}
					loading="lazy"
					allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
					allowfullscreen
					referrerpolicy="strict-origin-when-cross-origin"
				/>
			</div>
			{caption && <figcaption class="mt-2 text-sm text-muted">{caption}</figcaption>}
		</figure>
	) : href !== "#" ? (
		<p class="my-4">
			<a href={href} rel="noopener noreferrer" target="_blank">{caption || node.url}</a>
		</p>
	) : null
}
```

`packages/web9-blocks/astro/index.mjs`：加两行 import，并在 `blockComponents` 里登记：

```js
import Embed from "./Embed.astro";
import HtmlBlock from "./HtmlBlock.astro";
```

```js
	// Overrides of core renderers (plugin components win over core's, spec §10)
	htmlBlock: HtmlBlock,
	embed: Embed,
```

覆盖顺序是 core < 插件 `blockComponents` < 调用处的 `components` prop（`emdash/src/components/PortableText.astro:48-52`），所以三个 `PortableText` 调用处（`DocsPage.astro`、`posts/[slug].astro`、`pages/[slug].astro`）都会用 web9 的版本。

- [ ] **Step 7: 🚦 在 workerd 里实测 guard 和覆盖**

dev 要在运行（Task 1 起一直在跑；改了插件代码后 dev 会自动重载，如果 hook 行为没变就 `npx astro dev stop` 再 `npm run dev -- --port 4321`）。

```bash
cd /Users/john/git/web9ai
node -e '
const fs = require("fs");
const line = (b) => `<!--ec:block ${JSON.stringify(b)} -->`;
const doc = (slug, blocks) => ({ collection: "docs", slug, locale: "en", status: "published",
  data: { title: slug, section: "ai", category: "probe", sort_order: 999999, body: ["probe body", ...blocks.map(line)].join("\n\n") + "\n" } });
fs.writeFileSync(".local/guard-html.json", JSON.stringify(doc("probe-guard-html", [{ _type: "htmlBlock", _key: "h1", html: "<div class=\"fixed inset-0 z-50\">x</div>" }])));
fs.writeFileSync(".local/guard-cover.json", JSON.stringify(doc("probe-guard-cover", [{ _type: "cover", _key: "c1", minHeight: "300px;position:fixed;inset:0;z-index:99999" }])));
fs.writeFileSync(".local/guard-ok.json", JSON.stringify(doc("probe-guard-ok", [
  { _type: "callout", _key: "c2", tone: "tip", title: "Probe", body: "zebraquartz" },
  { _type: "embed", _key: "e1", url: "https://www.youtube.com/watch?v=SKS-URw9a18" },
])));
fs.writeFileSync(".local/guard-post.json", JSON.stringify({ collection: "posts", slug: "probe-guard-post", locale: "en", status: "published",
  data: { title: "probe post", content: ["post body", line({ _type: "callout", _key: "c3", tone: "info", title: "", body: "yakpelican" })].join("\n\n") + "\n" } }));
'
node scripts/mcp.mjs content_create @.local/guard-html.json; echo "exit=$?"
node scripts/mcp.mjs content_create @.local/guard-cover.json; echo "exit=$?"
node scripts/mcp.mjs content_create @.local/guard-ok.json > /dev/null; echo "exit=$?"
node scripts/mcp.mjs content_create @.local/guard-post.json > /dev/null; echo "exit=$?"
node scripts/check-page.mjs http://localhost:4321/docs/probe-guard-ok "zebraquartz" "youtube-nocookie.com/embed/SKS-URw9a18" --absent "ec:block"
node scripts/mcp.mjs content_get '{"collection":"posts","id":"probe-guard-post"}' | node -e "const g=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('post search_text:',JSON.stringify(g.item.data.search_text))"
node scripts/mcp.mjs search '{"query":"yakpelican","collections":["posts"]}'
```

Expected：
- 前两个 `content_create` 失败（exit 非 0），错误信息分别包含 `body: #1 htmlBlock` 和 `body: #1 cover minHeight`，并且 `content_list` 里没有这两个 slug；
- 后两个成功（exit 0）；
- `check-page` 通过（callout 文字在，YouTube iframe 指向 `youtube-nocookie.com`）；
- post 的 `search_text` 是 `"yakpelican"`，`search` 能搜到这篇 post（posts 的块文字现在也进索引）。

如果 MCP 的 Markdown 转换把 `ec:block` 行放在了别的下标，错误信息里的 `#1` 可能是别的数字：只要信息里有 `htmlBlock` / `cover minHeight` 就算通过。任何一项不符：停下来报告。

清理探针内容（runner 之后要从空库开始）：

```bash
for s in probe-guard-ok; do node scripts/mcp.mjs content_delete "{\"collection\":\"docs\",\"id\":\"$s\"}" && node scripts/mcp.mjs content_permanent_delete "{\"collection\":\"docs\",\"id\":\"$s\"}"; done
node scripts/mcp.mjs content_delete '{"collection":"posts","id":"probe-guard-post"}' && node scripts/mcp.mjs content_permanent_delete '{"collection":"posts","id":"probe-guard-post"}'
node scripts/mcp.mjs content_list '{"collection":"docs"}'
node scripts/mcp.mjs content_list '{"collection":"posts"}'
```

Expected：两个列表都是空的。如果 `content_permanent_delete` 要求 ULID 而不是 slug，先 `content_list_trashed` 取 `id` 再删。

- [ ] **Step 8: 更新 skill 和 spec**

`.agents/skills/web9-blocks/SKILL.md`：
- 把 "Never use `htmlBlock` (…)" 那一段换成：

```markdown
The site rejects some blocks on save (`SAVE_REJECTED`, the message lists each problem as `body: #<index> <type> …`):
- `htmlBlock`, `iframe` and any `_type` not listed in this file;
- an `embed` with `html` (an `embed` takes only `url`; YouTube and Vimeo render as a player, anything else as a link);
- core block fields outside their allowed values: `image.alignment` (left, center, right, wide, full), colours that are not `#hex`/`rgb()`, `cover.minHeight` other than a plain length, `code.language` with spaces, `tool_grid.logo_size` outside 16–300.
Fix the block and send the save again; never try to get around the check.
```

- 在 "Create and publish a doc" 一节的 `search_text` 那条后面加一条：`- Posts and pages work the same way: their block text also goes into an auto-generated \`search_text\` (field \`content\` instead of \`body\`).`

spec：
- §4 第一条"已实现并验证（计划 1 Task 9）"后面加一条："**已定（计划 2 Task 3）**：`posts.content`、`pages.content` 也用同一个 hook 写 `search_text`（hook 里的 collection → 字段映射 `{docs: body, posts: content, pages: content}`）。搜索只搜当前语言：zh-CN 页面上搜不到还没翻译的 en doc，接受（fallback 页面本来就是 en 内容）。"
- §8 "AI 写内容的方式"列表最后加一条："写入时 guard：hook 拒绝 `htmlBlock`、`iframe`、带 `html` 的 `embed`、未知 `_type` 和 core 块里会被拼进 `class`/`style` 的非法字段值（计划 2 Task 3），错误码 `SAVE_REJECTED`。"
- §10 "AI 直接发布的 Markdown / HTML"一行的应对一栏，把最后两个 `•`（"目前的不变式……"和"长期的控制……"）换成：

```
• **三层控制（计划 2 落地，必须在创建 AI Editor 账号之前）**：① 写入时 `content:beforeSave` 里的 PT guard（拒绝 `htmlBlock`、`iframe`、带 `html` 的 `embed`、未知类型，以及 `cover.minHeight`、`image.dominantColor`、`columns[].width`、`button.style`、`code.language` 等会被 core renderer 原样拼进 `style`/`class` 的字段值）；② 渲染时 web9 的 `htmlBlock`/`embed` renderer 覆盖 core（`sanitizeHtmlFragment` 去掉 class/id/data-*/style；`isolated` 直接忽略，不交给 core 的 srcdoc iframe，因为它能在点击时导航顶层页面）；③ 构建后 `check-public-css`：公开页面加载的 CSS 里不能有 `fixed`、`inset-*`、`z-*`、`*-screen`、视口单位这类 utility（emdash 后台的样式表只在 `/_emdash/admin` 加载，按来源排除）<br>• `data-*` 必须去掉：Astro 的 scoped CSS 选择器是 `[data-astro-cid-*]`，`class` + `data-astro-cid-*` 能复用公开 CSS 里任何组件规则（例如 `.emdash-cover__background{position:absolute;inset:0}`）
```

- [ ] **Step 9: Commit**

```bash
git add packages/web9-blocks/ .agents/skills/web9-blocks/SKILL.md docs/superpowers/specs/2026-10-15-emdash-migration-design.md
git commit -m "feat(blocks): PT guard on save for docs/posts/pages, search_text for posts and pages, web9 htmlBlock and embed renderers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 4: 方案 B 主题 token + `Base.astro` 改 Tailwind + `WebMcpSearch` + 菜单链接本地化

**模型：** standard

计划 1 实测：生产构建（Lightning CSS minify）把 `light-dark()` 降级成 `prefers-color-scheme` 变量（`--lightningcss-light/-dark`），页脚的手动切换在构建产物里不起作用。owner 选了方案 B：显式 token，不再用 `light-dark()`。同时把 `Base.astro` 的页头、页脚改成 Tailwind（spec §11 的分期改为：计划 2 只重写 `Base.astro`）。

**Files:**
- Create: `packages/web9-site/lib/nav.mjs`、`nav.test.mjs`、`packages/web9-site/theme.test.mjs`
- Modify: `src/styles/global.css`、`src/styles/tokens.css`、`src/styles/theme.css`、`src/layouts/Base.astro`（整个重写）、`CLAUDE.md`、`AGENTS.md`、spec §11

**Interfaces:**
- Produces:
  - `localizeHref(href: string, locale: string) → string`：`locale` 不是 `en` 时，`/` → `/<locale>/`，`/docs/...` → `/<locale>/docs/...`；其他（`/posts`、外链、`#…`）原样返回。
  - 主题：`<html>` 上的 `light` / `dark` class（cookie `theme` 决定，页脚按钮切换）；没有 class 时跟随系统。颜色 token 名不变。
  - 页脚主题按钮：`button[data-theme-btn="light|dark|system"]`，当前项 `aria-pressed="true"`。
  - 每个公开页面的 `<body>` 里有 `<emdash-webmcp-search>`。

- [ ] **Step 1: 写失败的测试**

Create `packages/web9-site/lib/nav.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { localizeHref } from "./nav.mjs";

describe("localizeHref", () => {
	it("leaves every link alone on en pages", () => {
		expect(localizeHref("/", "en")).toBe("/");
		expect(localizeHref("/docs/intro", "en")).toBe("/docs/intro");
	});
	it("prefixes the routes that exist in zh-CN", () => {
		expect(localizeHref("/", "zh-CN")).toBe("/zh-CN/");
		expect(localizeHref("/docs/intro", "zh-CN")).toBe("/zh-CN/docs/intro");
	});
	it("keeps links without a zh-CN route", () => {
		for (const href of ["/posts", "/tag/ai", "/search", "https://github.com/TouchMarsSolutions/web9ai", "#top", "/docsx"]) {
			expect(localizeHref(href, "zh-CN")).toBe(href);
		}
	});
});
```

Create `packages/web9-site/theme.test.mjs`：

```js
// Theme B (spec §11): light values in @theme static, dark values in :root.dark and in
// @media (prefers-color-scheme: dark) :root:not(.light). Production minify lowers light-dark(), so it
// must not come back.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = read("src/styles/global.css");
const decls = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
function body(re) {
	const m = re.exec(css);
	if (!m) throw new Error(`block not found: ${re}`);
	return m[1];
}

describe("theme B tokens", () => {
	const light = decls(body(/@theme static \{([^}]*)\}/));
	const dark = decls(body(/:root\.dark \{([^}]*)\}/));
	const media = decls(body(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\.light\) \{([^}]*)\}/));
	it("uses the same dark palette for the toggle and for the OS preference", () => {
		expect(media).toEqual(dark);
	});
	it("gives every light colour a dark value, except the ones derived from others", () => {
		const own = Object.keys(light).filter((k) => !["--color-on-brand", "--color-brand-ring"].includes(k));
		expect(Object.keys(dark).sort()).toEqual(own.sort());
		expect(light["--color-bg"]).toBe("#ffffff");
		expect(dark["--color-bg"]).toBe("#0d0d0d");
	});
	it("uses no light-dark() in site CSS", () => {
		for (const p of ["src/styles/global.css", "src/styles/tokens.css", "src/styles/theme.css", "src/layouts/Base.astro", "packages/web9-blocks/astro/blocks.css"]) {
			expect(read(p), p).not.toContain("light-dark(");
		}
	});
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run packages/web9-site/`
Expected: FAIL：`nav.mjs` 不存在；`:root.dark` 块找不到；`light-dark(` 还在。

- [ ] **Step 3: `localizeHref`**

Create `packages/web9-site/lib/nav.mjs`：

```js
// Site-relative links that have a zh-CN route get the locale prefix on zh-CN pages (spec §5).
// Only the home page and docs exist in zh-CN; posts, tags, search and external links stay as they are.
export function localizeHref(href, locale) {
	if (typeof href !== "string" || !locale || locale === "en") return href;
	if (href === "/") return `/${locale}/`;
	if (href.startsWith("/docs/")) return `/${locale}${href}`;
	return href;
}
```

- [ ] **Step 4: 主题 token**

`src/styles/global.css`：把从 `/*\n * Template color tokens` 开始、到 `@theme static { … }` 结束的这一段（注释 + `@theme static` 块）换成：

```css
/*
 * Template color tokens, names unchanged, exposed as utilities (bg-surface, text-muted, border-border...).
 * Theme B (spec §11): light values here; dark values below. Never use the `dark:` variant: the footer
 * switcher sets html.light / html.dark, which `dark:` would not see.
 * `static` keeps every variable on :root because template CSS outside Tailwind reads them too.
 */
@theme static {
	--color-bg: #ffffff;
	--color-bg-subtle: #fafafa;
	--color-text: #1a1a1a;
	--color-text-secondary: #525252;
	--color-muted: #8b8b8b;
	--color-border: #e5e5e5;
	--color-border-subtle: #f0f0f0;
	--color-surface: #f7f7f7;
	--color-brand: #0066cc;
	--color-brand-hover: #0052a3;
	--color-on-brand: white;
	--color-brand-ring: color-mix(in srgb, var(--color-brand) 25%, transparent);
}

/*
 * Dark palette. Tailwind puts @theme into @layer theme; these rules are unlayered, so they win.
 * html.dark = explicit choice; no class = follow the OS; html.light = explicit light.
 * Keep the two blocks identical (packages/web9-site/theme.test.mjs).
 */
:root {
	color-scheme: light;
}

:root.dark {
	color-scheme: dark;
	--color-bg: #0d0d0d;
	--color-bg-subtle: #141414;
	--color-text: #ededed;
	--color-text-secondary: #a0a0a0;
	--color-muted: #6b6b6b;
	--color-border: #2a2a2a;
	--color-border-subtle: #1f1f1f;
	--color-surface: #181818;
	--color-brand: #4d9fff;
	--color-brand-hover: #6eb0ff;
}

@media (prefers-color-scheme: dark) {
	:root:not(.light) {
		color-scheme: dark;
		--color-bg: #0d0d0d;
		--color-bg-subtle: #141414;
		--color-text: #ededed;
		--color-text-secondary: #a0a0a0;
		--color-muted: #6b6b6b;
		--color-border: #2a2a2a;
		--color-border-subtle: #1f1f1f;
		--color-surface: #181818;
		--color-brand: #4d9fff;
		--color-brand-hover: #6eb0ff;
	}
}

/* Page defaults that used to live in Base.astro's global style (Tailwind preflight covers the resets). */
@layer base {
	html {
		scroll-behavior: smooth;
	}
	body {
		font-family: var(--font-body);
		font-size: var(--font-size-base);
		line-height: var(--leading-relaxed);
		color: var(--color-text);
		background: var(--color-bg);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		min-height: 100vh;
	}
	a:where(:not([class*="emdash"]):not([class*="ec-"])) {
		color: var(--color-brand);
		text-decoration: none;
		transition: color var(--transition-fast);
	}
	a:where(:not([class*="emdash"]):not([class*="ec-"])):hover {
		color: var(--color-brand-hover);
	}
	h1,
	h2,
	h3,
	h4,
	h5,
	h6 {
		font-family: var(--font-heading);
		line-height: var(--leading-tight);
		font-weight: var(--font-weight-heading);
		letter-spacing: var(--tracking-snug);
	}
	h1 {
		font-weight: var(--font-weight-display);
		letter-spacing: var(--tracking-tight);
	}
	::selection {
		background: var(--color-brand);
		color: var(--color-on-brand);
	}
}
```

（`.prose` 那段 `@layer utilities` 保持不动，放在这些规则后面。）

`src/styles/tokens.css`：
- 删掉 `:root` 里的 `color-scheme: light dark;` 这一行；
- 删掉文件末尾整个 `@supports not (color: light-dark(#000, #fff)) { … }` 块（连同它上面的注释）；
- 文件头注释里 "Colors use light-dark(): …… keep them distinct." 这一段换成：

```
  Colors are not defined here: they live in src/styles/global.css
  (light values in @theme static, dark values in :root.dark and in
  @media (prefers-color-scheme: dark) :root:not(.light)).
```

`src/styles/theme.css`：头注释里 "Colors are defined with light-dark(). …… to set different values per mode." 换成：

```
  Colors: set the light value in :root here, and the dark value in
  both :root.dark and @media (prefers-color-scheme: dark)
  { :root:not(.light) { ... } } (see global.css).
```

示例里的 `--color-brand: light-dark(#0f766e, #2dd4bf);` 换成 `--color-brand: #0f766e;`。

- [ ] **Step 5: 重写 `src/layouts/Base.astro`**

整个文件替换成下面的内容。Props、标题拼接、`createPublicPageContext` 和主题脚本的行为都不变；样式改成 Tailwind utility；需要层级（`z-index`）或视口单位的部分留在 scoped `<style>`，因为公开 utility 里不能出现 `z-*`、`*-screen`、视口单位（Task 5 的检查）。

```astro
---
import { getMenuWithCacheHint, getSiteSettingsWithCacheHint } from "emdash";
import { WidgetArea, EmDashHead, EmDashBodyStart, EmDashBodyEnd } from "emdash/ui";
import { createPublicPageContext } from "emdash/page";
import LiveSearch from "emdash/ui/search";
import WebMcpSearch from "emdash/ui/webmcp-search";
import { Font } from "astro:assets";
import { localizeHref } from "../../packages/web9-site/lib/nav.mjs";
import { resolveBlogSiteIdentity } from "../utils/site-identity";
import "../styles/global.css";
import "../styles/tokens.css";
import "../styles/theme.css";

interface Props {
	title: string;
	pageTitle?: string | null;
	description?: string | null;
	image?: string | null;
	canonical?: string | null;
	robots?: string | null;
	type?: "website" | "article";
	publishedTime?: string | null;
	modifiedTime?: string | null;
	author?: string | null;
	/** Pass content reference for plugin page contributions on content pages */
	content?: { collection: string; id: string; slug?: string | null };
}

const { title, pageTitle, description, image, canonical, robots, type = "website", publishedTime, modifiedTime, author, content } =
	Astro.props;
const [settingsResult, menuResult] = await Promise.all([getSiteSettingsWithCacheHint(), getMenuWithCacheHint("primary")]);
if (Astro.cache?.enabled) {
	Astro.cache.set(settingsResult.cacheHint);
	Astro.cache.set(menuResult.cacheHint);
}

const { siteTitle, siteTagline, siteLogo } = resolveBlogSiteIdentity(settingsResult.data);
const titleIncludesSiteName = title === siteTitle || title.endsWith(` | ${siteTitle}`) || title.endsWith(` — ${siteTitle}`);
const fullTitle = titleIncludesSiteName ? title : `${title} — ${siteTitle}`;

const locale = Astro.currentLocale ?? "en";
const localePrefix = locale === "en" ? "" : `/${locale}`;
// One en menu; on zh-CN pages links that have a zh-CN route get the prefix (spec §5).
const menuItems = (menuResult.data?.items ?? []).map((item) => ({ ...item, href: localizeHref(item.url, locale) }));
const homeHref = localizeHref("/", locale);

// Build public page context for plugin contributions; SEO data is rendered securely by EmDashHead
const pageCtx = createPublicPageContext({
	Astro,
	kind: content ? "content" : "custom",
	pageType: type,
	title: fullTitle,
	pageTitle: pageTitle ?? title,
	description,
	canonical,
	image,
	content,
	seo: { ogImage: image, robots },
	articleMeta: { publishedTime, modifiedTime, author },
	siteName: siteTitle,
	// Absolute URLs in head (hreflang alternates) use the canonical origin, never the request Host
	siteUrl: Astro.site?.origin,
});

const isLoggedIn = !!Astro.locals.user;

const THEME_BUTTONS = [
	{ theme: "light", label: "Light mode" },
	{ theme: "dark", label: "Dark mode" },
	{ theme: "system", label: "System theme" },
];
const ICONS: Record<string, string> = {
	light:
		'<circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>',
	dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',
	system: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><path d="M8 21h8M12 17v4"></path>',
};
const linkRel = (target?: string | null) => (target === "_blank" ? "noopener noreferrer" : undefined);
---

<!doctype html>
<html lang={locale}>
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<Font cssVariable="--font-body" preload />
		<Font cssVariable="--font-mono" />
		<title>{fullTitle}</title>
		<EmDashHead page={pageCtx} />
		<script is:inline>
			// Apply an explicit theme choice before first paint. With no cookie the OS preference decides
			// (global.css: @media (prefers-color-scheme: dark) :root:not(.light)).
			(function () {
				var row = document.cookie.split("; ").find(function (item) {
					return item.startsWith("theme=");
				});
				var theme = row ? row.slice(6) : null;
				if (theme === "dark" || theme === "light") document.documentElement.classList.add(theme);
			})();
		</script>
	</head>
	<body>
		<EmDashBodyStart page={pageCtx} />
		<header class="site-header border-b border-border-subtle">
			<nav class="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:h-16 sm:flex-nowrap sm:px-6 sm:py-0">
				<a href={homeHref} class="text-lg font-semibold tracking-tight text-text hover:text-brand">
					{siteLogo ? <img src={siteLogo.url} alt={siteLogo.alt || siteTitle} class="-my-2 block h-12 w-auto" /> : siteTitle}
				</a>
				<div class="flex w-full flex-wrap items-center gap-x-5 gap-y-2 sm:ms-auto sm:w-auto sm:flex-nowrap sm:gap-x-6">
					<LiveSearch
						placeholder="Search..."
						class="site-search"
						inputClass="site-search-input"
						resultsClass="site-search-results"
						resultClass="site-search-result"
						collections={["docs", "posts", "pages"]}
						routeMap={{ docs: `${localePrefix}/docs/:slug` }}
					/>
					<div class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
						{
							menuItems.map((item) => (
								<a class="text-text hover:text-brand" href={item.href} target={item.target} rel={linkRel(item.target)}>
									{item.label}
								</a>
							))
						}
					</div>
					{isLoggedIn && <a href="/_emdash/admin" class="text-sm text-text-secondary hover:text-text">Admin</a>}
				</div>
			</nav>
		</header>
		<WebMcpSearch collections={["docs", "posts", "pages"]} routeMap={{ docs: `${localePrefix}/docs/:slug` }} />

		<main class="site-main">
			<slot />
		</main>

		<footer class="border-t border-border-subtle bg-bg-subtle">
			<div class="mx-auto max-w-[1200px] px-6 pt-16 pb-8">
				<div class="mb-12 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-12 lg:grid-cols-[2fr_1fr_1fr_1fr]">
					<div class="max-w-[280px] sm:col-span-2 lg:col-span-1">
						<a href={homeHref} class="text-lg font-semibold tracking-tight text-text">
							{siteLogo ? <img src={siteLogo.url} alt={siteLogo.alt || siteTitle} class="h-6 w-auto" /> : siteTitle}
						</a>
						<p class="mt-3 text-sm text-muted">{siteTagline}</p>
					</div>
					<div>
						<h2 class="mb-4 text-xs font-medium tracking-wider text-muted uppercase">Navigate</h2>
						<ul class="space-y-2 text-sm">
							{
								menuItems.map((item) => (
									<li>
										<a class="text-text-secondary hover:text-text" href={item.href} target={item.target} rel={linkRel(item.target)}>
											{item.label}
										</a>
									</li>
								))
							}
						</ul>
					</div>
					<div>
						<h2 class="mb-4 text-xs font-medium tracking-wider text-muted uppercase">Connect</h2>
						<ul class="space-y-2 text-sm">
							<li><a class="text-text-secondary hover:text-text" href="/rss.xml">RSS Feed</a></li>
						</ul>
					</div>
					<div class="text-sm text-text-secondary">
						<WidgetArea name="footer" />
					</div>
				</div>
				<div class="flex flex-col items-center gap-4 border-t border-border pt-6 text-center sm:flex-row sm:justify-between sm:text-left">
					<p class="text-sm text-muted">Powered by <a class="text-text-secondary" href="https://emdashcms.com">EmDash</a></p>
					<div class="flex gap-1 rounded bg-surface p-1" role="group" aria-label="Theme">
						{
							THEME_BUTTONS.map((b) => (
								<button
									type="button"
									data-theme-btn={b.theme}
									aria-label={b.label}
									aria-pressed="false"
									class="flex h-7 w-8 cursor-pointer items-center justify-center rounded text-muted hover:text-text-secondary aria-pressed:bg-bg aria-pressed:text-text aria-pressed:shadow-sm"
								>
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
										set:html={ICONS[b.theme]}
									/>
								</button>
							))
						}
					</div>
				</div>
			</div>
		</footer>

		<script>
			// Theme switcher: html.light / html.dark plus a `theme` cookie; "system" removes both.
			const themeBtns = document.querySelectorAll<HTMLButtonElement>("[data-theme-btn]");
			const root = document.documentElement;

			function setCookie(name: string, value: string, maxAge: number = 31536000) {
				const secure = location.protocol === "https:" ? "; Secure" : "";
				document.cookie =
					value === ""
						? `${name}=; path=/; max-age=0; SameSite=Lax${secure}`
						: `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
			}

			function setTheme(theme: string) {
				root.classList.remove("light", "dark");
				if (theme === "system") setCookie("theme", "");
				else {
					setCookie("theme", theme);
					root.classList.add(theme);
				}
				themeBtns.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.themeBtn === theme)));
			}

			const stored = document.cookie.split("; ").find((item) => item.startsWith("theme="))?.slice(6) || "system";
			setTheme(stored);
			themeBtns.forEach((btn) => btn.addEventListener("click", () => setTheme(btn.dataset.themeBtn || "system")));

			// ⌘K / Ctrl+K focuses search
			document.addEventListener("keydown", (e) => {
				if ((e.metaKey || e.ctrlKey) && e.key === "k") {
					e.preventDefault();
					document.querySelector<HTMLInputElement>(".site-search-input")?.focus();
				}
			});
		</script>

		<style>
			/*
			 * Chrome that needs stacking or viewport units stays in scoped CSS: public utilities must never
			 * include fixed, inset-*, z-*, *-screen or viewport units (spec §10, scripts/check-public-css.mjs).
			 */
			.site-header {
				position: sticky;
				top: 0;
				z-index: 100;
				background: color-mix(in srgb, var(--color-bg) 65%, transparent);
				backdrop-filter: blur(12px);
				-webkit-backdrop-filter: blur(12px);
			}
			.site-main {
				min-height: calc(100vh - 64px - 300px);
			}
			@media (max-width: 640px) {
				.site-header {
					position: relative;
				}
			}

			/* LiveSearch renders its own markup; these class names are passed to it as props. */
			.site-search {
				position: relative;
				width: 180px;
				--emdash-search-border-focus: var(--color-brand);
			}
			:global(.site-search-input) {
				width: 180px;
				padding: 0.5rem 0.75rem;
				font-family: var(--font-body);
				font-size: 0.875rem;
				border: 1px solid var(--color-border);
				border-radius: 4px;
				background: var(--color-bg);
				color: var(--color-text);
				transition:
					border-color 120ms ease,
					box-shadow 120ms ease;
			}
			:global(.site-search-input)::placeholder {
				color: var(--color-muted);
			}
			:global(.site-search-input):focus,
			:global(.site-search-input):focus-visible {
				outline: none;
				border-color: var(--color-brand) !important;
				box-shadow: 0 0 0 3px var(--color-brand-ring);
			}
			:global(.site-search-results) {
				position: absolute;
				top: 100%;
				left: 0;
				right: 0;
				margin-top: 0.5rem;
				background: var(--color-bg);
				border: 1px solid var(--color-border);
				border-radius: 8px;
				box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
				max-height: 400px;
				overflow-y: auto;
				z-index: 1000;
			}
			:global(.site-search-results .emdash-live-search-loading),
			:global(.site-search-results .emdash-live-search-no-results) {
				padding: 1rem;
				text-align: center;
				color: var(--color-muted);
				font-size: 0.875rem;
			}
			:global(.site-search-result) {
				display: block;
				padding: 0.75rem 1rem;
				color: var(--color-text);
				border-bottom: 1px solid var(--color-border-subtle);
				transition: background 120ms ease;
			}
			:global(.site-search-result):last-child {
				border-bottom: none;
			}
			:global(.site-search-result):hover,
			:global(.site-search-result):focus,
			:global(.site-search-result.focused) {
				background: var(--color-surface);
				outline: none;
			}
			:global(.site-search-result .emdash-live-search-result-title) {
				display: block;
				font-weight: 500;
				font-size: 0.875rem;
			}
			:global(.site-search-result .emdash-live-search-result-collection) {
				display: block;
				font-size: 0.8125rem;
				color: var(--color-muted);
				text-transform: uppercase;
				letter-spacing: 0.06em;
				margin-top: 2px;
			}
			:global(.site-search-result .emdash-live-search-result-snippet) {
				display: block;
				font-size: 0.875rem;
				color: var(--color-muted);
				margin-top: 0.25rem;
				line-height: 1.3;
			}
			:global(.site-search-result .emdash-live-search-result-snippet mark) {
				font-weight: 600;
				color: var(--color-text);
			}
			@media (max-width: 640px) {
				.site-search,
				:global(.site-search-input) {
					width: 100%;
				}
			}
		</style>
		<EmDashBodyEnd page={pageCtx} />
	</body>
</html>
```

`theme.css` 里的 `.nav-admin` 规则已经没有对应的元素了（Admin 链接用 utility），删掉那条规则和它的注释。

- [ ] **Step 6: 跑测试**

Run: `npm test`
Expected: PASS。

- [ ] **Step 7: 页面检查**

本地库是空的（Task 1 重建），先看不依赖内容的页面：

```bash
node scripts/check-page.mjs http://localhost:4321/ "Web9.AI" "emdash-webmcp-search" 'data-theme-btn="dark"' "square of web3 to the power of AI" --absent "light-dark("
node scripts/check-page.mjs http://localhost:4321/posts "emdash-webmcp-search" 'data-theme-btn="system"'
node scripts/check-page.mjs http://localhost:4321/search "emdash-webmcp-search"
```

Expected：三个都 exit 0。

再在浏览器里确认手动切换（CDP，page 8；dev 里没有 Lightning CSS 降级，这一步验证的是 class 和 token 的接线，构建产物在 Task 5 检查）：`navigate_page` 到 `http://localhost:4321/`，然后 `evaluate_script`：

```js
() => {
	const html = document.documentElement;
	const bg = () => getComputedStyle(document.body).backgroundColor;
	html.classList.remove("light", "dark");
	html.classList.add("dark");
	const dark = bg();
	html.classList.replace("dark", "light");
	const light = bg();
	html.classList.remove("light");
	return { dark, light, webmcp: !!document.querySelector("emdash-webmcp-search") };
}
```

Expected：`dark` 是 `rgb(13, 13, 13)`，`light` 是 `rgb(255, 255, 255)`，`webmcp` 是 `true`。再 `take_screenshot` 看一眼页头和页脚（窄屏可以用 `resize_page` 到 390 宽再截一次），确认没有明显错位。

- [ ] **Step 8: 文档**

- `CLAUDE.md` 的 Rules 里，"Styling is Tailwind 4 …" 那条换成：

```markdown
- Styling is Tailwind 4 (`src/styles/global.css`, spec §11). Colors are the template tokens (`bg-surface`, `text-muted`, `border-border`, `text-brand`): light values in `@theme static`, dark values in `:root.dark` and `@media (prefers-color-scheme: dark) { :root:not(.light) }`. Never use the `dark:` variant or `light-dark()` (production minify lowers it and breaks the theme toggle).
```

- `AGENTS.md` "Customisation" 一节里 "Colours are defined with `light-dark(<light>, <dark>)` …… There is no separate dark palette to maintain." 换成："Colours are plain values: light ones in `@theme static` in `src/styles/global.css`, dark ones in `:root.dark` and in `@media (prefers-color-scheme: dark) { :root:not(.light) }` right below it (keep the two dark blocks identical; a test checks it). Never use `light-dark()`: the production CSS minifier lowers it and the footer theme switcher stops working."
- spec §11：
  - "token 用的是 `light-dark()` ……" 和 "注意：生产构建 …… 修法是计划 2 的事项" 两个子条目换成一条："**已定（owner，2026-10-15，方案 B）**：token 用显式值，浅色在 `@theme static`，深色在 `:root.dark` 和 `@media (prefers-color-scheme: dark) { :root:not(.light) }`（不分层，所以覆盖 Tailwind 的 `@layer theme`）。不用 `light-dark()`：生产构建的 Lightning CSS 会把它降级成 `--lightningcss-light/-dark`，手动切换失效（计划 1 实测）。验收：公开 CSS 里没有 `var(--lightningcss-light` / `var(--lightningcss-dark` 的使用（计划 2 Task 5 的检查脚本强制；Lightning CSS 会在每个 `color-scheme` 声明旁边自动加 `--lightningcss-light: ;` 这类定义，这些定义无害，不算）。"
  - 最后一条"分期"换成："分期（2026-10-15 修订）：计划 1 把 docs 页面和 web9 块改成 Tailwind；计划 2 只重写 `Base.astro`（页头、页脚、主题），`posts/[slug]` 只给正文容器加 `prose`；blog 列表和文章页的整体重写留给以后的样式计划，在此之前模板 blog 页面可能有 preflight 带来的细小样式差异。"

- [ ] **Step 9: Commit**

```bash
git add packages/web9-site/ src/styles/ src/layouts/Base.astro CLAUDE.md AGENTS.md docs/superpowers/specs/2026-10-15-emdash-migration-design.md
git commit -m "feat(theme): explicit light/dark tokens (theme B), Base layout in Tailwind, WebMcpSearch, zh-CN menu links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 5: 构建后检查公开 CSS（`check-public-css`）⏹🚦

**模型：** standard

安全的第三层（spec §10）：公开页面加载的 CSS 里不能有能拼出全屏遮罩的 utility（`fixed`、`inset-*`、`z-*`、`*-screen`、视口单位）或 `position: fixed` 声明；同时强制方案 B 的验收（没有被降级的 `light-dark()`）。只读构建产物，不碰 dev server 和数据库。原型已在计划 1 的构建产物上跑过（调研 `p2-research-1-security.md` §4）。

怎么区分公开 CSS 和后台 CSS：
- Astro 的 SSR manifest 被打包进 `dist/server/chunks/*.mjs`，形如 `deserializeManifest({"rootDir":…,"routes":[{routeData, styles:[{type:"external",src}|{type:"inline",content}]}]})`。每个公开 page route（不在 `/_emdash` 下）加载的样式表都从这里来。
- emdash 后台的样式表是一个 `?url` 导入，Rolldown 在它上面留了 `//#region node_modules/@emdash-cms/admin/dist/styles.css?url` 标记，按这个来源判定为"只在后台用"。
- `dist/client` 里每个 CSS 文件都必须能归类：被公开 route 加载 / 和某个 inline 样式内容相同 / 后台 `?url`。归不了类就失败（fail closed）。Astro 内部结构变了、manifest 找不到，同样失败。

计划 1 的构建产物实测：5 个 CSS 文件都能归类；`Base.*.css` 里有 11 条 `var(--lightningcss-light…)`（来自 `light-dark()` token），所以这个检查在 Task 4 之前的代码上**应当失败**，Task 4 之后应当通过。后台样式表里有 306 条，按来源排除。

**Files:**
- Create: `scripts/lib/public-css.mjs`、`scripts/lib/public-css.test.mjs`、`scripts/check-public-css.mjs`
- Modify: `package.json`（`postcss` 加进 devDependencies，加 `postbuild`、`check:css` 两个 script）、`package-lock.json`

**Interfaces:**
- Consumes: Task 4 的方案 B token（没有它，检查失败）
- Produces:
  - `npm run build` 之后自动跑 `postbuild` → `node scripts/check-public-css.mjs`，失败就让整个 build 失败（计划 3 的 Workers Builds 也用 `npm run build`，所以部署同样被拦住）。
  - `npm run check:css [-- distDir]`：单独跑检查。
  - `scanSheet({ label, css }) → string[]`、`classifySheets({ manifest, urlImports, clientCss }) → { sheets, report, errors }`、`readServerBundle(sources: string[]) → { manifest, urlImports }`（`scripts/lib/public-css.mjs`）。

- [ ] **Step 1: 写失败的测试**

Create `scripts/lib/public-css.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { classTokens, classifySheets, extractJsonObject, readServerBundle, scanSheet } from "./public-css.mjs";

const sheet = (css) => scanSheet({ label: "t.css", css });

describe("scanSheet", () => {
	it.each([
		[".fixed{position:fixed}", 2],
		[".md\\:fixed{position:fixed}", 2],
		[".inset-0{inset:0}", 1],
		[".-inset-x-2{left:-.5rem}", 1],
		[".z-50{z-index:50}", 1],
		[".h-screen{height:100vh}", 1],
		[".min-h-dvh{min-height:100dvh}", 1],
		[".h-\\[80vh\\]{height:80vh}", 1],
		[".emdash-modal{position:fixed;inset:0}", 1],
		[".\\[position\\:fixed\\]{position:fixed}", 1],
		[":root{--color-bg:var(--lightningcss-light,#fff)var(--lightningcss-dark,#000)}", 1],
	])("flags %s", (css, n) => expect(sheet(css)).toHaveLength(n));
	it.each([
		[".text-brand{color:var(--color-brand)}"],
		[".site-header{position:sticky;top:0;z-index:100}"],
		[".site-main{min-height:calc(100vh - 364px)}"],
		[".size-full{width:100%;height:100%}"],
		[".max-w-\\[1200px\\]{max-width:1200px}"],
		[":root{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light}"],
	])("allows %s", (css) => expect(sheet(css)).toEqual([]));
});

describe("classTokens", () => {
	it("unescapes and drops variants", () => {
		expect(classTokens(".sm\\:h-16 .aria-pressed\\:bg-bg:hover")).toEqual(["h-16", "bg-bg"]);
	});
});

describe("extractJsonObject / readServerBundle", () => {
	it("ignores braces inside strings", () => {
		const src = 'x = f({"a":"}{","b":{"c":1}}); rest }';
		expect(JSON.parse(extractJsonObject(src, src.indexOf("{")))).toEqual({ a: "}{", b: { c: 1 } });
	});
	it("finds the manifest and ?url regions", () => {
		const src = [
			'var _manifest = deserializeManifest({"rootDir":"file:///x/","routes":[]});',
			"//#region node_modules/@emdash-cms/admin/dist/styles.css?url",
			'var styles_default = "/_astro/styles.abc.css";',
		].join("\n");
		const { manifest, urlImports } = readServerBundle(["", src]);
		expect(manifest.rootDir).toBe("file:///x/");
		expect(urlImports).toEqual([{ source: "node_modules/@emdash-cms/admin/dist/styles.css", file: "_astro/styles.abc.css" }]);
	});
});

describe("classifySheets", () => {
	const route = (route, styles, type = "page") => ({ routeData: { type, route }, styles });
	const manifest = {
		routes: [
			route("/", [{ type: "external", src: "_astro/Base.css" }, { type: "inline", content: ".a{}" }]),
			route("/_emdash/admin/[...path]", [{ type: "inline", content: ".admin{position:fixed}" }]),
			route("/api", [], "endpoint"),
		],
	};
	const admin = { source: "node_modules/@emdash-cms/admin/dist/styles.css", file: "_astro/styles.css" };
	it("classifies public, inlined duplicate and admin-only files", () => {
		const clientCss = new Map([
			["_astro/Base.css", ".b{}"],
			["_astro/dup.css", ".a{}"],
			["_astro/styles.css", ".x{position:fixed}"],
		]);
		const out = classifySheets({ manifest, urlImports: [admin], clientCss });
		expect(out.errors).toEqual([]);
		expect(out.report.map(([f, v]) => `${f} ${v.split(" ")[0]}`)).toEqual(["_astro/Base.css public", "_astro/dup.css public", "_astro/styles.css admin"]);
		expect(out.sheets.map((s) => s.label)).toEqual(["_astro/Base.css", "inline style of /"]);
	});
	it("fails closed on an unknown file, a missing file and a missing manifest", () => {
		const out = classifySheets({ manifest, urlImports: [], clientCss: new Map([["_astro/other.css", ".o{}"]]) });
		expect(out.errors).toEqual([
			"route / loads _astro/Base.css, which is not a file in dist/client",
			"_astro/other.css: cannot tell whether public pages load it",
		]);
		expect(classifySheets({ manifest: null, urlImports: [], clientCss: new Map() }).errors).toHaveLength(1);
	});
	it("treats ?url CSS from anywhere but the admin package as public", () => {
		const out = classifySheets({
			manifest,
			urlImports: [{ source: "node_modules/emdash/src/x.css", file: "_astro/x.css" }],
			clientCss: new Map([["_astro/Base.css", ""], ["_astro/x.css", ".fixed{}"]]),
		});
		expect(out.sheets.map((s) => s.label)).toContain("_astro/x.css");
	});
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run scripts/lib/public-css.test.mjs`
Expected: FAIL：`public-css.mjs` 不存在。

- [ ] **Step 3: 实现**

`postcss` 已经是间接依赖（8.5.30），改成直接的 devDependency：

```bash
npm install --save-dev 'postcss@^8.5.30'
```

Create `scripts/lib/public-css.mjs`：

```js
// Pure parts of scripts/check-public-css.mjs (spec §10). The check reads the build output only:
// Astro's SSR manifest (embedded in dist/server as `deserializeManifest({...})`) lists the stylesheets
// each route loads; Rolldown leaves a `//#region <source>.css?url` marker above every `?url` CSS import,
// which is how the admin bundle's stylesheet is told apart from public ones. Anything else fails.
import postcss from "postcss";

/** The JSON object literal that starts at src[start] ("{"), string-aware. */
export function extractJsonObject(src, start) {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < src.length; i++) {
		const c = src[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (c === "\\") escaped = true;
			else if (c === '"') inString = false;
			continue;
		}
		if (c === '"') inString = true;
		else if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
	}
	throw new Error("unbalanced JSON object literal");
}

const MANIFEST_MARK = 'deserializeManifest({"rootDir"';
const URL_REGION = /\/\/#region ([^\n]+?\.css)\?url\nvar \w+ = "([^"]+)"/g;

/** Reads the manifest and the `?url` CSS imports out of the server bundle's source files. */
export function readServerBundle(sources) {
	let manifest = null;
	const urlImports = [];
	for (const src of sources) {
		const at = src.indexOf(MANIFEST_MARK);
		if (!manifest && at >= 0) manifest = JSON.parse(extractJsonObject(src, src.indexOf("{", at)));
		for (const m of src.matchAll(URL_REGION)) urlImports.push({ source: m[1], file: m[2].replace(/^\//, "") });
	}
	return { manifest, urlImports };
}

const isPublicPage = (r) => ["page", "fallback"].includes(r.routeData?.type) && !r.routeData.route.startsWith("/_emdash");
const ADMIN_SOURCE = /^node_modules\/@emdash-cms\/admin\//;

/**
 * Sorts every CSS file in dist/client into public / inlined duplicate / admin-only, and collects the
 * sheets public routes load. `clientCss` maps a path relative to dist/client ("_astro/x.css") to its text.
 * Returns { sheets: [{ label, css }], report: [[file, verdict]], errors: [string] }.
 */
export function classifySheets({ manifest, urlImports, clientCss }) {
	const errors = [];
	if (!manifest?.routes?.length) return { sheets: [], report: [], errors: ["no Astro SSR manifest in dist/server (Astro internals changed?)"] };
	const sheets = new Map();
	const linked = new Set();
	for (const r of manifest.routes.filter(isPublicPage)) {
		for (const s of r.styles ?? []) {
			if (s.type === "inline") {
				sheets.set(`inline:${s.content}`, { label: `inline style of ${r.routeData.route}`, css: s.content });
				continue;
			}
			const file = String(s.src).replace(/^\//, "");
			if (!clientCss.has(file)) {
				errors.push(`route ${r.routeData.route} loads ${s.src}, which is not a file in dist/client`);
				continue;
			}
			linked.add(file);
			sheets.set(`file:${file}`, { label: file, css: clientCss.get(file) });
		}
	}
	const inlineBodies = new Set([...sheets.values()].filter((s) => !linked.has(s.label)).map((s) => s.css));
	const report = [];
	for (const [file, css] of [...clientCss].sort(([a], [b]) => a.localeCompare(b))) {
		const via = urlImports.find((u) => u.file === file);
		if (linked.has(file)) report.push([file, "public (loaded by a public route)"]);
		else if (inlineBodies.has(css)) report.push([file, "public (same text is inlined into a public route)"]);
		else if (via && ADMIN_SOURCE.test(via.source)) report.push([file, `admin only (${via.source}?url)`]);
		else if (via) {
			report.push([file, `public (?url import of ${via.source})`]);
			sheets.set(`file:${file}`, { label: file, css });
		} else {
			report.push([file, "UNKNOWN"]);
			errors.push(`${file}: cannot tell whether public pages load it`);
		}
	}
	return { sheets: [...sheets.values()], report, errors };
}

/** Class-name patterns that let content build a page overlay (spec §10). */
export const CLASS_DENY = [
	[/^fixed$/, "position:fixed utility"],
	[/^-?inset(?:-[xyse])?(?:-|$)/, "inset utility"],
	[/^-?z-/, "z-index utility"],
	[/-screen$/, "*-screen size utility"],
	[/-[sld]?v[hw]$/, "viewport-unit size utility"],
	[/\[[^\]]*\d(?:[sld]?v[hwib]|vmin|vmax)\b/, "arbitrary viewport-unit value"],
];

/** Class names in a selector, unescaped, without variant prefixes (`.md\:fixed` → "fixed"). */
export function classTokens(selector) {
	return [...selector.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\(.)/g, "$1").split(":").pop());
}

/** Problems in one stylesheet: denied class names, position:fixed, and light-dark() lowered by the minifier. */
export function scanSheet({ label, css }) {
	const problems = [];
	postcss.parse(css).walkRules((rule) => {
		for (const selector of rule.selectors ?? []) {
			for (const cls of classTokens(selector)) {
				for (const [re, why] of CLASS_DENY) if (re.test(cls)) problems.push(`${label}: ${selector.slice(0, 100)} (${why})`);
			}
		}
		rule.walkDecls((d) => {
			if (d.prop === "position" && /^fixed\b/i.test(d.value)) problems.push(`${label}: ${rule.selector.slice(0, 100)} (position:fixed)`);
			if (/var\(--lightningcss-(?:light|dark)\b/.test(d.value))
				problems.push(`${label}: ${rule.selector.slice(0, 100)} uses ${d.prop} from a lowered light-dark() (theme B, spec §11)`);
		});
	});
	return problems;
}
```

Create `scripts/check-public-css.mjs`：

```js
#!/usr/bin/env node
// Fails the build when CSS that public pages load could build a page overlay, uses a lowered
// light-dark(), or when a CSS file in dist/client cannot be classified (spec §10, §11).
//
//   node scripts/check-public-css.mjs [distDir]      (runs after `npm run build` as `postbuild`)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifySheets, readServerBundle, scanSheet } from "./lib/public-css.mjs";

const dist = path.resolve(process.argv[2] ?? "dist");
const walk = (dir, ext) =>
	readdirSync(dir, { withFileTypes: true, recursive: true })
		.filter((e) => e.isFile() && e.name.endsWith(ext))
		.map((e) => path.join(e.parentPath, e.name));

const { manifest, urlImports } = readServerBundle(walk(path.join(dist, "server"), ".mjs").map((f) => readFileSync(f, "utf8")));
const clientDir = path.join(dist, "client");
const clientCss = new Map(walk(clientDir, ".css").map((f) => [path.relative(clientDir, f).split(path.sep).join("/"), readFileSync(f, "utf8")]));
const { sheets, report, errors } = classifySheets({ manifest, urlImports, clientCss });
const problems = [...errors, ...sheets.flatMap(scanSheet)];

for (const [file, verdict] of report) console.log(`${verdict === "UNKNOWN" ? "!!" : "ok"}  ${file}  ->  ${verdict}`);
console.log(`scanned ${sheets.length} stylesheets`);
if (problems.length) {
	for (const p of problems) console.error(`check-public-css: ${p}`);
	console.error(`check-public-css: FAILED (${problems.length} problem(s))`);
	process.exit(1);
}
console.log("check-public-css: ok");
```

`package.json` 的 `scripts` 里，在 `"build"` 后面加两行：

```json
		"postbuild": "node scripts/check-public-css.mjs",
		"check:css": "node scripts/check-public-css.mjs",
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test`
Expected: PASS（`public-css.test.mjs` 23 个用例）。

- [ ] **Step 5: ⏹🚦 构建、类型检查、变异测试**

dev server 必须先停（构建和 dev 共用 `.wrangler`、`dist`）：

```bash
cd /Users/john/git/web9ai
npx astro dev stop
npm run build 2>&1 | tail -12
```

Expected：build 成功，最后几行是 `check-public-css` 的报告：每个 CSS 文件一行 `ok …`，没有 `!!`，最后一行 `check-public-css: ok`。
- 如果报 `uses --color-… from a lowered light-dark()`：Task 4 的 token 没改干净，回去修，不要放宽检查。
- 如果报 `UNKNOWN`：先看那个文件是什么、谁加载它，在报告里写清楚；只有确认它不会被公开页面加载时，才在 `classifySheets` 里加一条有依据的归类规则（附注释说明来源）。

```bash
npm run typecheck 2>&1 | tail -5
```

Expected：`0 errors`（Tasks 1–4 改过的 `.astro` 文件都过类型检查）。

变异测试（检查自己会不会失败）：把构建产物复制到 `.local/`（已被 git 忽略），制造三种问题，每种都必须让检查失败：

```bash
rm -rf .local/dist-mutant && cp -R dist .local/dist-mutant
BASE_CSS=$(ls .local/dist-mutant/client/_astro/Base.*.css | head -1)
cp "$BASE_CSS" .local/base.css.orig
printf '\n.fixed{position:fixed}\n' >> "$BASE_CSS"
node scripts/check-public-css.mjs .local/dist-mutant; echo "deny-class exit=$?"
cp .local/base.css.orig "$BASE_CSS"
printf '\n:root{--color-bg:var(--lightningcss-light,#fff) var(--lightningcss-dark,#000)}\n' >> "$BASE_CSS"
node scripts/check-public-css.mjs .local/dist-mutant; echo "lowered-light-dark exit=$?"
cp .local/base.css.orig "$BASE_CSS"
printf '.x{color:red}\n' > .local/dist-mutant/client/_astro/rogue.css
node scripts/check-public-css.mjs .local/dist-mutant; echo "unknown-file exit=$?"
rm -rf .local/dist-mutant .local/base.css.orig
```

Expected：三次都是 `exit=1`，错误信息分别包含 `(position:fixed utility)` 和 `(position:fixed)`、`from a lowered light-dark()`、`_astro/rogue.css: cannot tell whether public pages load it`。任何一次 `exit=0`：检查有漏洞，停下来报告。

重启 dev（数据库在 `.wrangler/state`，不受影响）：

```bash
npm run dev -- --port 4321
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/public-css.mjs scripts/lib/public-css.test.mjs scripts/check-public-css.mjs package.json package-lock.json
git commit -m "feat(build): fail the build when public CSS can build overlays or uses a lowered light-dark()

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 6: converter I：确定性 key、frontmatter、标题、`lang`、4 冒号 admonition、链接改写

**模型：** standard

调研 `p2-research-5-legacy.md` §1c、§5c、§7、§8 找到的问题里，和"整篇文档的元数据和结构"有关的部分在这里修；和具体 JSX 组件有关的（图片、YouTube、tools-gallery、details 里的 Tabs）在 Task 7。

现在的问题：
- `key()` 用 `Math.random()`：同一个文件两次转换，35/35 个文件输出都不一样，runner 没法判断"内容没变、跳过"。
- frontmatter 只认单行 `key: value`：`tags: [a, b]` 是字符串，`draft: true` 是字符串 `"true"`（Task 10 的 posts 要用）。
- 标题取第一个 H1，Docusaurus 是 frontmatter `title` 优先（9 个文件不一样，例如 `05-lambda`：fm "Lambda Labs"，H1 "Lambda Labs GPU Cloud"）。裁决：`title = fm.title ?? H1`，第一个 H1 总是从正文删掉（语料里每篇最多一个 H1，而且都是重复的标题，已逐个检查）。
- `lang` 默认 `"zh"`：en 文档里的 `<InvestmentWarning />` 全变成中文。应由 import 决定：`InvestmentWarning.cn.mdx` → zh，`InvestmentWarning.mdx` → en（en 的 `01_ai_hot_tools` 确实导入 `.cn.mdx`，保持 zh）。
- 4 冒号 admonition（`::::warning Problem:` 包着 `:::info`，en+zh 的 `run_diffusion`、`replicate`、`qblock` 共 6 个文件）不识别：外层变成两段字面文字 `::::warning Problem:` / `::::`，列表散落在外面。callout 正文是 Markdown，不能嵌套 callout，所以拆成两个相邻的 callout。
- `collectUntil` 不认代码块：callout 正文的代码块里如果有一行 `:::`，callout 会提前结束。
- 文档里的相对链接（`./qblock`、`../16-prompt/01-popular-prompt-guide.mdx`）和旧站 URL（`/ai/usecase/ai-tools-adhoc`）原样保留，会 404。这里只加一个 `rewriteHref` 钩子，映射表在 Task 8 由 legacy inventory 生成。

实测（在副本上跑全部 35 个文件）：改完后两次转换逐字节相同，每篇 key 不重复；和改之前相比，只有 6 个 4 冒号文件的块数变化（例如 en `qblock` 25 → 14：13 个散落的段落合进了 "Problem" callout）和 9 个文件的标题变化，其余只是 key 不同。

**Files:**
- Create: `scripts/lib/frontmatter.mjs`、`scripts/lib/frontmatter.test.mjs`、`scripts/lib/fixtures/01_ai_hot_tools.mdx`（复制）
- Modify: `scripts/lib/mdx-to-pt.mjs`、`scripts/lib/mdx-to-pt.test.mjs`、`scripts/convert-mdx.mjs`

**Interfaces:**
- Produces:
  - `parseFrontmatter(src) → { data, body }`（`scripts/lib/frontmatter.mjs`）：`data` 里列表是数组，`true`/`false` 是布尔，整数是 number。
  - `fnv1a(str) → number`、`deriveSlug(frontmatter, path) → string`（`mdx-to-pt.mjs`）。
  - `mdxToBlocks(src, { path, slug?, lang = "en", site = "", rewriteHref = (h) => h }) → { frontmatter, slug, title, blocks }`：docs 和 posts 共用。`slug` 选项覆盖推导出的 slug；`lang` 只在文件没有导入 InvestmentWarning 时使用；`rewriteHref` 对 Markdown 链接 `](href)` 和 `href="…"` 生效（正文段落的 link markDef 和 callout/details/tabs 的 Markdown 正文都会经过它），不认识的 href 必须原样返回。
  - `convertMdx(src, { section = "ai", category = "general", order = 0, ...mdxToBlocks 的选项 }) → { collection: "docs", slug, data: { title, description, section, category, sort_order, body } }`。
  - key 格式：`k<序号 base36><fnv1a(slug:序号) base36 的后 4 位>`，同一个 slug、同样的源文件，key 永远相同。

- [ ] **Step 1: 写失败的测试**

把 golden test 用的文件复制一份（`legacy/` 在 cutover 后会删）：

```bash
mkdir -p scripts/lib/fixtures
cp legacy/docs/ai/88-usecase/01_ai_hot_tools.mdx scripts/lib/fixtures/01_ai_hot_tools.mdx
```

Create `scripts/lib/frontmatter.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter.mjs";

describe("parseFrontmatter", () => {
	it("parses the YAML subset the legacy files use", () => {
		const src = [
			"---",
			"title: AI学习之旅 | 一场AI工具与技能的晚宴",
			"slug: /rundiffusion",
			"description: 'Quoted: with a colon'",
			"sidebar_position: 1",
			"draft: true",
			"tags: [AI, course, 'tiny-course']",
			"keywords:",
			"  - cloud",
			"    - GPU Cloud",
			"image: /cover/01.svg",
			"---",
			"# Body",
		].join("\n");
		const { data, body } = parseFrontmatter(src);
		expect(data).toEqual({
			title: "AI学习之旅 | 一场AI工具与技能的晚宴",
			slug: "/rundiffusion",
			description: "Quoted: with a colon",
			sidebar_position: 1,
			draft: true,
			tags: ["AI", "course", "tiny-course"],
			keywords: ["cloud", "GPU Cloud"],
			image: "/cover/01.svg",
		});
		expect(body).toBe("# Body");
	});
	it("returns the whole source when there is no frontmatter", () => {
		expect(parseFrontmatter("# T\n")).toEqual({ data: {}, body: "# T\n" });
	});
});
```

`scripts/lib/mdx-to-pt.test.mjs`：应用下面的 diff（保存成文件后 `git apply`）。golden test 改读 fixture，加上标题、`lang`、确定性的断言；新增 4 冒号、代码块里的 `:::`、链接改写、key 的测试：

```diff
--- a/scripts/lib/mdx-to-pt.test.mjs
+++ b/scripts/lib/mdx-to-pt.test.mjs
@@ -1,6 +1,6 @@
 import { readFileSync } from "node:fs";
 import { describe, expect, it } from "vitest";
-import { convertMdx, cssObjectToString, parseTabs } from "./mdx-to-pt.mjs";
+import { convertMdx, cssObjectToString, mdxToBlocks, parseTabs } from "./mdx-to-pt.mjs";
 
 describe("cssObjectToString", () => {
 	it("keeps commas inside CSS functions", () => {
@@ -64,10 +64,15 @@
 		expect(convertMdx("# T\n\nhello\n", { path: "a/b/01_hello_world.mdx" }).slug).toBe("hello_world");
 	});
 	it("converts the hot-tools page into the known block mix, tabs in values order", () => {
+		// Copy of legacy/docs/ai/88-usecase/01_ai_hot_tools.mdx, kept so the test survives removing legacy/
+		const src = readFileSync(new URL("./fixtures/01_ai_hot_tools.mdx", import.meta.url), "utf8");
 		const path = "legacy/docs/ai/88-usecase/01_ai_hot_tools.mdx";
-		const { slug, data } = convertMdx(readFileSync(path, "utf8"), { path, section: "ai", category: "usecase", order: 1 });
+		const { slug, data } = convertMdx(src, { path, section: "ai", category: "usecase", order: 2002 });
 		const count = (type) => data.body.filter((b) => b._type === type).length;
 		expect(slug).toBe("ai-tools-adhoc");
+		expect(data.title).toBe("Adhoc GenAI Tools");
+		expect(data.body.filter((b) => b._type === "investment_warning").map((b) => b.lang)).toEqual(["zh", "zh"]);
+		expect(JSON.stringify(convertMdx(src, { path }))).toBe(JSON.stringify(convertMdx(src, { path })));
 		expect(data.body).toHaveLength(51);
 		expect({
 			callout: count("callout"), tool_grid: count("tool_grid"), details: count("details"), tabs: count("tabs"),
@@ -78,4 +83,44 @@
 		expect(tabs.default_tab).toBe(3);
 		expect(JSON.stringify(data.body)).not.toContain("https://www.web9.ai/img/");
 	});
+	it("takes the title from frontmatter first and always drops the first H1", () => {
+		const out = convertMdx("---\ntitle: Lambda Labs\n---\n# Lambda Labs GPU Cloud\n\nhello\n", { path: "a/05-lambda.mdx" });
+		expect(out.data.title).toBe("Lambda Labs");
+		expect(out.data.body.map((b) => b.style)).toEqual(["normal"]);
+		expect(convertMdx("# Only H1\n\nx\n", { path: "a/b.mdx" }).data.title).toBe("Only H1");
+	});
+	it("takes the InvestmentWarning language from its import", () => {
+		const warn = (file) => `import InvestmentWarning from '@site/src/components/invest/${file}';\n\n<InvestmentWarning />\n`;
+		const lang = (src) => convertMdx(src, { path: "a/b.mdx" }).data.body[0].lang;
+		expect(lang(warn("InvestmentWarning.mdx"))).toBe("en");
+		expect(lang(warn("InvestmentWarning.cn.mdx"))).toBe("zh");
+	});
+	it("splits a 4-colon admonition and the callout nested in it into two callouts", () => {
+		const src = "::::warning Problem:\n1. a\n2. b\n\n:::info Solution:\nx\n:::\n::::\n\nafter\n";
+		const body = convertMdx(src, { path: "a/b.mdx" }).data.body;
+		expect(body.map((b) => b._type)).toEqual(["callout", "callout", "block"]);
+		expect(body[0]).toMatchObject({ tone: "warning", title: "Problem:", body: "1. a\n2. b" });
+		expect(body[1]).toMatchObject({ tone: "info", title: "Solution:", body: "x" });
+	});
+	it("does not end a callout at a ::: line inside a code fence", () => {
+		const src = ":::tip T\n```md\n:::\n```\nend\n:::\n";
+		const body = convertMdx(src, { path: "a/b.mdx" }).data.body;
+		expect(body).toHaveLength(1);
+		expect(body[0].body).toBe("```md\n:::\n```\nend");
+	});
+	it("rewrites links in prose and in block bodies", () => {
+		const rewriteHref = (href) => (href === "./qblock" ? "/docs/qblock" : href);
+		const src = "See [q](./qblock) and [x](https://x.example).\n\n:::tip T\nAlso [q](./qblock).\n:::\n";
+		const body = convertMdx(src, { path: "a/b.mdx", rewriteHref }).data.body;
+		expect(body[0].markDefs.map((d) => d.href)).toEqual(["/docs/qblock", "https://x.example"]);
+		expect(body[1].body).toBe("Also [q](/docs/qblock).");
+	});
+	it("gives every block, span and markDef a deterministic key unique within the doc", () => {
+		const src = "# T\n\nA [l](/x) **b**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
+		const keys = (v) => JSON.stringify(v).match(/"_key":"[^"]+"/g);
+		const first = keys(mdxToBlocks(src, { path: "a/b.mdx" }).blocks);
+		expect(keys(mdxToBlocks(src, { path: "a/b.mdx" }).blocks)).toEqual(first);
+		expect(new Set(first).size).toBe(first.length);
+		expect(keys(mdxToBlocks(src, { path: "a/other.mdx" }).blocks)).not.toEqual(first);
+	});
 });
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run scripts/lib/`
Expected: FAIL：`frontmatter.mjs` 不存在、`mdxToBlocks` 没有导出（整个 `mdx-to-pt.test.mjs` 文件导入失败）。

- [ ] **Step 3: 实现**

Create `scripts/lib/frontmatter.mjs`：

```js
// Frontmatter of the legacy Docusaurus files: the small YAML subset they use
// (`key: value`, quoted strings, `[a, b]` lists, `- item` block lists, booleans, integers).
const unquote = (v) => v.replace(/^(['"])([\s\S]*)\1$/, "$2");

function scalar(raw) {
	const v = raw.trim();
	if (v === "true" || v === "false") return v === "true";
	if (/^-?\d+$/.test(v)) return Number(v);
	if (/^\[.*\]$/.test(v))
		return v
			.slice(1, -1)
			.split(",")
			.map((x) => unquote(x.trim()))
			.filter(Boolean);
	return unquote(v);
}

/** `{ data, body }`: the parsed frontmatter and the source after it. Unknown syntax stays a string. */
export function parseFrontmatter(src) {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
	if (!m) return { data: {}, body: src };
	const data = {};
	let listKey = null;
	for (const line of m[1].split(/\r?\n/)) {
		const item = /^\s*-\s+(.*)$/.exec(line);
		if (item && listKey) {
			data[listKey].push(scalar(item[1]));
			continue;
		}
		const kv = /^([\w-]+):\s*(.*)$/.exec(line);
		if (!kv) continue;
		const [, key, value] = kv;
		listKey = value.trim() === "" ? key : null;
		data[key] = listKey ? [] : scalar(value);
	}
	return { data, body: src.slice(m[0].length) };
}
```

`scripts/lib/mdx-to-pt.mjs`：应用下面的 diff（`git apply`）。改动点：文件头注释；新增 `fnv1a`、`deriveSlug`、`rewriteLinks`；`convertMdx` 的主体改名为 `mdxToBlocks`（先算 slug 再生成 key；`lang` 从 import 推导；`mdxToMarkdown` 最后过一遍 `rewriteLinks`）；`collectUntil` 认代码块；扫描器加 4 冒号分支；结尾的标题规则；新的 `convertMdx` 包一层：

```diff
--- a/scripts/lib/mdx-to-pt.mjs
+++ b/scripts/lib/mdx-to-pt.mjs
@@ -9,9 +9,29 @@
 //   <InvestmentWarning />           -> investment_warning
 //   tables with logos/images        -> tool_grid; text-only tables -> core `table`
 //   everything else (prose)         -> standard Portable Text via the marked lexer
+//
+// Output is deterministic: block keys come from the slug and the traversal order (fnv1a), so the
+// same source always gives the same JSON and the migration runner can skip unchanged entries.
 
 import { marked } from "marked";
+import { parseFrontmatter } from "./frontmatter.mjs";
 
+/** 32-bit FNV-1a; no dependencies, same result in Node and workerd. */
+export function fnv1a(str) {
+	let h = 0x811c9dc5;
+	for (let i = 0; i < str.length; i++) {
+		h ^= str.charCodeAt(i);
+		h = Math.imul(h, 0x01000193) >>> 0;
+	}
+	return h >>> 0;
+}
+
+/** Entry slug: frontmatter `slug` (leading "/" dropped, other "/" -> "-"), else the file name without its number prefix. */
+export function deriveSlug(frontmatter, path) {
+	const raw = frontmatter.slug ?? path.split("/").pop().replace(/\.mdx?$/, "").replace(/^\d+[-_]/, "");
+	return String(raw).replace(/^\//, "").replace(/\//g, "-");
+}
+
 /** Split on `sep` at the top level only: separators inside (...) or quotes don't count. */
 export function splitTopLevel(text, sep = ",") {
 	const out = [];
@@ -70,20 +90,37 @@
 	return { tabs, defaultIndex: Math.max(0, tabs.findIndex((t) => t.value === defaultValue)) };
 }
 
+/** Markdown links and href attributes in `text`, passed through `rewriteHref`. */
+function rewriteLinks(text, rewriteHref) {
+	return text
+		.replace(/(\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (_, open, href, close) => `${open}${rewriteHref(href)}${close}`)
+		.replace(/(\bhref=")([^"]+)(")/g, (_, open, href, close) => `${open}${rewriteHref(href)}${close}`);
+}
+
 /**
- * Convert one Docusaurus MDX doc into an EmDash `docs` payload.
- * `site` prefixes /img/... URLs; the default "" keeps them site-relative (served from public/img).
+ * Parse one Docusaurus MDX file into Portable Text blocks. Shared by docs (convertMdx) and posts.
+ * - `slug` overrides the derived slug (the legacy inventory de-duplicates slugs).
+ * - `lang` is the InvestmentWarning language when the file does not import one (the import decides:
+ *   `InvestmentWarning.cn.mdx` -> "zh", `InvestmentWarning.mdx` -> "en").
+ * - `site` prefixes /img/... URLs; the default "" keeps them site-relative (served from public/img).
+ * - `rewriteHref(href)` maps legacy links to new URLs; it must return unknown hrefs unchanged.
+ * Returns { frontmatter, slug, title, blocks }. Title = frontmatter title, else the first H1;
+ * the first H1 is always removed from the body (Docusaurus pages repeat the title as an H1).
  */
-export function convertMdx(src, { path, section = "ai", category = "general", order = 0, lang = "zh", site = "" }) {
+export function mdxToBlocks(src, { path, slug: slugOption, lang = "en", site = "", rewriteHref = (href) => href }) {
+	const { data: frontmatter, body: afterFrontmatter } = parseFrontmatter(src);
+	const slug = slugOption ?? deriveSlug(frontmatter, path);
+	const warningImport = /^import\s+InvestmentWarning\s+from\s+['"]([^'"]+)['"]/m.exec(src)?.[1];
+	const warningLang = warningImport ? (/\.cn\.mdx$/.test(warningImport) ? "zh" : "en") : lang;
+
 	let keySeq = 0;
-	const key = () => `k${(keySeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
+	const key = () => {
+		const n = keySeq++; // key() call order is the converter's deterministic traversal order
+		return `k${n.toString(36)}${fnv1a(`${slug}:${n}`).toString(36).padStart(7, "0").slice(-4)}`;
+	};
 
 	// ---------------------------------------------------------------- MDX -> Markdown helpers
-	const fm = /^---\n([\s\S]*?)\n---\n/.exec(src);
-	const frontmatter = Object.fromEntries(
-		(fm?.[1] ?? "").split("\n").map((l) => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
-	);
-	let body = fm ? src.slice(fm[0].length) : src;
+	let body = afterFrontmatter;
 
 	const images = {};
 	body = body.replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, name, path) => {
@@ -95,7 +132,7 @@
 
 	/** Rewrite MDX/JSX inline constructs into plain Markdown/HTML. */
 	function mdxToMarkdown(text) {
-		return (
+		const markdown =
 			text
 				// <Image img={X} .../>  and  <XSvg width={w} height={h} />
 				.replace(/<Image\s+img=\{(\w+)\}[^>]*\/>/g, (_, n) => `![${n}](${img(n)})`)
@@ -107,8 +144,8 @@
 				.replace(/style=\{\{([\s\S]*?)\}\}/g, (_, obj) => `style="${cssObjectToString(obj)}"`)
 				.replace(/img:\s*'(\/img\/[^']+)'/g, (_, p) => `img: '${site}${p}'`) // mermaid image nodes
 				.replace(/\s*\{#[\w-]+\}\s*$/gm, "") // Docusaurus heading ids
-				.replace(/^\s*<!--.*?-->\s*$/gm, "")
-		);
+				.replace(/^\s*<!--.*?-->\s*$/gm, "");
+		return rewriteLinks(markdown, rewriteHref);
 	}
 
 	function dedent(text) {
@@ -286,9 +323,21 @@
 		if (prose.join("").trim()) blocks.push(...markdownToBlocks(mdxToMarkdown(prose.join("\n"))));
 		prose = [];
 	};
+	/** Lines from i up to the first line matching endRe; lines inside fenced code never end the run. */
 	const collectUntil = (i, endRe) => {
 		const out = [];
-		while (i < lines.length && !endRe.test(lines[i])) out.push(lines[i++]);
+		let fence = null;
+		for (; i < lines.length; i++) {
+			const line = lines[i];
+			if (fence) {
+				if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
+			} else if (endRe.test(line)) {
+				break;
+			} else {
+				fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? null;
+			}
+			out.push(line);
+		}
 		return [out, i];
 	};
 
@@ -298,7 +347,16 @@
 		if (/^\s*<!--.*-->\s*$/.test(line) || /^\s*<TOCInline/.test(line)) continue;
 		if (/^\s*<InvestmentWarning\s*\/>/.test(line)) {
 			flush();
-			blocks.push({ _type: "investment_warning", _key: key(), lang });
+			blocks.push({ _type: "investment_warning", _key: key(), lang: warningLang });
+		} else if ((m = line.match(/^::::(\w+)[ \t]*(.*)$/))) {
+			// 4-colon admonition wrapping a 3-colon one: a callout body is Markdown and cannot nest a callout,
+			// so the outer one ends at the first nested `:::tone` line and the inner one follows as its own block.
+			flush();
+			const [inner, end] = collectUntil(i + 1, /^:{3,4}(?:\w+.*)?\s*$/);
+			i = /^::::\s*$/.test(lines[end] ?? "") ? end : end - 1;
+			blocks.push({ _type: "callout", _key: key(), tone: m[1], title: m[2].trim(), body: mdxToMarkdown(dedent(inner.join("\n"))) });
+		} else if (/^::::\s*$/.test(line)) {
+			// closing line of a 4-colon admonition whose nested callout was emitted separately
 		} else if ((m = line.match(/^:::(\w+)[ \t]*(.*)$/))) {
 			flush();
 			const [inner, end] = collectUntil(i + 1, /^:::\s*$/);
@@ -352,20 +410,21 @@
 	}
 	flush();
 
-	// The first H1 becomes the entry title (Docusaurus pages repeat the title as an H1)
 	const h1 = blocks.findIndex((b) => b.style === "h1");
-	const title = h1 >= 0 ? blocks.splice(h1, 1)[0].children.map((c) => c.text).join("") : frontmatter.title;
+	const h1Text = h1 >= 0 ? blocks.splice(h1, 1)[0].children.map((c) => c.text).join("") : undefined;
+	const title = String(frontmatter.title ?? h1Text ?? slug);
+	return { frontmatter, slug, title, blocks };
+}
 
-	const slug = (frontmatter.slug ?? path.split("/").pop().replace(/\.mdx?$/, "").replace(/^\d+[-_]/, ""))
-		.replace(/^\//, "")
-		.replace(/\//g, "-");
-
+/** Convert one Docusaurus MDX doc into an EmDash `docs` payload (options as for mdxToBlocks, plus the doc fields). */
+export function convertMdx(src, { section = "ai", category = "general", order = 0, ...options }) {
+	const { frontmatter, slug, title, blocks } = mdxToBlocks(src, options);
 	return {
 		collection: "docs",
 		slug,
 		data: {
 			title,
-			description: frontmatter.description ?? frontmatter.title ?? "",
+			description: String(frontmatter.description ?? frontmatter.title ?? ""),
 			section,
 			category,
 			sort_order: Number(order),
```

Replace `scripts/convert-mdx.mjs`（加 `--slug`，`--lang` 默认改成 `en`）：

```js
#!/usr/bin/env node
// Convert one Docusaurus MDX doc into an EmDash `docs` payload (logic in ./lib/mdx-to-pt.mjs), for inspection.
// The migration runner (scripts/migrate.mjs) derives section, category, order and slug from the legacy tree.
// Usage: node scripts/convert-mdx.mjs <file.mdx> [--section ai] [--category usecase] [--order 2002] [--slug x] [--lang en] [--site ""] > payload.json
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { convertMdx } from "./lib/mdx-to-pt.mjs";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		section: { type: "string", default: "ai" },
		category: { type: "string", default: "general" },
		order: { type: "string", default: "0" },
		slug: { type: "string" },
		lang: { type: "string", default: "en" },
		site: { type: "string", default: "" },
	},
});
const [path] = positionals;
if (!path) {
	console.error("usage: convert-mdx.mjs <file.mdx> [--section] [--category] [--order] [--slug] [--lang] [--site]");
	process.exit(2);
}
const payload = convertMdx(readFileSync(path, "utf8"), { path, ...values, order: Number(values.order) });
process.stdout.write(`${JSON.stringify(payload, null, 1)}\n`);
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 在全部 legacy 文件上检查确定性**

```bash
node --input-type=module -e '
import fs from "node:fs"; import path from "node:path";
import { convertMdx } from "./scripts/lib/mdx-to-pt.mjs";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.mdx?$/.test(e.name) ? [path.join(d, e.name)] : []);
const files = [...walk("legacy/docs"), ...walk("legacy/i18n/zh-CN/docusaurus-plugin-content-docs/current")];
let nondet = 0, dup = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const a = JSON.stringify(convertMdx(src, { path: f })), b = JSON.stringify(convertMdx(src, { path: f }));
  const keys = a.match(/"_key":"[^"]+"/g) ?? [];
  if (a !== b) nondet++;
  if (new Set(keys).size !== keys.length) dup++;
}
console.log({ files: files.length, nondet, dup });
'
```

Expected：`{ files: 35, nondet: 0, dup: 0 }`。

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/frontmatter.mjs scripts/lib/frontmatter.test.mjs scripts/lib/fixtures/ scripts/lib/mdx-to-pt.mjs scripts/lib/mdx-to-pt.test.mjs scripts/convert-mdx.mjs
git commit -m "feat(convert): deterministic keys, frontmatter parser, fm-first titles, warning lang from import, 4-colon admonitions, link rewrite hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 7: converter II：图片、YouTube、tools-gallery、details 里的 Tabs、列表续号 🚦

**模型：** most capable

Task 6 之后，转换结果里还剩以下问题（调研 `p2-research-5-legacy.md` §5、§6，加上写计划时实测发现的两类）：
- **14 个 `htmlBlock`**：`<MDXTemplate>` 2、`<YouTube>` 1、tools-gallery 的 9 段 HTML（8 个分类 + `<style>`）、`<AlignedText>` 2。Task 3 的 hook 会拒绝 `htmlBlock`，所以这些页面现在根本存不进去。
- **变成可见文字或直接消失的 JSX**：`<TwitterFollowButton>`（6 个 en cloud 文档）；10 个 `<YouTube>` 里 4 个在列表项里被丢掉、3 个变成字面 JSX 文字；en/zh `23_learn_ai_coding` 的两个 `<details>` 里包着 `<Tabs>`，JSX 原样进了 Markdown 正文，代码块被打碎。
- **prose 里的图片被压成 alt 文字**：`inlineToSpans` 把 image token 换成了 alt 文本（36 张，主要是 `dev/23_learn_ai_coding` 的代码截图）。
- 实测新发现：**缩进在列表项里的 admonition**（`  :::tip`，en/zh `00_guide`、`dev/00_overview`，共 6 处）变成列表项里的字面文字 `:::tip …`。
- 实测新发现：把图片、视频、callout 插到有序列表中间后，后半段会从 1 重新编号。EmDash 支持续号：同一个 `listId` 的有序列表段连续计数，`listStart` 是基数（`emdash/src/content/portable-text-lists.ts`，`OrderedList.astro` 输出 `<ol start>`）。用 EmDash 自己的 `buildPortableTextListTree` 验证过：`1. Copilot / :::tip / 2. Cursor` 渲染成两段，`start` 分别是 1 和 2。

映射规则（spec §7 会补上）：

| legacy | 新内容 |
|---|---|
| prose 里的 `![alt](url)`、`<Image img={X}>`、`<XSvg/>`、`<img>`（包括外面套一层带 style 的 `<div>`） | core `image` 块 `{ asset: { _ref: "", url }, alt }`，放在原来所在的段落 / 列表项之后。core `Image.astro` 在没有 provider、没有宽高时直接输出 `<img src=url>` |
| prose 里的 `<YouTube youTubeId skipTo>` | core `embed` `{ url: "https://www.youtube.com/watch?v=ID[&t=Ns]" }`（Task 3 的 `Embed.astro` 渲染成 youtube-nocookie iframe，`t=` 变成 `?start=`） |
| callout / details / tabs 正文里的 `<YouTube>` | Markdown 链接 `[YouTube](…)`（Markdown 正文里放不了块） |
| `<div className="tools-gallery">` | 每个 `tool-category` 一个 `tool_grid`（`title` = `<h3>`，`name` = `<span>`，`url` = `href`，`tagline` = `title` 属性，`logo` = 图片 import，`logo_size: 100`），共 8 个、27 个工具；`<style>` 丢弃 |
| `<details>` 里的 `<Tabs>` | 每个 tab 变成 `**label**` + 去掉缩进的内容（只有一个 tab 时不加 label），代码块完整保留 |
| 缩进在列表项里的 `:::tone` | 列表项之后的 `callout` |
| `<MDXTemplate>`、`<AlignedText>`（它唯一的用法包着一段引用，引用本身保留）、`<TwitterFollowButton>`（旁边的 Twitter 链接保留） | 去掉标签，保留内容 |
| 有序列表 | 每一项带 `listId`（每个列表一个，`<slug>:list-<n>`）和 `listStart`（该项自己的编号） |
| 其他 prose 里的 raw HTML | **报错**（`unsupported HTML in prose`），不再生成 `htmlBlock` |

实测结果（原型在 37 个文件上：26 en + 9 zh-CN docs + 2 posts）：没有报错，0 个 `htmlBlock`；Task 3 的 `guardPortableText` 全部通过；正文里没有残留的 JSX 和 `%%` 占位符；`embed` 8 个（10 个 YouTube 里 2 个在 tab 正文里变成链接），`tool_grid` 16 个，`image` 39 个。hot-tools 页面仍然是 51 个块。

**Files:**
- Create: `scripts/lib/mdx-jsx.mjs`、`scripts/lib/mdx-jsx.test.mjs`、`scripts/lib/legacy-convert.test.mjs`
- Modify: `scripts/lib/mdx-to-pt.mjs`、`scripts/lib/mdx-to-pt.test.mjs`、spec §6、§7

**Interfaces:**
- Consumes: Task 6 的 `mdxToBlocks`；Task 3 的 `guardPortableText`（`packages/web9-blocks/lib/pt-guard.mjs`，gate 测试用）和 `Embed.astro`
- Produces:
  - `dropWrappers(body)`、`youtubeToTokens(body) → { body, videos }`、`youtubeUrl({ id, start })`、`parseToolsGallery(html, img) → [{ title, tools }]`、`imgAttributes(tag) → { src, alt }`（`scripts/lib/mdx-jsx.mjs`）。
  - `mdxToBlocks` 的输出里新增 `image`、`embed` 块和列表项的 `listId`/`listStart`；遇到没有规则的 HTML 抛错。
  - `scripts/lib/legacy-convert.test.mjs`：迁移 gate，`legacy/` 存在时才跑（计划 3 删 `legacy/` 时一起删）。

- [ ] **Step 1: 🚦 先在 workerd 里确认 image 块、embed 和列表续号的渲染**

转换规则依赖三个渲染假设：core `image` 块用 `asset.url` 直接输出 `<img>`（`_ref` 为空也能保存）；Task 3 的 embed 覆盖；`listId` + `listStart` 让有序列表续号。先用一篇手写的探针文档实测（dev 在运行）：

```bash
cd /Users/john/git/web9ai
node -e '
const span = (k, text) => ({ _type: "span", _key: k, text, marks: [] });
const block = (k, text, extra = {}) => ({ _type: "block", _key: k, style: "normal", markDefs: [], children: [span(k + "s", text)], ...extra });
const item = (k, text, n) => block(k, text, { listItem: "number", level: 1, listId: "probe-media:list-0", listStart: n });
const body = [
  block("p1", "probe-media-text"),
  { _type: "image", _key: "i1", asset: { _ref: "", url: "/img/ai.svg" }, alt: "probe-alt" },
  { _type: "embed", _key: "e1", url: "https://www.youtube.com/watch?v=xul4nDHvxgg&t=644s" },
  item("l1", "first", 1),
  { _type: "callout", _key: "c1", tone: "tip", title: "", body: "between" },
  item("l2", "second", 2),
];
require("fs").writeFileSync(".local/probe-media.json", JSON.stringify({ collection: "docs", slug: "probe-media", locale: "en", status: "published",
  data: { title: "probe media", section: "ai", category: "probe", sort_order: 999999, body } }));
'
node scripts/mcp.mjs content_create @.local/probe-media.json > /dev/null; echo "exit=$?"
node scripts/check-page.mjs http://localhost:4321/docs/probe-media 'src="/img/ai.svg"' 'alt="probe-alt"' "youtube-nocookie.com/embed/xul4nDHvxgg?start=644" '<ol start="2"' "between"
```

Expected：`exit=0`，`check-page` 通过。
- 如果 `content_create` 因为 `_ref: ""` 失败：把规则改成 `_ref` 填 URL 本身（`asset: { _ref: url, url }`，`Image.astro` 优先用 `url`），converter 的 `mediaBlocks` 和本 Task 的测试一起改，并在报告里写明。
- 如果没有 `<ol start="2"`：续号的假设不成立，停下来报告（不影响其他规则，但列表编号会在图片后重新开始）。
- 其他不符：停下来报告。

清理：

```bash
node scripts/mcp.mjs content_delete '{"collection":"docs","id":"probe-media"}' && node scripts/mcp.mjs content_permanent_delete '{"collection":"docs","id":"probe-media"}'
node scripts/mcp.mjs content_list '{"collection":"docs"}'
```

Expected：列表为空（`content_permanent_delete` 要 ULID 的话，先 `content_list_trashed` 取 id）。

- [ ] **Step 2: 写失败的测试**

Create `scripts/lib/mdx-jsx.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { dropWrappers, imgAttributes, parseToolsGallery, youtubeToTokens, youtubeUrl } from "./mdx-jsx.mjs";

describe("dropWrappers", () => {
	it("drops wrapper tags and widgets, keeps their children", () => {
		const src = [
			"<MDXTemplate> ",
			"[Twitter](https://twitter.com/x) <TwitterFollowButton username=\"x\" size=\"large\" />",
			'<AlignedText align="right">',
			"> quote",
			"</AlignedText>",
			"</MDXTemplate>",
			"<style>",
			"{`",
			"  .tools-gallery { margin-top: 2rem; }",
			"`}",
			"</style> ",
		].join("\n");
		expect(dropWrappers(src).split("\n").filter((l) => l.trim())).toEqual(["[Twitter](https://twitter.com/x)", "> quote"]);
	});
});

describe("youtubeToTokens", () => {
	it("replaces single- and multi-line YouTube tags with numbered tokens", () => {
		const src = '<YouTube youTubeId="SKS-URw9a18" />\n- item\n      <YouTube youTubeId="xul4nDHvxgg" skipTo={{\n    h: 0,\n    m: 10,\n    s: 44\n  }} />\n';
		const { body, videos } = youtubeToTokens(src);
		expect(body).toBe("%%youtube:0%%\n- item\n      %%youtube:1%%\n");
		expect(videos).toEqual([
			{ id: "SKS-URw9a18", start: 0 },
			{ id: "xul4nDHvxgg", start: 644 },
		]);
		expect(youtubeUrl(videos[1])).toBe("https://www.youtube.com/watch?v=xul4nDHvxgg&t=644s");
		expect(youtubeUrl(videos[0])).toBe("https://www.youtube.com/watch?v=SKS-URw9a18");
	});
	it("fails on a YouTube tag without a valid id", () => {
		expect(() => youtubeToTokens('<YouTube youTubeId="short" />')).toThrow(/valid youTubeId/);
	});
});

describe("parseToolsGallery", () => {
	it("turns each tool-category into a title and its tools", () => {
		const html = `
  <div className="tool-category">
    <h3>AI Agents</h3>
    <div className="tools-grid">
      <a href="https://www.coze.com/" target="_blank" title="AI Agent">
        <Image img={CozeStore} className="tool-image" />
        <span>Coze</span>
      </a>
    </div>
  </div>
  <div className="tool-category">
    <h3>Knowledge Base | RAG</h3>
    <div className="tools-grid">
      <a href="https://www.notion.so/product/ai" target="_blank" title="笔记之王">
        <div className="svg-container">
          <NotionSvg width="100" height="100" />
        </div>
        <span>Notion AI</span>
      </a>
    </div>
  </div>`;
		const img = (name) => ({ CozeStore: "/img/coze/coze_store.png", NotionSvg: "/img/rag/notion.svg" })[name] ?? "";
		expect(parseToolsGallery(html, img)).toEqual([
			{ title: "AI Agents", tools: [{ name: "Coze", tagline: "AI Agent", logo: "/img/coze/coze_store.png", url: "https://www.coze.com/", featured: false }] },
			{
				title: "Knowledge Base | RAG",
				tools: [{ name: "Notion AI", tagline: "笔记之王", logo: "/img/rag/notion.svg", url: "https://www.notion.so/product/ai", featured: false }],
			},
		]);
	});
});

describe("imgAttributes", () => {
	it("reads src and alt", () => {
		expect(imgAttributes('<img src="/img/a.svg" alt="A" width="100">')).toEqual({ src: "/img/a.svg", alt: "A" });
	});
});
```

`scripts/lib/mdx-to-pt.test.mjs`：应用下面的 diff（`git apply`），在文件末尾加一组 `convertMdx: legacy JSX (Task 7)` 测试：

```diff
--- a/scripts/lib/mdx-to-pt.test.mjs
+++ b/scripts/lib/mdx-to-pt.test.mjs
@@ -124,3 +124,92 @@
 		expect(keys(mdxToBlocks(src, { path: "a/other.mdx" }).blocks)).not.toEqual(first);
 	});
 });
+
+describe("convertMdx: legacy JSX (Task 7)", () => {
+	const body = (src) => convertMdx(src, { path: "a/b.mdx" }).data.body;
+	const shape = (blocks) => blocks.map((b) => (b._type === "block" ? `${b.listItem ?? b.style}:${b.children.map((c) => c.text).join("").trim()}` : b._type));
+	it("turns prose images into image blocks after their text block", () => {
+		const src = "import logo from '/img/logo.png';\nimport ASvg from '/img/a.svg';\n\nText ![x](/img/x.png) more\n\n<Image img={logo} />\n\n<ASvg width={100} />\n";
+		const blocks = body(src);
+		expect(shape(blocks)).toEqual(["normal:Text  more", "image", "image", "image"]);
+		expect(blocks.filter((b) => b._type === "image").map((b) => b.asset.url)).toEqual(["/img/x.png", "/img/logo.png", "/img/a.svg"]);
+		expect(blocks[1]).toMatchObject({ asset: { _ref: "", url: "/img/x.png" }, alt: "x" });
+	});
+	it("keeps the image out of a styled wrapper div", () => {
+		const src = "import PosterSvg from '/img/p.svg';\n\n<div style={{textAlign: 'center'}}>\n  <PosterSvg style={{maxWidth: '100%'}}/>\n</div>\n";
+		expect(body(src)).toMatchObject([{ _type: "image", asset: { url: "/img/p.svg" }, alt: "PosterSvg" }]);
+	});
+	it("turns YouTube into an embed in prose and a link inside a block body", () => {
+		const src = [
+			'<YouTube youTubeId="SKS-URw9a18" />',
+			"",
+			"- item one",
+			'      <YouTube youTubeId="LslC2nKEEGU" />',
+			"- item two",
+			"",
+			":::tip T",
+			'<YouTube youTubeId="trXPfpV5iRQ" />',
+			":::",
+		].join("\n");
+		const blocks = body(src);
+		expect(shape(blocks)).toEqual(["embed", "bullet:item one", "embed", "bullet:item two", "callout"]);
+		expect(blocks[0].url).toBe("https://www.youtube.com/watch?v=SKS-URw9a18");
+		expect(blocks[4].body).toBe("[YouTube](https://www.youtube.com/watch?v=trXPfpV5iRQ)");
+	});
+	it("moves an admonition inside a list item to a callout after the item, numbering continues", () => {
+		const blocks = body("1. Copilot\n   :::tip\n   Future\n   :::\n2. Cursor\n");
+		expect(shape(blocks)).toEqual(["number:Copilot", "callout", "number:Cursor"]);
+		expect(blocks[1]).toMatchObject({ tone: "tip", body: "Future" });
+		expect([blocks[0].listStart, blocks[2].listStart]).toEqual([1, 2]);
+		expect(blocks[0].listId).toBe(blocks[2].listId);
+	});
+	it("flattens Tabs inside details into bold labels and code fences", () => {
+		const src = [
+			"<details>",
+			"<summary>Code</summary>",
+			"  <Tabs>",
+			'    <TabItem value="java" label="Java">',
+			"    ```java",
+			"    class A {}",
+			"    ```",
+			"    </TabItem>",
+			'    <TabItem value="py" label="Python">',
+			"    ```python",
+			"    a = 1",
+			"    ```",
+			"    </TabItem>",
+			"  </Tabs>",
+			"</details>",
+		].join("\n");
+		const [details] = body(src);
+		expect(details).toMatchObject({ _type: "details", summary: "Code" });
+		expect(details.body).toBe("**Java**\n\n```java\nclass A {}\n```\n\n**Python**\n\n```python\na = 1\n```");
+	});
+	it("turns the tools gallery into one tool_grid per category and drops its style", () => {
+		const src = [
+			"import Zapier from '/img/zapier/zapier_apps.png';",
+			"",
+			'<div className="tools-gallery">',
+			'  <div className="tool-category">',
+			"    <h3>AI Agents</h3>",
+			'    <a href="https://zapier.com/" target="_blank" title="Workflow Automation">',
+			'      <Image img={Zapier} className="tool-image" />',
+			"      <span>Zapier</span>",
+			"    </a>",
+			"  </div>",
+			"</div>",
+			"",
+			"<style>",
+			"{`",
+			"  .tools-gallery { margin-top: 2rem; }",
+			"`}",
+			"</style>",
+		].join("\n");
+		expect(body(src)).toMatchObject([
+			{ _type: "tool_grid", title: "AI Agents", logo_size: 100, tools: [{ name: "Zapier", logo: "/img/zapier/zapier_apps.png", tagline: "Workflow Automation" }] },
+		]);
+	});
+	it("fails on raw HTML it has no rule for", () => {
+		expect(() => body('<iframe src="https://x.example"></iframe>\n')).toThrow(/unsupported HTML in prose/);
+	});
+});
```

Create `scripts/lib/legacy-convert.test.mjs`（迁移 gate）：

```js
// Gate for the migration (plan 2 Task 7): every legacy doc and post converts without errors, into blocks the
// save hook accepts (packages/web9-blocks/lib/pt-guard.mjs), with no MDX left over as visible text.
// Runs only while legacy/ exists; plan 3 deletes both together.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { guardPortableText } from "../../packages/web9-blocks/lib/pt-guard.mjs";
import { mdxToBlocks } from "./mdx-to-pt.mjs";

const ROOTS = ["legacy/docs", "legacy/i18n/zh-CN/docusaurus-plugin-content-docs/current", "legacy/blog"];
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(path.join(dir, e.name)) : /\.mdx?$/.test(e.name) ? [path.join(dir, e.name)] : [],
	);

/** Every string in a block except code and Mermaid source, where JSX-like text is legitimate. */
function strings(value, key = "", out = []) {
	if (typeof value === "string") {
		if (key !== "code") out.push(value);
	} else if (Array.isArray(value)) value.forEach((v) => strings(v, key, out));
	else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, k, out);
	return out;
}
const LEFTOVER = [/<[A-Z][A-Za-z]*\b/, /<\/?(?:Tabs|TabItem|details|summary|style)\b/, /%%(?:youtube|callout):/, /::::/];
// Markdown bodies render `:::tone` at the start of a line (markdown.mjs); prose text and indented ones do not.
const leftoverFor = (block) => (block._type === "block" ? [...LEFTOVER, /:::/] : [...LEFTOVER, /^[ \t]+:::/m]);

describe.skipIf(!existsSync("legacy/docs"))("legacy content converts cleanly", () => {
	const files = ROOTS.flatMap(walk);
	const results = files.map((file) => ({ file, ...mdxToBlocks(readFileSync(file, "utf8"), { path: file }) }));
	const count = (type) => results.reduce((n, r) => n + r.blocks.filter((b) => b._type === type).length, 0);

	it("finds 26 en docs, 9 zh-CN docs and 2 posts", () => {
		expect(files.map((f) => ROOTS.find((r) => f.startsWith(r)))).toEqual([...Array(26).fill(ROOTS[0]), ...Array(9).fill(ROOTS[1]), ...Array(2).fill(ROOTS[2])]);
	});
	it("emits no htmlBlock and only blocks the save hook accepts", () => {
		expect(count("htmlBlock")).toBe(0);
		expect(results.flatMap((r) => guardPortableText(r.blocks).map((p) => `${r.file}: ${p}`))).toEqual([]);
	});
	it("leaves no MDX in visible text", () => {
		const found = results.flatMap(({ file, blocks }) =>
			blocks.flatMap((b, i) =>
				b._type === "mermaid" ? [] : strings(b).flatMap((s) => leftoverFor(b).filter((re) => re.test(s)).map((re) => `${file} #${i} ${b._type}: ${re}`)),
			),
		);
		expect(found).toEqual([]);
	});
	it("keeps the known media and widget counts", () => {
		// 10 YouTube tags: 8 in prose become embeds, 2 inside tab bodies become links (en 00_guide)
		expect(count("embed")).toBe(8);
		// 8 tool tables in 01_ai_hot_tools + 8 gallery categories in 01_tools-summary (27 tools)
		expect(count("tool_grid")).toBe(16);
		expect(count("image")).toBe(39);
	});
});
```

- [ ] **Step 3: 跑测试，确认失败**

Run: `npx vitest run scripts/lib/`
Expected: FAIL：`mdx-jsx.mjs` 不存在；`legacy-convert.test.mjs` 报 `htmlBlock` 14 个、guard 问题和残留 JSX。

- [ ] **Step 4: 实现**

Create `scripts/lib/mdx-jsx.mjs`：

```js
// String passes over the MDX body for the legacy JSX that has no block of its own
// (research p2-research-5-legacy.md §5d). They run before the line scanner in mdx-to-pt.mjs.

/** Wrappers and widgets that carry no content of their own: the tags go, their children stay. */
export function dropWrappers(body) {
	return (
		body
			.replace(/^[ \t]*<\/?MDXTemplate>[ \t]*$/gm, "") // mdx-embed context provider
			.replace(/^[ \t]*<\/?AlignedText\b[^>]*>[ \t]*$/gm, "") // its only use wraps a quote, which stays a blockquote
			.replace(/[ \t]*<TwitterFollowButton\b[^>]*\/>/g, "") // always right after a Twitter link, which stays
			.replace(/<style>\s*\{?`[\s\S]*?`\}?\s*<\/style>/g, "") // page-local CSS of the tools gallery
	);
}

/**
 * `<YouTube youTubeId="ID" skipTo={{ h, m, s }} />` (may span lines) -> `%%youtube:N%%`, a one-line token
 * with no Markdown meaning. `videos[N]` holds { id, start }. The scanner turns tokens in prose into embed
 * blocks and tokens in Markdown bodies (callout, details, tabs) into links.
 */
export function youtubeToTokens(body) {
	const videos = [];
	const out = body.replace(/<YouTube\b([\s\S]*?)\/>/g, (all, attrs) => {
		const id = /youTubeId=["']([\w-]{11})["']/.exec(attrs)?.[1];
		if (!id) throw new Error(`YouTube without a valid youTubeId: ${all.slice(0, 80)}`);
		const part = (unit) => Number(new RegExp(`\\b${unit}:\\s*(\\d+)`).exec(attrs)?.[1] ?? 0);
		videos.push({ id, start: part("h") * 3600 + part("m") * 60 + part("s") });
		return `%%youtube:${videos.length - 1}%%`;
	});
	return { body: out, videos };
}

export const YOUTUBE_TOKEN = /%%youtube:(\d+)%%/g;

export const youtubeUrl = ({ id, start }) => `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`;

/**
 * The tools gallery (`<div className="tools-gallery">`, only in 88-usecase/01_tools-summary.mdx) -> one entry
 * per `tool-category`: { title: <h3>, tools: [{ name: <span>, url: href, tagline: title attribute, logo }] }.
 * `img(name)` resolves an image import (`<Image img={X}>` or `<XSvg … />`) to its URL.
 */
export function parseToolsGallery(html, img) {
	return html
		.split(/<div className="tool-category">/)
		.slice(1)
		.map((category) => ({
			title: /<h3>([\s\S]*?)<\/h3>/.exec(category)?.[1].trim() ?? "",
			tools: [...category.matchAll(/<a\s+([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
				name: /<span>([\s\S]*?)<\/span>/.exec(inner)?.[1].trim() ?? "",
				tagline: /title="([^"]*)"/.exec(attrs)?.[1] ?? "",
				logo: img(/<Image\s+img=\{(\w+)\}/.exec(inner)?.[1] ?? /<(\w+(?:Svg|Png))\b/.exec(inner)?.[1] ?? ""),
				url: /href="([^"]+)"/.exec(attrs)?.[1] ?? "",
				featured: false,
			})),
		}));
}

/** src/alt/width/height of an `<img …>` tag. */
export function imgAttributes(tag) {
	const attr = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
	return { src: attr("src") ?? "", alt: attr("alt") ?? "" };
}
```

`scripts/lib/mdx-to-pt.mjs`：应用下面的 diff（`git apply`，基于 Task 6 之后的版本）。改动点：文件头的映射表；导入 `mdx-jsx.mjs`；扫描前跑 `dropWrappers` 和 `youtubeToTokens`；`bodyMarkdown`（块正文里的视频变链接）；`media` 收集器和 `mediaBlocks()`（图片、视频、列表项里的 callout 在段落 / 列表项之后输出）；`listToBlocks` 的 `listId`/`listStart`；block 级 HTML 只接受图片，其他抛错；`tabsToMarkdown`；tools-gallery 分支；缩进 admonition 分支：

```diff
--- a/scripts/lib/mdx-to-pt.mjs
+++ b/scripts/lib/mdx-to-pt.mjs
@@ -8,13 +8,20 @@
 //   ```mermaid                      -> mermaid
 //   <InvestmentWarning />           -> investment_warning
 //   tables with logos/images        -> tool_grid; text-only tables -> core `table`
+//   <div className="tools-gallery"> -> one tool_grid per category
+//   <YouTube youTubeId>             -> core `embed` (prose) or a Markdown link (inside a block body)
+//   images in prose                 -> core `image` blocks after the text block they were in
+//   <Tabs> inside <details>         -> bold tab labels + the tab bodies, in the details Markdown
+//   <MDXTemplate>, <AlignedText>, <TwitterFollowButton>, <style> -> dropped (children kept)
 //   everything else (prose)         -> standard Portable Text via the marked lexer
+// Any other raw HTML in prose is an error: the site rejects htmlBlock on save (spec §10).
 //
 // Output is deterministic: block keys come from the slug and the traversal order (fnv1a), so the
 // same source always gives the same JSON and the migration runner can skip unchanged entries.
 
 import { marked } from "marked";
 import { parseFrontmatter } from "./frontmatter.mjs";
+import { YOUTUBE_TOKEN, dropWrappers, imgAttributes, parseToolsGallery, youtubeToTokens, youtubeUrl } from "./mdx-jsx.mjs";
 
 /** 32-bit FNV-1a; no dependencies, same result in Node and workerd. */
 export function fnv1a(str) {
@@ -129,6 +136,9 @@
 	});
 	body = body.replace(/^import\s+.*$/gm, "");
 	const img = (name) => images[name] ?? "";
+	body = dropWrappers(body);
+	const { body: withTokens, videos } = youtubeToTokens(body);
+	body = withTokens;
 
 	/** Rewrite MDX/JSX inline constructs into plain Markdown/HTML. */
 	function mdxToMarkdown(text) {
@@ -148,6 +158,17 @@
 		return rewriteLinks(markdown, rewriteHref);
 	}
 
+	/** Markdown for a block body (callout, details, tabs): videos become links, there is no block to put them in. */
+	const bodyMarkdown = (text) => mdxToMarkdown(text).replace(YOUTUBE_TOKEN, (_, n) => `[YouTube](${youtubeUrl(videos[n])})`);
+
+	/** Docusaurus Tabs inside Markdown: each tab becomes `**label**` + its dedented content (no label for a single tab). */
+	function tabsToMarkdown(text) {
+		return text.replace(/^[ \t]*<Tabs\b[\s\S]*?^[ \t]*<\/Tabs>[ \t]*$/gm, (jsx) => {
+			const { tabs } = parseTabs(jsx);
+			return tabs.map((t) => `${tabs.length > 1 ? `**${t.label}**\n\n` : ""}${dedent(t.content)}`).join("\n\n");
+		});
+	}
+
 	function dedent(text) {
 		const lines = text.replace(/\t/g, "  ").split("\n");
 		const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
@@ -156,9 +177,29 @@
 	}
 
 	// ---------------------------------------------------------------- Markdown -> Portable Text
+	// Portable Text has no inline images or videos: inlineToSpans collects them here and they are emitted
+	// as blocks right after the text block (or list item) they were in.
+	// Indented admonitions inside list items (`  :::tip`) take the same route: callouts after the item.
+	const media = [];
+	const nestedCallouts = [];
+	const mediaBlocks = () =>
+		media.splice(0).map((m) => {
+			if (m.video) return { _type: "embed", _key: key(), url: youtubeUrl(m.video) };
+			if (m.callout) return { _type: "callout", _key: key(), ...m.callout };
+			return { _type: "image", _key: key(), asset: { _ref: "", url: m.src }, alt: m.alt };
+		});
+	const hasText = (block) => block.children.some((c) => c.text.trim());
+
 	function inlineToSpans(tokens = [], markDefs, marks = []) {
 		const spans = [];
 		const push = (text, m = marks) => text && spans.push({ _type: "span", _key: key(), text, marks: [...m] });
+		const pushText = (text) =>
+			text.split(/(%%(?:youtube|callout):\d+%%)/).forEach((part) => {
+				const token = /^%%(youtube|callout):(\d+)%%$/.exec(part);
+				if (token?.[1] === "youtube") media.push({ video: videos[token[2]] });
+				else if (token) media.push({ callout: nestedCallouts[token[2]] });
+				else push(part);
+			});
 		for (const t of tokens) {
 			switch (t.type) {
 				case "strong":
@@ -183,14 +224,16 @@
 					push("\n");
 					break;
 				case "html":
-					push(/^<br\s*\/?>$/i.test(t.raw.trim()) ? "\n" : t.raw);
+					if (/^<br\s*\/?>$/i.test(t.raw.trim())) push("\n");
+					else if (/^<img\s/i.test(t.raw.trim())) media.push(imgAttributes(t.raw));
+					else push(t.raw);
 					break;
 				case "image":
-					push(t.text || "image");
+					media.push({ src: t.href, alt: t.text ?? "" });
 					break;
 				case "text":
 					if (t.tokens?.length) spans.push(...inlineToSpans(t.tokens, markDefs, marks));
-					else push(t.text);
+					else pushText(t.text);
 					break;
 				default:
 					push(t.raw ?? "");
@@ -206,13 +249,22 @@
 		return { _type: "block", _key: key(), style: "normal", markDefs, children, ...extra };
 	};
 
+	// Numbered items carry listId + listStart (their own number) so a list split by an image, video or
+	// callout keeps counting instead of restarting at 1 (emdash/src/content/portable-text-lists.ts).
+	let listSeq = 0;
 	function listToBlocks(list, level = 1) {
 		const out = [];
-		for (const item of list.items) {
+		const listId = list.ordered ? `${slug}:list-${listSeq++}` : undefined;
+		const start = Number(list.start) || 1;
+		for (const [n, item] of list.items.entries()) {
+			const extra = list.ordered ? { listItem: "number", level, listId, listStart: start + n } : { listItem: "bullet", level };
 			for (const t of item.tokens) {
 				if (t.type === "list") out.push(...listToBlocks(t, level + 1));
-				else if (t.type === "text" || t.type === "paragraph")
-					out.push(textBlock(t.tokens ?? [t], { listItem: list.ordered ? "number" : "bullet", level }));
+				else if (t.type === "text" || t.type === "paragraph") {
+					const block = textBlock(t.tokens ?? [t], extra);
+					if (hasText(block) || !media.length) out.push(block);
+					out.push(...mediaBlocks());
+				}
 			}
 		}
 		return out;
@@ -241,9 +293,11 @@
 				case "heading":
 					blocks.push(textBlock(t.tokens, { style: `h${t.depth}` }));
 					break;
-				case "paragraph":
-					blocks.push(textBlock(t.tokens));
+				case "paragraph": {
+					const block = textBlock(t.tokens);
+					if (hasText(block) || !media.length) blocks.push(block);
 					break;
+				}
 				case "list":
 					blocks.push(...listToBlocks(t));
 					break;
@@ -259,14 +313,21 @@
 				case "table":
 					blocks.push(tableToCoreTable(t));
 					break;
-				case "html":
-					if (t.raw.trim()) blocks.push({ _type: "htmlBlock", _key: key(), html: t.raw.trim() });
+				case "html": {
+					// Only images (possibly in a styled wrapper div) are allowed; anything else needs a converter rule.
+					const html = t.raw.trim();
+					const tags = html.match(/<img\s[^>]*>/gi) ?? [];
+					const rest = html.replace(/<img\s[^>]*>/gi, "").replace(/<\/?(?:div|p|center)\b[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "");
+					if (rest.trim()) throw new Error(`${path}: unsupported HTML in prose: ${html.slice(0, 120)}`);
+					for (const tag of tags) media.push(imgAttributes(tag));
 					break;
+				}
 				case "space":
 					break;
 				default:
 					console.error(`[convert] unhandled markdown token: ${t.type}`);
 			}
+			blocks.push(...mediaBlocks());
 		}
 		return blocks;
 	}
@@ -354,14 +415,14 @@
 			flush();
 			const [inner, end] = collectUntil(i + 1, /^:{3,4}(?:\w+.*)?\s*$/);
 			i = /^::::\s*$/.test(lines[end] ?? "") ? end : end - 1;
-			blocks.push({ _type: "callout", _key: key(), tone: m[1], title: m[2].trim(), body: mdxToMarkdown(dedent(inner.join("\n"))) });
+			blocks.push({ _type: "callout", _key: key(), tone: m[1], title: m[2].trim(), body: bodyMarkdown(dedent(inner.join("\n"))) });
 		} else if (/^::::\s*$/.test(line)) {
 			// closing line of a 4-colon admonition whose nested callout was emitted separately
 		} else if ((m = line.match(/^:::(\w+)[ \t]*(.*)$/))) {
 			flush();
 			const [inner, end] = collectUntil(i + 1, /^:::\s*$/);
 			i = end;
-			blocks.push({ _type: "callout", _key: key(), tone: m[1], title: m[2].trim(), body: mdxToMarkdown(dedent(inner.join("\n"))) });
+			blocks.push({ _type: "callout", _key: key(), tone: m[1], title: m[2].trim(), body: bodyMarkdown(dedent(inner.join("\n"))) });
 		} else if (/^\s*<details>/.test(line)) {
 			flush();
 			const [inner, end] = collectUntil(i + 1, /^\s*<\/details>/);
@@ -369,7 +430,15 @@
 			const joined = inner.join("\n");
 			const summary = joined.match(/<summary>([\s\S]*?)<\/summary>/)?.[1].trim() ?? "Details";
 			const rest = joined.replace(/<summary>[\s\S]*?<\/summary>/, "").replace(/^\s*<\/?div>\s*$/gm, "");
-			blocks.push({ _type: "details", _key: key(), summary, body: mdxToMarkdown(dedent(rest)) });
+			// A details body is Markdown, so Tabs inside it become bold labels followed by each tab's content
+			blocks.push({ _type: "details", _key: key(), summary, body: bodyMarkdown(tabsToMarkdown(dedent(rest))) });
+		} else if (/^\s*<div className="tools-gallery">/.test(line)) {
+			flush();
+			const [inner, end] = collectUntil(i + 1, /^<\/div>\s*$/);
+			i = end;
+			for (const { title, tools } of parseToolsGallery(inner.join("\n"), img)) {
+				blocks.push({ _type: "tool_grid", _key: key(), title, tools, logo_size: 100 });
+			}
 		} else if (/^\s*<FullscreenWrapper>/.test(line)) {
 			fullscreen = true;
 		} else if (/^\s*<\/FullscreenWrapper>/.test(line)) {
@@ -382,7 +451,7 @@
 			blocks.push({
 				_type: "tabs",
 				_key: key(),
-				tabs: tabs.map((t) => ({ label: t.label, body: mdxToMarkdown(dedent(t.content)) })),
+				tabs: tabs.map((t) => ({ label: t.label, body: bodyMarkdown(dedent(t.content)) })),
 				default_tab: defaultIndex + 1,
 				fullscreen,
 			});
@@ -404,6 +473,12 @@
 			const [inner, end] = collectUntil(i, /^(?!\s*\|)/);
 			i = end - 1;
 			blocks.push(tableToBlock(inner));
+		} else if ((m = line.match(/^(\s+):::(\w+)[ \t]*(.*)$/))) {
+			// Indented admonition (inside a list item): becomes a callout right after that item
+			const [inner, end] = collectUntil(i + 1, /^\s*:::\s*$/);
+			i = end;
+			nestedCallouts.push({ tone: m[2], title: m[3].trim(), body: bodyMarkdown(dedent(inner.join("\n"))) });
+			prose.push(`${m[1]}%%callout:${nestedCallouts.length - 1}%%`);
 		} else {
 			prose.push(line);
 		}
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `npm test`
Expected: PASS（包括 `legacy-convert.test.mjs` 的 4 个用例；hot-tools golden test 不变，51 个块）。

- [ ] **Step 6: 🚦 抽查渲染**

把三个最复杂的页面转出来，用探针 slug 发布，看页面（dev 在运行）：

```bash
for pair in "legacy/docs/dev/23_learn_ai_coding.mdx probe-learn-ai-coding" "legacy/docs/ai/88-usecase/00_guide.mdx probe-guide" "legacy/docs/ai/88-usecase/01_tools-summary.mdx probe-tools-summary"; do
  f=${pair% *}; s=${pair#* }
  node scripts/convert-mdx.mjs "$f" --slug "$s" --category probe --order 999999 > ".local/$s.json"
  node -e 'const f=process.argv[1]; const p=JSON.parse(require("fs").readFileSync(f,"utf8")); p.locale="en"; p.status="published"; require("fs").writeFileSync(f, JSON.stringify(p));' ".local/$s.json"
  node scripts/mcp.mjs content_create @".local/$s.json" > /dev/null; echo "$s exit=$?"
done
node scripts/check-page.mjs http://localhost:4321/docs/probe-learn-ai-coding '<pre' 'src="/img/dev/23/' --absent '&lt;TabItem' --absent '&lt;Tabs'
node scripts/check-page.mjs http://localhost:4321/docs/probe-guide 'youtube-nocookie.com/embed/LslC2nKEEGU' 'ai.com is no longer redirected' --absent ':::warning' --absent '&lt;YouTube'
node scripts/check-page.mjs http://localhost:4321/docs/probe-tools-summary 'data-w9-tools' 'Notion AI' 'src="/img/rag/notion.svg"' --absent 'tools-gallery'
```

Expected：三个 `exit=0`，三个 `check-page` 通过。再用 CDP（page 8）`navigate_page` 到这三个页面各 `take_screenshot` 一次，确认：`learn-ai-coding` 的 details 展开后是带语言标签的代码块；`guide` 的视频是播放器、列表编号连续；`tools-summary` 是 8 组卡片。

清理（三篇探针都删掉）：

```bash
for s in probe-learn-ai-coding probe-guide probe-tools-summary; do node scripts/mcp.mjs content_delete "{\"collection\":\"docs\",\"id\":\"$s\"}" && node scripts/mcp.mjs content_permanent_delete "{\"collection\":\"docs\",\"id\":\"$s\"}"; done
node scripts/mcp.mjs content_list '{"collection":"docs"}'
```

Expected：列表为空。

- [ ] **Step 7: 更新 spec**

- §6 第一条后面加："prose 里的图片迁移成 core `image` 块，`asset.url` 直接是 `/img/...`（`_ref` 为空），不进媒体库（计划 2 Task 7）。12 张外链图片（cloudinary、lambdalabs 等）保持外链，风险不变。"
- §7 在"正式使用前要修两个问题"的列表后面加一条："**计划 2 补齐的转换规则（Task 6–7）**：key 由 slug 和遍历顺序决定（FNV-1a），输出可重复；标题 = frontmatter `title` ?? 第一个 H1，第一个 H1 总是从正文删掉；InvestmentWarning 的语言看 import；4 冒号 admonition 拆成两个 callout；图片 → core `image`；YouTube → core `embed`（块正文里是链接）；tools-gallery → `tool_grid`；details 里的 Tabs → 粗体标签 + 代码块；列表项里的 admonition → 该项之后的 callout；有序列表带 `listId`/`listStart` 续号；`MDXTemplate`、`AlignedText`、`TwitterFollowButton`、`<style>` 去掉标签；其他 raw HTML 直接报错，转换器不再产出 `htmlBlock`。gate：`scripts/lib/legacy-convert.test.mjs`。"

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/mdx-jsx.mjs scripts/lib/mdx-jsx.test.mjs scripts/lib/legacy-convert.test.mjs scripts/lib/mdx-to-pt.mjs scripts/lib/mdx-to-pt.test.mjs docs/superpowers/specs/2026-10-15-emdash-migration-design.md
git commit -m "feat(convert): images, YouTube embeds, tools gallery, tabs in details, nested admonitions, list numbering; no more htmlBlock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 8: legacy inventory（section、category、`sort_order`、slug、旧 URL、链接解析）

**模型：** standard

`convertMdx` 自己不看目录结构：section、category、order 都是调用方传的参数，默认 `ai / general / 0`，所以 35 个文件现在全是 `ai / general / 0`（`dev/00_overview.md` 也是 `ai`）。这个 Task 把 Docusaurus 3.7 的规则搬过来，一次性算出每篇文档的元数据、旧 URL 和新 URL，并给 converter 提供 `rewriteHref`（调研 `p2-research-5-legacy.md` §1–§4，规则是读 Docusaurus 3.7.0 源码得到的）。

规则：
- **number prefix**（`lib/numberPrefix.js`）：`^(\d+)\s*[-_.]+\s*([^-_.\s].*)$`，但名字匹配 `^\d+[-_.]\d+` 时不算前缀。所以 `01_3d` 没有前缀：旧 URL 是 `/ai/model/01_3d`，排序位置为空（排最后）；新 slug 仍然是 converter 规则给出的 `3d`，旧 URL 由 Task 10 的 redirect 接住。
- **侧边栏顺序**（`lib/sidebars/generator.js`）：每个目录里，文档和子分类在同一个列表里排序，先按 position 升序（没有 position 的排最后），再按源文件名 / 目录名。文档的 position 是 `sidebar_position ?? number prefix`；分类的 position 是 `_category_.yml` 的 `position ?? 目录名的 number prefix`（cloud 100、prompt 1600 覆盖了目录前缀 8、16）。
- **`sort_order`**：`DocsPage` 把所有文档按 `sort_order` 排序后再分组，所以它必须编码整个侧边栏，不能用分类内的位置。公式：`section 序号 × 1_000_000 + 根条目名次 × 1000 + 分类内名次`（名次从 1 开始；section 根目录下的文档分类内名次是 0）。结果：`ai/intro` 1000；usecase 2001–2003；article 3001；cloud 4001–4016；prompt 5001；model 6001–6002；`dev/overview` 1001000；`dev/learn_ai_coding` 1002000。中间留了空位，以后插文档不用重新编号。
- **category**：目录名去掉数字前缀（`cloud`、`prompt`、`usecase`、`article`、`model`）；直接在 `ai/`、`dev/` 下的文档是 `general`。不存显示名：zh-CN 只翻译了部分文档，存显示名会把同一个分类拆成两组。显示名（`_category_.yml` 的 `label`，zh-CN 的 usecase 是"神兵利器"）由 Task 12 的站点代码映射。
- **slug**：converter 的规则（frontmatter `slug` 去掉开头的 `/`，否则文件名去掉 `^\d+[-_]`）。重名时整组（不是"除第一个外"，这样和顺序无关）改成 `<category，general 时用 section>-<slug>`，还重名再加 section；仍然重名就报错。目前 26 个 slug 没有重名。zh-CN 的 slug 一律取 en 原文的 slug。
- **旧 URL**（`routeBasePath: "/"`，没有 `/docs` 前缀）：frontmatter slug 以 `/` 开头就是绝对路径（`/rundiffusion`）；不以 `/` 开头就是相对所在目录（`ai/16-prompt/` 里的 `prompt-guides` → `/ai/prompt/prompt-guides`）；没有 slug 时是去掉前缀的目录 + 文件名（`/ai/cloud/qblock`）。zh-CN 是 `/zh-CN` + 同一路径；Docusaurus 的 zh-CN 站点有全部 26 篇（没翻译的用 en 内容），所以 zh-CN 旧 URL 也是 26 个。
- **zh-CN 是 en 树的覆盖层**：只有在 en 树里存在的文件才是文档。zh-CN 独有的文件 Docusaurus 会忽略；这里直接报错（目前没有）。
- 只认 `.md` / `.mdx`：跳过 `_category_.yml` 和 `09_embed_voomly.mdx.bak`。
- **链接**（语料里所有站内链接：`../16-prompt/01-popular-prompt-guide.mdx` ×2、`./monster_api` ×2、`./qblock` ×2、`/ai/usecase/ai-tools-adhoc` ×1，外加 8 个页内锚点）：
  - 以 `.md`/`.mdx` 结尾的相对链接按文件路径解析；
  - 其他相对链接按旧页面 URL 解析（Docusaurus 渲染成普通 `<a>`，浏览器相对当前 URL 解析：`/ai/cloud/monster_api` 里的 `./qblock` → `/ai/cloud/qblock`）；
  - 绝对路径按旧 URL 表查找；
  - 解析结果按链接所在页面的语言加前缀（zh-CN 页面里的链接指向 `/zh-CN/docs/...`）；
  - 外链、`#anchor`、`/img/`、`/cover/` 原样返回；
  - 解析不了的站内链接原样返回，同时记进 `unresolved`，runner 遇到非空就停（Task 9）。
  - 页内锚点（`#programming-code` 等）保持原样：新页面的标题没有 id，这些链接点了不会跳转。记为已知遗留（计划结尾的 Open items）。

**Files:**
- Create: `scripts/lib/legacy-tree.mjs`、`scripts/lib/legacy-tree.test.mjs`
- Modify: spec §2

**Interfaces:**
- Consumes: Task 6 的 `parseFrontmatter`、`deriveSlug`
- Produces（`scripts/lib/legacy-tree.mjs`）：
  - `EN_ROOT = "legacy/docs"`、`ZH_ROOT = "legacy/i18n/zh-CN/docusaurus-plugin-content-docs/current"`。
  - `numberPrefix(name) → { position: number | undefined, name }`。
  - `readLegacyTree({ enRoot?, zhRoot? }) → { docs, categories, resolveLink, unresolved }`：
    - `docs`：先是 26 个 en（按 `sortOrder`），再是 9 个 zh-CN；每项 `{ locale: "en" | "zh-CN", rel, file, section, category, sortOrder, slug, oldUrl, newUrl }`，`rel` 是相对语言根目录的路径（en 和 zh-CN 的同一篇 `rel` 相同，用来配对翻译）。
    - `categories`：`{ [category]: { label, zhLabel? } }`。
    - `resolveLink(href, from) → string`：`from` 是 `docs` 里的一项，或者文章用的 `{ rel, locale }`。
    - `unresolved: string[]`：`"<rel>: <href>"`。

- [ ] **Step 1: 写失败的测试**

Create `scripts/lib/legacy-tree.test.mjs`。前两组用临时目录里造的小树测规则；第三组读真实的 `legacy/`，`legacy/` 删掉后自动跳过（计划 3 删 `legacy/` 时把这一组一起删）：

```js
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { convertMdx } from "./mdx-to-pt.mjs";
import { numberPrefix, readLegacyTree } from "./legacy-tree.mjs";

describe("numberPrefix", () => {
	it.each([
		["08-cloud", 8, "cloud"],
		["00_guide", 0, "guide"],
		["01-run_diffusion", 1, "run_diffusion"],
		["01_3d", undefined, "01_3d"],
		["model", undefined, "model"],
	])("%s", (name, position, rest) => expect(numberPrefix(name)).toEqual({ position, name: rest }));
});

describe("readLegacyTree on a small tree", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "legacy-tree-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));
	const write = (rel, text) => {
		mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		writeFileSync(path.join(dir, rel), text);
	};
	write("en/ai/intro.md", "---\nsidebar_position: 1\n---\n# Intro\n");
	write("en/ai/guide.md", "# Guide\n");
	write("en/ai/05-cloud/_category_.yml", "position: 100 # comment\nlabel: 'Cloud'\n");
	write("en/ai/05-cloud/02-b.mdx", "# B\n[a](./a)\n");
	write("en/ai/05-cloud/01-a.mdx", "---\nslug: /a-top\n---\n# A\n");
	write("en/ai/07-misc/x.mdx", "# X\n");
	write("en/ai/07-misc/x.mdx.bak", "not a doc\n");
	write("en/dev/guide.md", "# Dev guide\n");
	write("zh/ai/05-cloud/02-b.mdx", "# 乙\n");
	write("zh/ai/05-cloud/_category_.yml", "label: 云\n");
	const tree = readLegacyTree({ enRoot: path.join(dir, "en"), zhRoot: path.join(dir, "zh") });
	const by = (locale, rel) => tree.docs.find((d) => d.locale === locale && d.rel === rel);

	it("orders like the Docusaurus sidebar and encodes it in sort_order", () => {
		expect(tree.docs.filter((d) => d.locale === "en").map((d) => `${d.rel}=${d.sortOrder}`)).toEqual([
			"ai/intro.md=1000", // sidebar_position 1
			"ai/07-misc/x.mdx=2001", // folder prefix 7
			"ai/05-cloud/01-a.mdx=3001", // _category_ position 100
			"ai/05-cloud/02-b.mdx=3002",
			"ai/guide.md=4000", // no position: last
			"dev/guide.md=1001000",
		]);
	});
	it("derives category, slugs (de-duplicated), old and new URLs", () => {
		expect(by("en", "ai/guide.md")).toMatchObject({ section: "ai", category: "general", slug: "ai-guide", oldUrl: "/ai/guide" });
		expect(by("en", "dev/guide.md")).toMatchObject({ section: "dev", slug: "dev-guide", newUrl: "/docs/dev-guide" });
		expect(by("en", "ai/05-cloud/01-a.mdx")).toMatchObject({ category: "cloud", slug: "a-top", oldUrl: "/a-top" });
		expect(by("en", "ai/05-cloud/02-b.mdx")).toMatchObject({ slug: "b", oldUrl: "/ai/cloud/b" });
		expect(by("zh-CN", "ai/05-cloud/02-b.mdx")).toMatchObject({ slug: "b", sortOrder: 3002, oldUrl: "/zh-CN/ai/cloud/b", newUrl: "/zh-CN/docs/b" });
		expect(tree.categories).toEqual({ cloud: { label: "Cloud", zhLabel: "云" }, misc: { label: "misc" } });
		expect(tree.docs.some((d) => d.rel.endsWith(".bak"))).toBe(false);
	});
	it("resolves links by URL, by file path and per locale", () => {
		const b = by("en", "ai/05-cloud/02-b.mdx");
		// a relative URL resolves against the page URL /ai/cloud/b: /ai/cloud/a is not a page (a lives at /a-top)
		expect(tree.resolveLink("./a", b)).toBe("./a");
		expect(tree.unresolved).toEqual(["ai/05-cloud/02-b.mdx: ./a"]);
		tree.unresolved.length = 0;
		expect(tree.resolveLink("../07-misc/x.mdx#top", b)).toBe("/docs/x#top");
		expect(tree.resolveLink("/a-top", b)).toBe("/docs/a-top");
		expect(tree.resolveLink("/ai/cloud/b", by("zh-CN", "ai/05-cloud/02-b.mdx"))).toBe("/zh-CN/docs/b");
		for (const href of ["https://x.example/a", "#anchor", "/img/a.png", "mailto:a@b.c"]) expect(tree.resolveLink(href, b)).toBe(href);
		expect(tree.unresolved).toEqual([]);
	});
});

describe.skipIf(!existsSync("legacy/docs"))("readLegacyTree on legacy/", () => {
	const tree = readLegacyTree();
	const en = tree.docs.filter((d) => d.locale === "en");
	const zh = tree.docs.filter((d) => d.locale === "zh-CN");

	it("lists 26 en docs in sidebar order and 9 zh-CN translations", () => {
		expect(en.map((d) => `${d.slug}:${d.section}/${d.category}:${d.sortOrder}`)).toEqual([
			"intro:ai/general:1000",
			"guide:ai/usecase:2001",
			"ai-tools-adhoc:ai/usecase:2002",
			"tools-summary:ai/usecase:2003",
			"ai-product-ideas:ai/article:3001",
			...["rundiffusion", "replicate", "qblock", "monster_api", "lambda", "javis", "paperspace", "latitude", "baseten", "banana", "modal", "datacrunch", "ovhcloud", "runpod", "huggingface", "fullstack"].map(
				(s, i) => `${s}:ai/cloud:${4001 + i}`,
			),
			"prompt-guides:ai/prompt:5001",
			"llm:ai/model:6001",
			"3d:ai/model:6002",
			"overview:dev/general:1001000",
			"learn_ai_coding:dev/general:1002000",
		]);
		expect(zh.map((d) => d.slug).sort()).toEqual(["ai-product-ideas", "guide", "intro", "learn_ai_coding", "monster_api", "prompt-guides", "qblock", "replicate", "rundiffusion"]);
		for (const d of zh) expect(en.find((e) => e.rel === d.rel)).toMatchObject({ slug: d.slug, sortOrder: d.sortOrder });
	});
	it("knows the old URLs, including absolute and relative frontmatter slugs and 01_3d", () => {
		const old = Object.fromEntries(en.map((d) => [d.slug, d.oldUrl]));
		expect(old).toMatchObject({
			rundiffusion: "/rundiffusion",
			qblock: "/ai/cloud/qblock",
			"prompt-guides": "/ai/prompt/prompt-guides",
			"ai-tools-adhoc": "/ai/usecase/ai-tools-adhoc",
			"3d": "/ai/model/01_3d",
			intro: "/ai/intro",
			overview: "/dev/overview",
		});
	});
	it("has the category labels, including the intended zh label", () => {
		expect(tree.categories).toEqual({
			usecase: { label: "Use Case", zhLabel: "神兵利器" },
			article: { label: "Articles" },
			cloud: { label: "Cloud" },
			prompt: { label: "Prompt Engineering" },
			model: { label: "Model" },
		});
	});
	it("resolves every internal link in the corpus", () => {
		for (const d of tree.docs) convertMdx(readFileSync(d.file, "utf8"), { path: d.file, slug: d.slug, rewriteHref: (h) => tree.resolveLink(h, d) });
		expect(tree.unresolved).toEqual([]);
		const qblock = tree.docs.find((d) => d.locale === "zh-CN" && d.slug === "monster_api");
		expect(tree.resolveLink("./qblock", qblock)).toBe("/zh-CN/docs/qblock");
		expect(tree.resolveLink("/ai/usecase/ai-tools-adhoc", { rel: "blog/x/index.mdx", locale: "en" })).toBe("/docs/ai-tools-adhoc");
	});
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run scripts/lib/legacy-tree.test.mjs`
Expected: FAIL：`legacy-tree.mjs` 不存在。

- [ ] **Step 3: 实现**

Create `scripts/lib/legacy-tree.mjs`：

```js
// Inventory of the legacy Docusaurus docs (research p2-research-5-legacy.md §1-§4): every doc with its
// section, category, sort_order, slug, old URL and new URL, plus a link resolver for the converter.
// Docusaurus 3.7 rules reproduced here: number prefixes (lib/numberPrefix.js), autogenerated sidebar order
// (lib/sidebars/generator.js), permalinks with routeBasePath "/" (lib/slug.js), and zh-CN as an overlay
// on the en tree. Removed together with legacy/ in plan 3.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { deriveSlug } from "./mdx-to-pt.mjs";

export const EN_ROOT = "legacy/docs";
export const ZH_ROOT = "legacy/i18n/zh-CN/docusaurus-plugin-content-docs/current";

/** Docusaurus number prefix: `08-cloud` -> 8 / "cloud". Names like `01_3d` (`^\d+[-_.]\d+`) have none. */
export function numberPrefix(name) {
	if (/^\d+[-_.]\d+/.test(name)) return { position: undefined, name };
	const m = /^(\d+)\s*[-_.]+\s*([^-_.\s].*)$/.exec(name);
	return m ? { position: Number(m[1]), name: m[2] } : { position: undefined, name };
}

/** `key: value` from a flat YAML file such as `_category_.yml` (comments and quotes removed). */
function yamlValue(src, key) {
	const m = new RegExp(`^${key}:\\s*(.*?)\\s*(?:#.*)?$`, "m").exec(src);
	return m?.[1] ? m[1].replace(/^(['"])(.*)\1$/, "$2") : undefined;
}

/** Doc files under root, relative and sorted (`.md`/`.mdx` only: skips `_category_.yml` and `.bak`). */
function listDocs(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile() && /\.mdx?$/.test(e.name))
		.map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
		.sort();
}

const sortItems = (items) =>
	items.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));

/**
 * sort_order for every en doc: sectionIndex * 1_000_000 + rootRank * 1000 + docRank, where rootRank is the
 * 1-based place of the doc or its category folder among the section's root items and docRank the place
 * inside the folder (0 for docs at the section root). DocsPage sorts all docs by it, then groups.
 */
function sortOrders(docs, root) {
	const out = new Map();
	const sections = [...new Set(docs.map((d) => d.segs[0]))].sort();
	sections.forEach((section, s) => {
		const inSection = docs.filter((d) => d.segs[0] === section);
		const roots = new Map();
		for (const d of inSection) {
			if (d.segs.length > 3) throw new Error(`${d.rel}: categories nested more than one level are not supported`);
			if (d.segs.length === 2) roots.set(d.rel, { source: d.segs[1], position: d.position, docs: [d] });
			else {
				const folder = d.segs[1];
				if (!roots.has(folder)) {
					const yml = path.join(root, section, folder, "_category_.yml");
					const fromYml = existsSync(yml) ? Number(yamlValue(readFileSync(yml, "utf8"), "position")) : NaN;
					roots.set(folder, { source: folder, position: Number.isFinite(fromYml) ? fromYml : numberPrefix(folder).position, docs: [], folder: true });
				}
				roots.get(folder).docs.push({ ...d, source: d.segs[2] });
			}
		}
		sortItems([...roots.values()]).forEach((item, r) => {
			if (!item.folder) out.set(item.docs[0].rel, s * 1_000_000 + (r + 1) * 1000);
			else sortItems(item.docs).forEach((d, n) => out.set(d.rel, s * 1_000_000 + (r + 1) * 1000 + n + 1));
		});
	});
	return out;
}

/** Old Docusaurus permalink (routeBasePath "/"): absolute frontmatter slug, slug relative to the folder, or the id. */
function oldUrl(segs, fmSlug) {
	const dirs = segs.slice(0, -1).map((d) => numberPrefix(d).name);
	if (typeof fmSlug === "string" && fmSlug.startsWith("/")) return fmSlug;
	const leaf = fmSlug ?? numberPrefix(segs.at(-1).replace(/\.mdx?$/, "")).name;
	return `/${[...dirs, leaf].join("/")}`;
}

/** Slug collisions: every member of a colliding group gets `<category or section>-<slug>`, then more context. */
function uniqueSlugs(docs) {
	const tries = [
		(d) => d.base,
		(d) => `${d.category === "general" ? d.section : d.category}-${d.base}`,
		(d) => `${d.section}-${d.category === "general" ? "root" : d.category}-${d.base}`,
	];
	const slugs = new Map(docs.map((d) => [d.rel, d.base]));
	for (let t = 1; t < tries.length; t++) {
		const count = new Map();
		for (const d of docs) count.set(slugs.get(d.rel), (count.get(slugs.get(d.rel)) ?? 0) + 1);
		for (const d of docs) if (count.get(slugs.get(d.rel)) > 1) slugs.set(d.rel, tries[t](d));
	}
	const all = [...slugs.values()];
	const dup = all.find((s, i) => all.indexOf(s) !== i);
	if (dup) throw new Error(`slug "${dup}" is still not unique; rename a file or set a frontmatter slug`);
	return slugs;
}

/** The whole legacy docs tree. `docs` lists en entries (by sort_order) then their zh-CN translations. */
export function readLegacyTree({ enRoot = EN_ROOT, zhRoot = ZH_ROOT } = {}) {
	const read = (root, rel) => {
		const { data } = parseFrontmatter(readFileSync(path.join(root, rel), "utf8"));
		const segs = rel.split("/");
		const category = segs.length > 2 ? numberPrefix(segs[1]).name : "general";
		return { rel, segs, frontmatter: data, section: segs[0], category, position: data.sidebar_position ?? numberPrefix(segs.at(-1).replace(/\.mdx?$/, "")).position };
	};
	const en = listDocs(enRoot).map((rel) => read(enRoot, rel));
	for (const d of en) d.base = deriveSlug(d.frontmatter, d.rel);
	const orders = sortOrders(en, enRoot);
	const slugs = uniqueSlugs(en);

	const categories = {};
	for (const d of en.filter((x) => x.category !== "general")) {
		const yml = path.join(enRoot, d.segs[0], d.segs[1], "_category_.yml");
		const zhYml = path.join(zhRoot, d.segs[0], d.segs[1], "_category_.yml");
		categories[d.category] ??= {
			label: existsSync(yml) ? yamlValue(readFileSync(yml, "utf8"), "label") : d.category,
			...(existsSync(zhYml) ? { zhLabel: yamlValue(readFileSync(zhYml, "utf8"), "label") } : {}),
		};
	}

	const entry = (d, locale, root) => {
		const slug = slugs.get(d.rel);
		const old = oldUrl(d.segs, d.frontmatter.slug);
		const prefix = locale === "en" ? "" : `/${locale}`;
		return {
			locale,
			rel: d.rel,
			file: path.join(root, d.rel),
			section: d.section,
			category: d.category,
			sortOrder: orders.get(d.rel),
			slug,
			oldUrl: `${prefix}${old}`,
			newUrl: `${prefix}/docs/${slug}`,
		};
	};
	const enDocs = en.map((d) => entry(d, "en", enRoot)).sort((a, b) => a.sortOrder - b.sortOrder);
	const enByRel = new Map(en.map((d) => [d.rel, d]));
	const zhDocs = (existsSync(zhRoot) ? listDocs(zhRoot) : []).map((rel) => {
		const d = enByRel.get(rel);
		if (!d) throw new Error(`${zhRoot}/${rel} has no en original; Docusaurus ignored it, so does the migration`);
		return entry(d, "zh-CN", zhRoot);
	});
	zhDocs.sort((a, b) => a.sortOrder - b.sortOrder);
	const docs = [...enDocs, ...zhDocs];

	const byOldUrl = new Map(enDocs.map((d) => [d.oldUrl, d]));
	const byRel = new Map(enDocs.map((d) => [d.rel, d]));
	const unresolved = [];

	/**
	 * New URL for a link found in `from` (a doc entry, or `{ rel, locale }` for a post). External links,
	 * `#anchors`, images and unknown paths come back unchanged; unknown internal doc links are also pushed
	 * to `unresolved` so the runner can fail on them.
	 */
	function resolveLink(href, from) {
		if (typeof href !== "string" || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href) || /^\/(?:img|cover)\//.test(href)) return href;
		const [target, hash = ""] = href.split(/(?=#)/);
		let doc;
		if (/\.mdx?$/.test(target) && !target.startsWith("/")) {
			doc = byRel.get(path.posix.normalize(path.posix.join(path.posix.dirname(from.rel), target)));
		} else {
			const base = from.oldUrl ? from.oldUrl.replace(/^\/zh-CN(?=\/)/, "") : "/";
			const url = new URL(target, `https://legacy.invalid${base}`).pathname.replace(/\/$/, "");
			doc = byOldUrl.get(url.replace(/^\/zh-CN(?=\/)/, "")) ?? enDocs.find((d) => `/docs/${d.slug}` === url);
		}
		if (!doc) {
			unresolved.push(`${from.rel ?? from.file}: ${href}`);
			return href;
		}
		const locale = from.locale ?? "en";
		return `${locale === "en" ? "" : `/${locale}`}/docs/${doc.slug}${hash}`;
	}

	return { docs, categories, resolveLink, unresolved };
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test`
Expected: PASS（`legacy-tree.test.mjs` 12 个用例，其中最后一组对真实 `legacy/` 断言了上面的 `sort_order`、旧 URL、分类名，以及全部站内链接都能解析）。

- [ ] **Step 5: 更新 spec**

§2 "**建议**：URL 用 `/docs/{slug}` ……"那一条后面加：

"- **已定（计划 2 Task 8）**：`category` 存目录名去掉数字前缀（`cloud`、`prompt`、`usecase`、`article`、`model`；直接在 `ai/`、`dev/` 下的文档存 `general`），显示名由站点代码映射（Cloud / Prompt Engineering / Use Case / Articles / Model；zh-CN 的 usecase 显示"神兵利器"）。存显示名的话，zh-CN 只翻译了部分文档时同一个分类会分成两组。`sort_order` = section 序号 × 1,000,000 + 根条目名次 × 1000 + 分类内名次，复现 Docusaurus 的侧边栏顺序。slug 重名时整组改成 `<category 或 section>-<slug>`（目前没有重名）。规则实现在 `scripts/lib/legacy-tree.mjs`。"

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/legacy-tree.mjs scripts/lib/legacy-tree.test.mjs docs/superpowers/specs/2026-10-15-emdash-migration-design.md
git commit -m "feat(migrate): legacy docs inventory (sidebar order, categories, slugs, old URLs, link resolver)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---
