# 文档站 UX 对齐旧站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新站的 header、docs sidebar、手机抽屉、面包屑、目录、标题锚点和代码高亮在行为上对齐旧 Docusaurus 站，视觉沿用新站，内容一条不动。

**Architecture:**
- 判断逻辑都是纯函数，放在 `packages/web9-site/lib/`，用 vitest 测：
  - `nav.mjs`：菜单拆分、当前项；
  - `docs-nav.mjs`：sidebar、面包屑；
  - 新文件 `anchors.mjs`：标题 id、目录。
- Astro 组件只负责渲染：
  - `Base.astro`：header 和抽屉；
  - `DocsPage.astro` 加上 `DocsSidebar`、`Heading`、`Toc`、`ThemeToggle`、`LanguageMenu` 几个小组件。
- 浏览器端只有几段小脚本：抽屉、主题、目录高亮、按需加载的 Prism。
- 旧站的自定义标题 id 由脚本从 `legacy/` 生成成 JSON，提交进仓库。

**Tech Stack:** Astro 7.4、EmDash 1.3（`emdash/ui` 的 `PortableText`、`Block`、`LiveSearch`）、astro-portabletext 0.11.4、Tailwind 4、github-slugger 2.0.0、prismjs 1.30.0、vitest、Vite 8（rolldown）。

**Spec:** `docs/superpowers/specs/2026-10-17-docs-ux-parity-design.md`（owner 2026-10-17 批准；§3.2、§3.4 在写本计划时按核实结果修订过）。上级 spec：`docs/superpowers/specs/2026-10-15-emdash-migration-design.md` §10（安全模型）、§11（样式规则）。

## 已核实的前提（2026-10-17，写计划时）

| 前提 | 结论 | 依据 |
|---|---|---|
| 怎么给 PortableText 的标题换渲染器 | 传 `components={{ block: Heading }}`，一个组件接管所有 block 样式；不能传 `{ block: { h2: … } }` | emdash 的 `emdashComponents.block` 是单个组件；`mergeComponents`（`node_modules/astro-portabletext/lib/internal.ts`）遇到组件就整个替换，段落会落到 `UnknownBlock` |
| Heading 怎么把 `id` 放到 `<hN>` 上 | 渲染 core 的 `Block`（`import { Block } from "emdash/ui"`），多传一个 `id` | `node_modules/emdash/src/components/Block.astro` 把 `node`、`index`、`isInline` 以外的 prop 展开到元素上，并保留它的 text-align class |
| id 表怎么传给 Heading | `Astro.locals.headingIds`（按请求隔离） | astro-portabletext 只给块组件传 `node`、`index`、`isInline`；换一个新的 `value` 数组会丢掉不可枚举的 edit meta，owner 的行内编辑会失效 |
| 标题 id 和旧站一致 | 一致：35 篇 doc 全部比对过，0 处不同 | 用 `docPayloads(readLegacyTree())`（就是数据库里的 body）加 github-slugger 和旧 id 表算出 id，和 `gh-pages` 旧站页面上的 `<hN id>` 逐个比 |
| 旧站自定义 id | 22 个，全部能按"级别 + 文字"唯一对到 heading 块 | 原型脚本跑过；H1 的 2 个 `{#intro}` 不算（H1 被转换器用作标题） |
| `#programming-code` | 不是自定义 id，是 `## Programming Code` 的 slug | `legacy/docs/ai/88-usecase/00_guide.mdx:183` |
| JSON import | `import X from "./x.json" with { type: "json" }` 在 Node 24、vitest、Vite 8 build 里都能用 | 2026-10-17 在三者里各试过；build 把 JSON 内联 |
| github-slugger、prismjs | 已经是间接依赖（2.0.0、1.30.0），改成直接依赖并钉死版本 | `package-lock.json` |
| Prism 语言依赖 | `prismjs` 主入口已含 markup、css、clike、javascript；要的 10 个语言组件都只扩展这几个，core 加载后可以任意顺序加载 | `node_modules/prismjs/components/prism-*.js` 的 `extend(...)` |
| Prism 的 `manual` | core 在加载时读 `window.Prism.manual`，然后用自己覆盖 `window.Prism` | `node_modules/prismjs/prism.js:56`、`:769` |
| core code 块的底色 | 两种主题下都是 `#1e1e1e` / `#e0e0e0`（写死在 emdash `Code.astro`） | 线上 CSS |
| `LiveSearch` 能渲染两次 | 能：没有固定 id，每个实例是自己的 custom element | `node_modules/emdash/src/components/LiveSearch.astro` |
| logo | `public/img/web9.png` 是 1024 px 的方图，背景是近白色、不透明；裁剪并转成透明底的 64 px 图标，浅色、深色背景下都试过 | 本计划 Task 3 Step 1 的脚本 |

## Global Constraints

每个 task 都隐含遵守本节。

- **不改内容**：数据库里的 doc 一条都不动，不跑 `migrate --overwrite`（spec §2）。
- **`check-public-css`**（`scripts/lib/public-css.mjs`，`npm run build` 的 postbuild 会跑）：
  - 公开 CSS 里任何 `position: fixed` 声明都失败；
  - 类名不能是 `fixed`、`inset-*`、`z-*`、`*-screen`，也不能是带 viewport 单位（`vh`、`dvh`、`vw`…）的 utility，包括 `h-[100dvh]` 这种 arbitrary value；
  - 需要 viewport 单位的尺寸写在组件的 scoped `<style>` 声明里；
  - 不新增任何 `z-index`。
- **样式**：
  - 颜色只用模板 token 类（`bg-surface`、`text-muted`、`border-border`、`text-brand`、`text-text`、`text-text-secondary`…）；
  - 不用 `dark:` 变体，不用 `light-dark()`；
  - Tailwind 只扫 `src/` 和 `packages/web9-blocks/astro`。
- **安全**：
  - 内容 HTML 不带 class；sanitizer 的 class / style 白名单不放宽；
  - 每个 `set:html` 由 `packages/web9-site/render-sinks.test.mjs` 钉住；
  - widget area 只走 `SafeWidgetArea`；
  - 菜单渲染保留 `.slice(0, LIMITS.menuItems)` 和 `label: clampText(item.label, LIMITS.label)` 这两段原文（测试按原文查）。
- **命令**：
  - 测试：`npm test`；单个文件：`npx vitest run <path>`；
  - `npm run build`、`npm run typecheck` 必须先停 dev server（`npx astro dev stop`），跑完再起（`npm run dev -- --port 4321`）；
  - Node 用 24.22.0（仓库 `.nvmrc`）。
- **代码风格**：
  - `.mjs`、`.astro`、`.css`、`.ts` 用 tab 缩进；
  - 注释密度和现有代码一致（文件头一段说明，函数一行 JSDoc）。
- **提交**：
  - 按文件名 `git add`，不用 `git add -A`；
  - 永远不提交 `.env`、`.dev.vars`、`.local/`、`.wrangler/`、`data.db`、`dist/`、`.superpowers/`；
  - commit message 末尾加两行：
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01Jp8xna9DgFiYY23QsXGEnB
    ```
- **浏览器**：implementer 不操作浏览器；浏览器验收由 controller 在 Task 6 用已在运行的 Chrome（CDP，localhost:9222）做。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `packages/web9-site/lib/nav.mjs` | 改 | 加 `isExternalHref`、`splitMenu`、`activeMenuHref`、`LANGUAGES`、`homeLanguages` |
| `packages/web9-site/lib/nav.test.mjs` | 改 | 上面几个函数的测试 |
| `packages/web9-site/lib/docs-nav.mjs` | 改 | 加 `docsSidebar`、`breadcrumbs` |
| `packages/web9-site/lib/docs-nav.test.mjs` | 改 | 测试 |
| `packages/web9-site/lib/anchors.mjs` | 新 | `blockText`、`isHeading`、`legacyIdsFor`、`headingAnchors`、`tocEntries`、`idsByKey` |
| `packages/web9-site/lib/anchors.test.mjs` | 新 | 测试 |
| `packages/web9-site/lib/legacy-anchors.json` | 新（生成） | 旧站的自定义标题 id |
| `scripts/lib/legacy-anchors.mjs` | 新 | 生成逻辑 `legacyAnchors`、`plainHeading` |
| `scripts/legacy-anchors.mjs` | 新 | CLI：重新生成 JSON |
| `scripts/lib/legacy-anchors.test.mjs` | 新 | JSON 内容、和 `legacy/` 重新生成的结果比对 |
| `public/img/logo-64.png` | 新 | header 图标 |
| `src/components/ThemeToggle.astro` | 新 | 三态主题按钮 |
| `src/components/LanguageMenu.astro` | 新 | 语言下拉 / 列表 |
| `src/layouts/Base.astro` | 改 | header、抽屉、页脚、脚本、样式 |
| `packages/web9-site/render-sinks.test.mjs` | 改 | 去掉 `ICONS` 的 `set:html`；菜单链接数 2 → 4 |
| `src/env.d.ts` | 新 | `App.Locals.headingIds` 类型 |
| `src/components/DocsSidebar.astro` | 新 | 当前 section 的 sidebar |
| `src/components/Heading.astro` | 新 | doc 正文的 `block` 渲染器（标题 id 和 `#` 链接） |
| `src/components/Toc.astro` | 新 | "On this page" 列表 |
| `src/components/DocsPage.astro` | 改 | 布局、面包屑、目录、标题锚点、把导航数据传给 Base |
| `packages/web9-blocks/astro/prism-client.mjs` | 新 | 按需加载 Prism 并高亮 |
| `packages/web9-blocks/astro/prism-client.d.mts` | 新 | 类型 |
| `packages/web9-blocks/prism-client.test.mjs` | 新 | 语言清单、每种语言能高亮 |
| `packages/web9-blocks/package.json` | 改 | `exports` 加 `./prism-client` |
| `packages/web9-blocks/astro/blocks.css` | 改 | 深色代码底和 Prism 配色 |
| `src/pages/posts/[slug].astro` | 改 | 文章页的代码高亮 |
| `package.json`、`package-lock.json` | 改 | `github-slugger` 2.0.0、`prismjs` 1.30.0 直接依赖 |

Task 顺序：1 → 2 → 3 → 4 → 5 → 6。Task 3 用 Task 1 的函数；Task 4 用 Task 1、2、3；Task 5 改 Task 4 写好的 `DocsPage.astro`。

---

### Task 1: 菜单和 sidebar 的纯函数

**Files:**
- Modify: `packages/web9-site/lib/nav.mjs`（文件末尾追加）
- Modify: `packages/web9-site/lib/nav.test.mjs`（改第 2 行 import，文件末尾追加）
- Modify: `packages/web9-site/lib/docs-nav.mjs`（文件末尾追加）
- Modify: `packages/web9-site/lib/docs-nav.test.mjs`（改第 4 行 import，文件末尾追加）

**Interfaces:**
- Consumes: `localizeHref(href, locale)`（`nav.mjs` 已有）；`groupDocs(entries, locale)`、`groupLabel(section, category, locale)`（`docs-nav.mjs` 已有）。`groupDocs` 返回 `[{ key: "<section>/<category>", label, items }]`，`items` 是 `{ data: { slug, title, section, category, sort_order } }`。
- Produces:
  - `isExternalHref(href: unknown): boolean`：`http://` 或 `https://` 开头（不分大小写）。
  - `splitMenu(items: { href: string }[]): { internal: item[], external: item[] }`：保持原顺序。
  - `activeMenuHref(items: { href: unknown }[], path: string, docNav?: { section: string; sectionOf: Record<string, string> }): string | undefined`。
  - `LANGUAGES: { code: "en" | "zh-CN"; label: string }[]` = `[{ code: "en", label: "English" }, { code: "zh-CN", label: "中文" }]`。
  - `homeLanguages(): { code, label, href }[]`：各语言首页。
  - `docsSidebar(groups, section: string, currentSlug: string): { rootItems: Entry[]; categories: { key: string; label: string; open: boolean; items: Entry[] }[] }`。
  - `breadcrumbs(data: { section?: string | null; category?: string | null; title: string }, locale: string): string[]`：section 名、分类名（`general` 没有）、标题。

- [ ] **Step 1: 写失败的测试（nav）**

`packages/web9-site/lib/nav.test.mjs` 第 2 行改成：

```js
import { activeMenuHref, homeLanguages, isExternalHref, linkRel, localizeHref, splitMenu } from "./nav.mjs";
```

文件末尾追加：

```js
describe("splitMenu", () => {
	it("puts absolute http(s) links on the right and everything else on the left, in menu order", () => {
		const items = [{ href: "/docs/intro" }, { href: "https://github.com/x" }, { href: "/posts" }, { href: "HTTP://example.com" }];
		const { internal, external } = splitMenu(items);
		expect(internal.map((i) => i.href)).toEqual(["/docs/intro", "/posts"]);
		expect(external.map((i) => i.href)).toEqual(["https://github.com/x", "HTTP://example.com"]);
	});
	it("counts only http and https as external", () => {
		for (const href of ["//cdn.example.com/x", "mailto:a@b.c", "/x", "", undefined, null]) expect(isExternalHref(href), String(href)).toBe(false);
	});
});

describe("activeMenuHref", () => {
	const items = [{ href: "/docs/intro" }, { href: "/docs/overview" }, { href: "/posts" }, { href: "https://github.com/x" }];
	const sectionOf = { intro: "ai", guide: "ai", overview: "dev", learn_ai_coding: "dev" };
	it("on a doc page, picks the item that links to a doc of the same section", () => {
		expect(activeMenuHref(items, "/docs/guide", { section: "ai", sectionOf })).toBe("/docs/intro");
		expect(activeMenuHref(items, "/docs/learn_ai_coding", { section: "dev", sectionOf })).toBe("/docs/overview");
	});
	it("reads zh-CN menu links", () => {
		const zh = [{ href: "/zh-CN/docs/intro" }, { href: "/zh-CN/docs/overview" }, { href: "/posts" }];
		expect(activeMenuHref(zh, "/zh-CN/docs/learn_ai_coding", { section: "dev", sectionOf })).toBe("/zh-CN/docs/overview");
	});
	it("highlights nothing on a doc page whose section no item links to", () => {
		expect(activeMenuHref(items, "/docs/x", { section: "other", sectionOf })).toBeUndefined();
		expect(activeMenuHref(items, "/docs/x", { section: "ai", sectionOf: {} })).toBeUndefined();
	});
	it("picks the /posts item on posts, tag and category pages", () => {
		for (const path of ["/posts", "/posts/", "/posts/hello", "/tag/ai", "/category/news"]) expect(activeMenuHref(items, path), path).toBe("/posts");
		expect(activeMenuHref(items, "/postscript")).toBeUndefined();
	});
	it("matches any other page by its exact path, ignoring a trailing slash", () => {
		expect(activeMenuHref([{ href: "/search" }], "/search/")).toBe("/search");
		expect(activeMenuHref(items, "/")).toBeUndefined();
	});
	it("never picks an external item or an item without a string href", () => {
		expect(activeMenuHref([{ href: "https://www.web9.ai/posts" }, { href: null }, {}], "/posts")).toBeUndefined();
	});
});

describe("homeLanguages", () => {
	it("links each locale's home page", () => {
		expect(homeLanguages()).toEqual([
			{ code: "en", label: "English", href: "/" },
			{ code: "zh-CN", label: "中文", href: "/zh-CN/" },
		]);
	});
});
```

- [ ] **Step 2: 写失败的测试（docs-nav）**

`packages/web9-site/lib/docs-nav.test.mjs` 第 4 行改成：

```js
import { CATEGORY_LABELS, SECTION_LABELS, breadcrumbs, docsSidebar, groupDocs, groupLabel } from "./docs-nav.mjs";
```

文件末尾追加（`doc(slug, section, category, sort_order)` 是这个文件第 6 行已有的工厂函数）：

```js
describe("docsSidebar", () => {
	const entries = [
		doc("intro", "ai", "general", 1000),
		doc("guide", "ai", "usecase", 2001),
		doc("tools", "ai", "usecase", 2002),
		doc("replicate", "ai", "cloud", 3001),
		doc("overview", "dev", "general", 1001000),
		doc("learn", "dev", "general", 1002000),
	];
	it("returns only the current section: root docs first, then the categories, only the current one open", () => {
		const s = docsSidebar(groupDocs(entries, "en"), "ai", "tools");
		expect(s.rootItems.map((e) => e.data.slug)).toEqual(["intro"]);
		expect(s.categories.map(({ key, label, open, items }) => [key, label, open, items.map((e) => e.data.slug)])).toEqual([
			["ai/usecase", "Use Case", true, ["guide", "tools"]],
			["ai/cloud", "Cloud", false, ["replicate"]],
		]);
	});
	it("opens no category on a root doc and labels categories per locale", () => {
		const s = docsSidebar(groupDocs(entries, "zh-CN"), "ai", "intro");
		expect(s.categories.map((c) => [c.label, c.open])).toEqual([
			["神兵利器", false],
			["Cloud", false],
		]);
	});
	it("gives a section without categories as root docs only", () => {
		const s = docsSidebar(groupDocs(entries, "en"), "dev", "learn");
		expect(s.rootItems.map((e) => e.data.slug)).toEqual(["overview", "learn"]);
		expect(s.categories).toEqual([]);
	});
});

describe("breadcrumbs", () => {
	it("is the section, the category (none for general), then the title", () => {
		expect(breadcrumbs({ section: "ai", category: "usecase", title: "Guide" }, "en")).toEqual(["AI", "Use Case", "Guide"]);
		expect(breadcrumbs({ section: "dev", category: "general", title: "Overview" }, "en")).toEqual(["Dev", "Overview"]);
		expect(breadcrumbs({ title: "Defaults" }, "en")).toEqual(["AI", "Defaults"]);
	});
	it("uses the zh-CN category labels", () => {
		expect(breadcrumbs({ section: "ai", category: "usecase", title: "指南" }, "zh-CN")).toEqual(["AI", "神兵利器", "指南"]);
	});
});
```

- [ ] **Step 3: 跑测试，确认失败**

Run: `npx vitest run packages/web9-site/lib/nav.test.mjs packages/web9-site/lib/docs-nav.test.mjs`
Expected: FAIL，报 `splitMenu is not a function` / `docsSidebar is not a function` 一类错误（新 import 不存在）。

- [ ] **Step 4: 实现（nav.mjs）**

`packages/web9-site/lib/nav.mjs` 末尾追加：

```js

/** An absolute http(s) URL. The header shows these on the right with an external-link icon (spec 2026-10-17 docs UX §3.1). */
export const isExternalHref = (href) => typeof href === "string" && /^https?:\/\//i.test(href);

/** Menu items split for the header: site links on the left, external links on the right, each in menu order. */
export function splitMenu(items) {
	return { internal: items.filter((i) => !isExternalHref(i.href)), external: items.filter((i) => isExternalHref(i.href)) };
}

const DOC_HREF = /^(?:\/zh-CN)?\/docs\/([^/?#]+)\/?$/;
const BLOG_PATH = /^\/(?:posts|tag|category)(?:\/|$)/;
const trimSlash = (path) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/**
 * The href of the menu item to highlight, or undefined (spec 2026-10-17 docs UX §3.1). `docNav` is passed on doc pages
 * only: the doc's section and a slug -> section map of the docs the page loaded. A doc page highlights the first item
 * linking to a doc of the same section; /posts, /tag/* and /category/* highlight the item linking to /posts; any other
 * page the item whose path is the request path. External items are never highlighted.
 */
export function activeMenuHref(items, path, docNav) {
	const hrefs = items.map((i) => i?.href).filter((h) => typeof h === "string" && !isExternalHref(h));
	if (docNav) {
		return hrefs.find((h) => {
			const slug = DOC_HREF.exec(h)?.[1];
			return slug !== undefined && Object.hasOwn(docNav.sectionOf, slug) && docNav.sectionOf[slug] === docNav.section;
		});
	}
	const here = trimSlash(path);
	if (BLOG_PATH.test(here)) return hrefs.find((h) => trimSlash(h) === "/posts");
	return hrefs.find((h) => trimSlash(h) === here);
}

/** The site's locales in menu order, each named in its own language. */
export const LANGUAGES = [
	{ code: "en", label: "English" },
	{ code: "zh-CN", label: "中文" },
];

/** The language menu on pages that are not docs: each locale's home page. */
export const homeLanguages = () => LANGUAGES.map((l) => ({ ...l, href: localizeHref("/", l.code) }));
```

- [ ] **Step 5: 实现（docs-nav.mjs）**

`packages/web9-site/lib/docs-nav.mjs` 末尾追加：

```js

/**
 * The docs sidebar (spec 2026-10-17 docs UX §3.2): the current section only, as on the old site. Docs at the section
 * root come first, then one group per category in groupDocs order; only the category holding the current doc is open.
 */
export function docsSidebar(groups, section, currentSlug) {
	const mine = groups.filter((g) => g.key.startsWith(`${section}/`));
	const isRoot = (g) => g.key === `${section}/general`;
	return {
		rootItems: mine.filter(isRoot).flatMap((g) => g.items),
		categories: mine
			.filter((g) => !isRoot(g))
			.map(({ key, label, items }) => ({ key, label, open: items.some((e) => e.data.slug === currentSlug), items })),
	};
}

/** The breadcrumb trail after the home icon: section, category (none for "general"), then the doc title. */
export function breadcrumbs(data, locale) {
	const section = data.section ?? "ai";
	const category = data.category ?? "general";
	return [
		groupLabel(section, "general", locale),
		...(category === "general" ? [] : [groupLabel(section, category, locale)]),
		data.title,
	];
}
```

- [ ] **Step 6: 跑测试，确认通过**

Run: `npx vitest run packages/web9-site/lib/nav.test.mjs packages/web9-site/lib/docs-nav.test.mjs`
Expected: PASS（原有测试和新测试全过）。

- [ ] **Step 7: 跑全部测试**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 8: Commit**

```bash
git add packages/web9-site/lib/nav.mjs packages/web9-site/lib/nav.test.mjs packages/web9-site/lib/docs-nav.mjs packages/web9-site/lib/docs-nav.test.mjs
git commit -m "feat(nav): menu split, active item, docs sidebar and breadcrumb helpers

Pure functions for the docs UX parity work (spec 2026-10-17 §3.1, §3.2).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Jp8xna9DgFiYY23QsXGEnB"
```

---

### Task 2: 标题锚点和旧站 id 表

**Files:**
- Modify: `package.json`、`package-lock.json`（`github-slugger` 2.0.0）
- Create: `packages/web9-site/lib/anchors.mjs`
- Create: `packages/web9-site/lib/anchors.test.mjs`
- Create: `packages/web9-site/lib/legacy-anchors.json`（生成）
- Create: `scripts/lib/legacy-anchors.mjs`
- Create: `scripts/legacy-anchors.mjs`
- Create: `scripts/lib/legacy-anchors.test.mjs`

**Interfaces:**
- Consumes: `docPayloads(tree)`（`scripts/lib/docs-payloads.mjs`，返回 `[{ doc: { file, locale, slug, … }, want: { data: { body } } }]`，body 就是迁移写进数据库的）；`readLegacyTree()`（`scripts/lib/legacy-tree.mjs`）。
- Produces:
  - `blockText(block): string`：children 里 `text` 的拼接。
  - `isHeading(block): boolean`：`_type === "block"` 且 `style` 是 `h2`–`h6`。
  - `legacyIdsFor(locale: string, slug: string): Record<string, string>`：`{ "<标题文字>": "<id>" }`，没有就是 `{}`。
  - `headingAnchors(body: unknown, legacyIds?: Record<string, string>): { key: string | null; level: number; text: string; id: string }[]`。
  - `tocEntries(anchors): anchors`：`level <= 3` 且 `id` 非空。
  - `idsByKey(anchors): Record<string, string>`：有 `key` 和 `id` 的条目。
  - `legacyAnchors(tree?): Record<string, Record<string, string>>`、`plainHeading(text): string`（`scripts/lib/legacy-anchors.mjs`）。

规则（spec §3.2，和 Docusaurus 一致）：
- 有 `_key` 的块：标题文字在旧 id 表里、且这段文字还没用过表里的 id，就用表里的 id；否则用 page 级 `GithubSlugger` 的 `slug()`（同名得到 `-1`、`-2`）。表里的 id 不占 slugger 的计数（Docusaurus 也这样）。
- 没有 `_key` 的块：用不去重的 `slug(text)`，不查旧 id 表。Heading.astro 对这种块也这么算，两边一致。
- 文字去掉空白后为空：`id` 是 `""`，不进目录，标题不带 id。

- [ ] **Step 1: 加依赖**

Run: `npm install --save-exact github-slugger@2.0.0`
Expected: `package.json` 的 `dependencies` 多一行 `"github-slugger": "2.0.0"`；`package-lock.json` 里 `node_modules/github-slugger` 仍是 2.0.0。

- [ ] **Step 2: 写失败的测试**

Create `packages/web9-site/lib/anchors.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { blockText, headingAnchors, idsByKey, isHeading, legacyIdsFor, tocEntries } from "./anchors.mjs";

const span = (text, marks = []) => ({ _type: "span", text, marks });
const h = (style, text, _key) => ({ _type: "block", _key, style, children: [span(text)] });

describe("blockText", () => {
	it("joins the text of the children, marked spans included, and ignores anything else", () => {
		expect(blockText({ children: [span("Why do we need "), span("class", ["code"]), span("?")] })).toBe("Why do we need class?");
		expect(blockText({ children: [span("a"), { _type: "image" }, null, span("b")] })).toBe("ab");
		expect(blockText({})).toBe("");
		expect(blockText(null)).toBe("");
	});
});

describe("isHeading", () => {
	it("is true for text blocks styled h2 to h6 only", () => {
		for (const style of ["h2", "h3", "h4", "h5", "h6"]) expect(isHeading(h(style, "x", "k")), style).toBe(true);
		for (const style of ["h1", "normal", "blockquote", "h7", undefined]) expect(isHeading(h(style, "x", "k")), String(style)).toBe(false);
		expect(isHeading({ _type: "code", style: "h2" })).toBe(false);
		expect(isHeading(null)).toBe(false);
	});
});

describe("headingAnchors", () => {
	it("slugs headings as the old site did (expected ids copied from its pages)", () => {
		const body = [
			h("h2", "Outline - 3 Modules", "a"),
			h("h2", "大纲 - 3大模块", "b"),
			h("h2", "目的 - Have Fun", "c"),
			h("h3", "LLM之5虎上将", "d"),
			h("h2", "Programming Code", "e"),
			h("h2", "bonus - package", "f"),
		];
		expect(headingAnchors(body).map((a) => a.id)).toEqual([
			"outline---3-modules",
			"大纲---3大模块",
			"目的---have-fun",
			"llm之5虎上将",
			"programming-code",
			"bonus---package",
		]);
	});
	it("slugs the text of every span, inline code included", () => {
		const body = [{ _type: "block", _key: "k", style: "h3", children: [span("Why do we need "), span("class", ["code"]), span("?")] }];
		expect(headingAnchors(body)).toEqual([{ key: "k", level: 3, text: "Why do we need class?", id: "why-do-we-need-class" }]);
	});
	it("de-duplicates repeated text across levels with -1, -2", () => {
		const body = [h("h2", "Breakdown", "a"), h("h3", "Breakdown", "b"), h("h4", "Breakdown", "c")];
		expect(headingAnchors(body).map((a) => a.id)).toEqual(["breakdown", "breakdown-1", "breakdown-2"]);
	});
	it("takes the old site's custom id first, once per text; like Docusaurus, a custom id does not reserve its slug", () => {
		const legacy = { "What NOT ?": "what-is-not", Function: "function" };
		const body = [h("h3", "What NOT ?", "a"), h("h2", "Function", "b"), h("h2", "function", "c"), h("h3", "What NOT ?", "d")];
		expect(headingAnchors(body, legacy).map((a) => a.id)).toEqual(["what-is-not", "function", "function", "what-not-"]);
	});
	it("gives a block without _key the plain slug of its text: not de-duplicated, no custom id", () => {
		const keyless = { _type: "block", style: "h2", children: [span("Same")] };
		expect(headingAnchors([keyless, keyless, h("h2", "Same", "k")], { Same: "custom" })).toEqual([
			{ key: null, level: 2, text: "Same", id: "same" },
			{ key: null, level: 2, text: "Same", id: "same" },
			{ key: "k", level: 2, text: "Same", id: "custom" },
		]);
	});
	it("gives an empty heading no id and skips everything that is not an h2-h6 text block", () => {
		const body = [h("h2", "  ", "a"), h("h1", "Title", "b"), h("normal", "Text", "c"), { _type: "code", _key: "d", code: "x" }, null, "x"];
		expect(headingAnchors(body)).toEqual([{ key: "a", level: 2, text: "  ", id: "" }]);
		expect(headingAnchors(undefined)).toEqual([]);
	});
});

describe("tocEntries", () => {
	it("keeps the h2 and h3 entries that have an id", () => {
		const anchors = headingAnchors([h("h2", "A", "a"), h("h3", "B", "b"), h("h4", "C", "c"), h("h2", " ", "d")]);
		expect(tocEntries(anchors).map((a) => a.id)).toEqual(["a", "b"]);
	});
});

describe("idsByKey", () => {
	it("maps each keyed heading that has an id to that id", () => {
		const keyless = { _type: "block", style: "h2", children: [span("B")] };
		expect(idsByKey(headingAnchors([h("h2", "A", "a"), keyless, h("h3", " ", "e")]))).toEqual({ a: "a" });
	});
});

describe("legacyIdsFor", () => {
	it("returns one doc's custom ids, or none", () => {
		expect(legacyIdsFor("en", "learn_ai_coding")["What NOT ?"]).toBe("what-is-not");
		expect(legacyIdsFor("zh-CN", "learn_ai_coding")["函数"]).toBe("function");
		expect(legacyIdsFor("en", "no-such-doc")).toEqual({});
	});
});
```

Create `scripts/lib/legacy-anchors.test.mjs`：

```js
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headingAnchors, legacyIdsFor } from "../../packages/web9-site/lib/anchors.mjs";
import TABLE from "../../packages/web9-site/lib/legacy-anchors.json" with { type: "json" };
import { docPayloads } from "./docs-payloads.mjs";
import { legacyAnchors, plainHeading } from "./legacy-anchors.mjs";
import { readLegacyTree } from "./legacy-tree.mjs";

describe("plainHeading", () => {
	it("drops inline code, bold and link syntax, as the converter's spans do", () => {
		expect(plainHeading("Why do we need `class`? ")).toBe("Why do we need class?");
		expect(plainHeading("**Bold** and [link](https://x.y)")).toBe("Bold and link");
	});
});

describe("legacy-anchors.json", () => {
	it("holds the old site's 22 custom heading ids, including the ones site links use", () => {
		expect(Object.values(TABLE).reduce((n, page) => n + Object.keys(page).length, 0)).toBe(22);
		expect(TABLE["en/learn_ai_coding"]["What NOT ?"]).toBe("what-is-not");
		expect(TABLE["zh-CN/learn_ai_coding"]["目标不是什么？"]).toBe("what-is-not");
		expect(TABLE["zh-CN/learn_ai_coding"]["函数"]).toBe("function");
	});
});

// Like docs-nav.test.mjs: runs while legacy/ exists, skipped once it is removed after the cutover.
describe.skipIf(!existsSync("legacy/docs"))("legacy-anchors.json against legacy/", () => {
	it("is what `node scripts/legacy-anchors.mjs` writes", () => {
		expect(legacyAnchors()).toEqual(TABLE);
	});
	it("gives the anchors the old site's links use: #what-is-not and #function, and #programming-code from the slug", () => {
		const payloads = docPayloads(readLegacyTree());
		const ids = (locale, slug) => {
			const { want } = payloads.find((p) => p.doc.locale === locale && p.doc.slug === slug);
			return headingAnchors(want.data.body, legacyIdsFor(locale, slug)).map((a) => a.id);
		};
		for (const locale of ["en", "zh-CN"]) expect(ids(locale, "learn_ai_coding"), locale).toEqual(expect.arrayContaining(["what-is-not", "function"]));
		expect(ids("en", "guide")).toContain("programming-code");
	});
});
```

- [ ] **Step 3: 跑测试，确认失败**

Run: `npx vitest run packages/web9-site/lib/anchors.test.mjs scripts/lib/legacy-anchors.test.mjs`
Expected: FAIL（`anchors.mjs`、`legacy-anchors.json`、`scripts/lib/legacy-anchors.mjs` 不存在）。

- [ ] **Step 4: 实现 `anchors.mjs`，先放一个空的 JSON**

`anchors.mjs` 要 import JSON，所以先建一个只有 `{}` 的文件，Step 6 再生成真内容：

```bash
printf '{}\n' > packages/web9-site/lib/legacy-anchors.json
```

Create `packages/web9-site/lib/anchors.mjs`：

```js
// Heading ids for doc pages (spec 2026-10-17 docs UX §3.2): the old site's custom id where it had one
// (legacy-anchors.json, made by scripts/legacy-anchors.mjs), else the slug Docusaurus gives (github-slugger,
// de-duplicated per page with "-1", "-2"). The ids of all 35 migrated docs matched the old site's pages (2026-10-17).
import GithubSlugger, { slug } from "github-slugger";
import LEGACY from "./legacy-anchors.json" with { type: "json" };

/** The text of a Portable Text block: its children's text joined (an inline-code or linked span keeps its text). */
export function blockText(block) {
	if (!Array.isArray(block?.children)) return "";
	return block.children.map((c) => (typeof c?.text === "string" ? c.text : "")).join("");
}

/** A top-level text block styled h2-h6. The doc title is the page's h1, so h1 blocks get no anchor. */
export const isHeading = (block) => block?._type === "block" && typeof block.style === "string" && /^h[2-6]$/.test(block.style);

/** The old site's custom ids for one doc: { "<heading text>": "<id>" }. */
export function legacyIdsFor(locale, slug) {
	const key = `${locale}/${slug}`;
	return Object.hasOwn(LEGACY, key) ? LEGACY[key] : {};
}

/**
 * [{ key, level, text, id }] for every h2-h6 block of `body`, in order. A keyed heading takes its custom id from
 * `legacyIds` (once per text), else the page slugger's slug; custom ids do not count for de-duplication, as in
 * Docusaurus. A block without _key gets the plain slug of its text (Heading.astro computes the same); empty text, no id.
 */
export function headingAnchors(body, legacyIds = {}) {
	const slugger = new GithubSlugger();
	const usedCustom = new Set();
	const anchors = [];
	for (const block of Array.isArray(body) ? body : []) {
		if (!isHeading(block)) continue;
		const text = blockText(block);
		const key = typeof block._key === "string" && block._key ? block._key : null;
		let id;
		if (!text.trim()) id = "";
		else if (!key) id = slug(text);
		else if (Object.hasOwn(legacyIds, text) && !usedCustom.has(text)) {
			usedCustom.add(text);
			id = legacyIds[text];
		} else id = slugger.slug(text);
		anchors.push({ key, level: Number(block.style.slice(1)), text, id });
	}
	return anchors;
}

/** "On this page": the h2 and h3 entries that have an id (Docusaurus's default range). */
export const tocEntries = (anchors) => anchors.filter((a) => a.id && a.level <= 3);

/** { <block _key>: <id> }, what DocsPage hands Heading.astro through Astro.locals.headingIds. */
export const idsByKey = (anchors) => Object.fromEntries(anchors.filter((a) => a.key && a.id).map((a) => [a.key, a.id]));
```

- [ ] **Step 5: 实现生成器**

Create `scripts/lib/legacy-anchors.mjs`：

```js
// The old site's custom heading ids (`## Title {#id}`) for packages/web9-site/lib/legacy-anchors.json (spec 2026-10-17
// docs UX §3.2). The converter drops `{#id}` (mdx-to-pt.mjs), so the ids cannot be derived from the stored text.
// Each source heading is matched by level and text to exactly one heading block of the body the migration stored
// (docPayloads); none or several throws. Not by position: the first H1 becomes the title and headings inside
// <details> become Markdown in a block. Removed together with legacy/.
import { readFileSync } from "node:fs";
import { blockText, isHeading } from "../../packages/web9-site/lib/anchors.mjs";
import { docPayloads } from "./docs-payloads.mjs";
import { readLegacyTree } from "./legacy-tree.mjs";

const HEADING_ID = /^(#{2,6})\s+(.*?)\s*\{#([\w-]+)\}\s*$/;

/** A heading's source text as the converter leaves it in spans: no inline-code backticks, bold markers or link syntax. */
export const plainHeading = (text) =>
	text
		.replace(/`([^`]*)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.trim();

/** { "<locale>/<slug>": { "<heading text>": "<id>" } } for every legacy doc with a custom heading id. */
export function legacyAnchors(tree = readLegacyTree()) {
	const table = {};
	for (const { doc, want } of docPayloads(tree)) {
		const ids = readFileSync(doc.file, "utf8")
			.split("\n")
			.map((line) => HEADING_ID.exec(line))
			.filter(Boolean);
		if (!ids.length) continue;
		const headings = want.data.body.filter(isHeading);
		const page = {};
		for (const [, hashes, source, id] of ids) {
			const text = plainHeading(source);
			const hits = headings.filter((b) => b.style === `h${hashes.length}` && blockText(b) === text);
			if (hits.length !== 1) throw new Error(`${doc.file}: "${text}" {#${id}} matches ${hits.length} heading blocks`);
			page[text] = id;
		}
		table[`${doc.locale}/${doc.slug}`] = page;
	}
	return table;
}
```

Create `scripts/legacy-anchors.mjs`：

```js
#!/usr/bin/env node
// Usage: node scripts/legacy-anchors.mjs (from the repo root, while legacy/ exists)
// Regenerates packages/web9-site/lib/legacy-anchors.json (scripts/lib/legacy-anchors.mjs);
// scripts/lib/legacy-anchors.test.mjs fails while the committed file differs from what this writes.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { legacyAnchors } from "./lib/legacy-anchors.mjs";

const out = fileURLToPath(new URL("../packages/web9-site/lib/legacy-anchors.json", import.meta.url));
const table = legacyAnchors();
writeFileSync(out, `${JSON.stringify(table, null, "\t")}\n`);
const ids = Object.values(table).reduce((n, page) => n + Object.keys(page).length, 0);
console.log(`${ids} ids in ${Object.keys(table).length} docs -> ${out}`);
```

- [ ] **Step 6: 生成 JSON**

Run: `node scripts/legacy-anchors.mjs`
Expected: `22 ids in 5 docs -> …/packages/web9-site/lib/legacy-anchors.json`。文件里有 5 个 key：`en/ai-tools-adhoc`（6 个）、`en/replicate`（1）、`en/learn_ai_coding`（6）、`zh-CN/replicate`（1）、`zh-CN/learn_ai_coding`（8）。

- [ ] **Step 7: 跑测试，确认通过**

Run: `npx vitest run packages/web9-site/lib/anchors.test.mjs scripts/lib/legacy-anchors.test.mjs`
Expected: PASS。

- [ ] **Step 8: 跑全部测试**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json packages/web9-site/lib/anchors.mjs packages/web9-site/lib/anchors.test.mjs packages/web9-site/lib/legacy-anchors.json scripts/lib/legacy-anchors.mjs scripts/legacy-anchors.mjs scripts/lib/legacy-anchors.test.mjs
git commit -m "feat(docs): heading ids that match the old site, with its custom ids

github-slugger slugs per page like Docusaurus; the 22 custom {#id} ids the converter
dropped come back from legacy-anchors.json, generated from legacy/ (spec 2026-10-17 §3.2).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Jp8xna9DgFiYY23QsXGEnB"
```

---

### Task 3: Header、抽屉和主题按钮

**Files:**
- Create: `public/img/logo-64.png`（生成）
- Create: `src/components/ThemeToggle.astro`
- Create: `src/components/LanguageMenu.astro`
- Modify: `src/layouts/Base.astro`
- Modify: `packages/web9-site/render-sinks.test.mjs`

**Interfaces:**
- Consumes（Task 1）：`activeMenuHref`、`homeLanguages`、`splitMenu`（`packages/web9-site/lib/nav.mjs`）。
- Produces（Task 4 用）：
  - `Base` 的新 prop `docNav?: { section: string; sectionOf: Record<string, string> }`；
  - `Base` 的新 prop `languages?: { code: string; label: string; href: string }[]`；
  - `Base` 的具名 slot `drawer`：放在抽屉里菜单和语言/主题下面（DocsPage 往里放 `DocsSidebar`）。
  - `ThemeToggle`（无 prop）、`LanguageMenu`（`languages`、`locale`、`variant?: "dropdown" | "list"`）。

- [ ] **Step 1: 生成 logo 图标**

从仓库根目录跑（裁出 `web9.png` 中间的图形，缩到 64 px，再把近白背景转成透明：alpha 看像素最暗的通道比背景暗多少，颜色从白底上还原）：

```bash
node --input-type=module <<'EOF'
import sharp from "sharp";
const { data, info } = await sharp("public/img/web9.png")
	.extract({ left: 214, top: 230, width: 600, height: 600 })
	.resize(64, 64, { kernel: "lanczos3" })
	.ensureAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true });
const BG = 250;
for (let i = 0; i < data.length; i += 4) {
	const a = Math.max(0, Math.min(1, (BG - Math.min(data[i], data[i + 1], data[i + 2])) / (BG - 40)));
	if (a === 0) {
		data[i + 3] = 0;
		continue;
	}
	for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - 255 * (1 - a)) / a)));
	data[i + 3] = Math.round(a * 255);
}
await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile("public/img/logo-64.png");
EOF
```

Expected: `public/img/logo-64.png`，64×64，约 10 KB。`npx vitest run scripts/lib/raster-images.test.mjs` 通过（宽度和大小都在限制内）。

- [ ] **Step 2: 改 render-sinks 测试（先让它失败）**

`packages/web9-site/render-sinks.test.mjs`：

1. "menu links in Base.astro" 里：

```js
		expect(targets.length).toBe(2);
```

改成：

```js
		// header site links, header external links, drawer, footer
		expect(targets.length).toBe(4);
```

2. "set:html in src/ and the block renderers" 的第一个 `it`：标题里的 `static theme icons, ` 删掉，期望列表里删掉 `["src/layouts/Base.astro", "ICONS[b.theme]"],` 这一行。改完是：

```js
	it("appears only at these sites: the search snippet core has escaped, and sanitized Markdown or HTML", () => {
		expect(sinks).toEqual([
			["packages/web9-blocks/astro/Callout.astro", "renderInlineMarkdown(title)"],
			["packages/web9-blocks/astro/Callout.astro", "renderMarkdown(node?.body)"],
			["packages/web9-blocks/astro/Details.astro", 'renderInlineMarkdown(node?.summary ?? "Details")'],
			["packages/web9-blocks/astro/Details.astro", "renderMarkdown(node?.body)"],
			["packages/web9-blocks/astro/HtmlBlock.astro", "html"],
			["packages/web9-blocks/astro/Tabs.astro", "renderMarkdown(tab.body)"],
			["packages/web9-blocks/astro/ToolGrid.astro", 'renderInlineMarkdown(tool.tagline.replace(/\\n/g, "<br>"))'],
			["src/pages/search.astro", "result.snippet"],
		]);
	});
```

Run: `npx vitest run packages/web9-site/render-sinks.test.mjs`
Expected: FAIL（Base 里仍是 2 个 `target={item.target}`，仍有 `ICONS[b.theme]`）。

- [ ] **Step 3: 建 `ThemeToggle.astro`**

Create `src/components/ThemeToggle.astro`：

```astro
---
// One button that cycles the theme light -> dark -> system (spec 2026-10-17 docs UX §3.1), in the header and in the
// drawer. The icon follows the html class (the head script sets it before first paint), so it never flashes; Base.astro's
// script handles clicks and writes the label. The icons are plain markup, not set:html (render-sinks.test.mjs).
---

<button
	type="button"
	data-theme-toggle
	data-current="system"
	aria-label="Theme"
	class="flex size-9 cursor-pointer items-center justify-center rounded text-text-secondary hover:bg-surface hover:text-text"
>
	<span class="theme-icon" data-theme-icon="light">
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="12" cy="12" r="5"></circle>
			<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
		</svg>
	</span>
	<span class="theme-icon" data-theme-icon="dark">
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
		</svg>
	</span>
	<span class="theme-icon" data-theme-icon="system">
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
			<path d="M8 21h8M12 17v4"></path>
		</svg>
	</span>
</button>

<style>
	.theme-icon {
		display: none;
	}
	:global(:root.light) .theme-icon[data-theme-icon="light"],
	:global(:root.dark) .theme-icon[data-theme-icon="dark"],
	:global(:root:not(.light):not(.dark)) .theme-icon[data-theme-icon="system"] {
		display: flex;
	}
</style>
```

- [ ] **Step 4: 建 `LanguageMenu.astro`**

Create `src/components/LanguageMenu.astro`：

```astro
---
// Language switcher (spec 2026-10-17 docs UX §3.1): a <details> dropdown in the header, a plain list in the drawer.
// Works without JS; Base.astro's script closes an open dropdown on a click outside it. The dropdown sits inside the
// sticky header's stacking context, so it needs no z-index.
interface Props {
	languages: { code: string; label: string; href: string }[];
	locale: string;
	variant?: "dropdown" | "list";
}
const { languages, locale, variant = "dropdown" } = Astro.props;
const current = languages.find((l) => l.code === locale) ?? languages[0];
---

{
	variant === "list" ? (
		<ul class="m-0 flex list-none gap-4 p-0 text-sm" aria-label="Language">
			{languages.map((l) => (
				<li>
					<a
						class="text-text-secondary hover:text-text aria-[current=true]:font-semibold aria-[current=true]:text-text"
						href={l.href}
						hreflang={l.code}
						lang={l.code}
						aria-current={l.code === locale ? "true" : undefined}
					>
						{l.label}
					</a>
				</li>
			))}
		</ul>
	) : (
		<details class="lang-menu relative text-sm" data-dropdown>
			<summary class="flex cursor-pointer list-none items-center gap-1.5 text-text hover:text-brand" aria-label={`Language: ${current?.label ?? ""}`}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="10"></circle>
					<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
				</svg>
				{current?.label}
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m6 9 6 6 6-6"></path>
				</svg>
			</summary>
			<ul class="lang-menu-list m-0 min-w-32 list-none rounded-md border border-border bg-bg p-1 shadow-lg">
				{languages.map((l) => (
					<li>
						<a
							class="block rounded px-3 py-1.5 text-text hover:bg-surface aria-[current=true]:text-brand"
							href={l.href}
							hreflang={l.code}
							lang={l.code}
							aria-current={l.code === locale ? "true" : undefined}
						>
							{l.label}
						</a>
					</li>
				))}
			</ul>
		</details>
	)
}

<style>
	.lang-menu summary::-webkit-details-marker {
		display: none;
	}
	.lang-menu-list {
		position: absolute;
		right: 0;
		top: calc(100% + 0.5rem);
	}
</style>
```

- [ ] **Step 5: 改 `Base.astro` 的 frontmatter**

1. import 区：在 `import { Font } from "astro:assets";` 后面加两行，并把 nav.mjs 那行换掉：

```astro
import LanguageMenu from "../components/LanguageMenu.astro";
import ThemeToggle from "../components/ThemeToggle.astro";
import { activeMenuHref, homeLanguages, linkRel, localizeHref, splitMenu } from "../../packages/web9-site/lib/nav.mjs";
```

2. `interface Props` 里 `content?: …;` 那行后面加：

```ts
	/** Doc pages: the doc's section and a slug -> section map of the docs the page loaded, for the active menu item */
	docNav?: { section: string; sectionOf: Record<string, string> };
	/** Language menu links (DocsPage passes the doc's translations); other pages link each locale's home page */
	languages?: { code: string; label: string; href: string }[];
```

3. props 解构改成：

```ts
const { title, pageTitle, description, image, canonical, robots, type = "website", publishedTime, modifiedTime, author, content, docNav, languages } =
	Astro.props;
```

4. `const homeHref = localizeHref("/", locale);` 后面加：

```ts
// Header (spec 2026-10-17 docs UX §3.1): site links on the left with the current section highlighted, external links on
// the right; below 1024 px they all move into the drawer (§3.3).
const activeHref = activeMenuHref(menuItems, Astro.url.pathname, docNav);
const { internal: siteLinks, external: externalLinks } = splitMenu(menuItems);
const languageLinks = languages ?? homeLanguages();
```

5. 删掉 `const THEME_BUTTONS = [ … ];` 和 `const ICONS: Record<string, string> = { … };` 两段（frontmatter 结尾的 `---` 之前）。

- [ ] **Step 6: 改 `Base.astro` 的 header，加抽屉**

把从 `<header class="site-header border-b border-border-subtle">` 到对应的 `</header>`（含）整段换成下面的内容。`<WebMcpSearch … />` 那行保留在它后面不动。

```astro
		<header class="site-header border-b border-border-subtle">
			<nav class="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4 sm:px-6" aria-label="Main">
				<button
					type="button"
					class="-ms-2 flex size-10 cursor-pointer items-center justify-center rounded text-text hover:bg-surface lg:hidden"
					aria-label="Menu"
					aria-haspopup="dialog"
					aria-expanded="false"
					aria-controls="site-drawer"
					data-drawer-open
				>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
						<path d="M3 6h18M3 12h18M3 18h18"></path>
					</svg>
				</button>
				<a href={homeHref} class="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight text-text hover:text-brand">
					{
						siteLogo ? (
							<img src={siteLogo.url} alt={siteLogo.alt || siteTitle} class="block h-8 w-auto" />
						) : (
							<Fragment>
								<img src="/img/logo-64.png" alt="" width="32" height="32" class="block size-8" />
								{siteTitle}
							</Fragment>
						)
					}
				</a>
				<div class="hidden items-center gap-5 lg:flex">
					{
						siteLinks.map((item) => (
							<a
								class="font-medium text-text hover:text-brand aria-[current=page]:text-brand"
								href={item.href} target={item.target} rel={linkRel(item.target)}
								aria-current={activeHref && item.href === activeHref ? "page" : undefined}
							>
								{item.label}
							</a>
						))
					}
				</div>
				<div class="ms-auto hidden items-center gap-4 lg:flex">
					<LiveSearch
						placeholder="Search..."
						class="site-search"
						inputClass="site-search-input"
						resultsClass="site-search-results"
						resultClass="site-search-result"
						collections={["docs", "posts", "pages"]}
						routeMap={{ docs: `${localePrefix}/docs/:slug` }}
					/>
					<LanguageMenu languages={languageLinks} locale={locale} />
					{
						externalLinks.map((item) => (
							<a class="flex items-center gap-1 text-sm text-text hover:text-brand" href={item.href} target={item.target} rel={linkRel(item.target)}>
								{item.label}
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"></path>
								</svg>
							</a>
						))
					}
					<ThemeToggle />
					{isLoggedIn && <a href="/_emdash/admin" class="text-sm text-text-secondary hover:text-text">Admin</a>}
				</div>
			</nav>
		</header>
		<dialog id="site-drawer" class="site-drawer" aria-label="Menu">
			<div class="flex h-16 items-center justify-between border-b border-border-subtle px-4">
				<a href={homeHref} class="flex items-center gap-2 font-semibold tracking-tight text-text">
					{
						siteLogo ? (
							<img src={siteLogo.url} alt={siteLogo.alt || siteTitle} class="block h-7 w-auto" />
						) : (
							<Fragment>
								<img src="/img/logo-64.png" alt="" width="28" height="28" class="block size-7" />
								{siteTitle}
							</Fragment>
						)
					}
				</a>
				<button
					type="button"
					class="flex size-9 cursor-pointer items-center justify-center rounded text-text-secondary hover:bg-surface hover:text-text"
					aria-label="Close menu"
					data-drawer-close
					autofocus
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
						<path d="M18 6 6 18M6 6l12 12"></path>
					</svg>
				</button>
			</div>
			<div class="space-y-5 px-4 py-4">
				<LiveSearch
					placeholder="Search..."
					class="site-search drawer-search"
					inputClass="site-search-input"
					resultsClass="site-search-results"
					resultClass="site-search-result"
					collections={["docs", "posts", "pages"]}
					routeMap={{ docs: `${localePrefix}/docs/:slug` }}
				/>
				<ul class="m-0 list-none space-y-0.5 p-0">
					{
						menuItems.map((item) => (
							<li>
								<a
									class="block rounded px-2 py-1.5 font-medium text-text hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:text-brand"
									href={item.href} target={item.target} rel={linkRel(item.target)}
									aria-current={activeHref && item.href === activeHref ? "page" : undefined}
								>
									{item.label}
								</a>
							</li>
						))
					}
				</ul>
				<div class="flex items-center justify-between gap-4 border-y border-border-subtle py-2">
					<LanguageMenu languages={languageLinks} locale={locale} variant="list" />
					<ThemeToggle />
				</div>
				<slot name="drawer" />
				{isLoggedIn && <a href="/_emdash/admin" class="block text-sm text-text-secondary hover:text-text">Admin</a>}
			</div>
		</dialog>
```

注意：`href={item.href} target={item.target} rel={linkRel(item.target)}` 必须在同一行、这个顺序（render-sinks 测试按这段原文数）。

- [ ] **Step 7: 改页脚**

1. `<footer …>` 里的 `<div class="mx-auto max-w-[1200px] px-6 pt-16 pb-8">` 改成 `max-w-[1400px]`。
2. 把页脚最底下那一行（`<div class="flex flex-col items-center gap-4 border-t border-border pt-6 …">`，里面是 "Powered by" 和主题按钮组）整段换成：

```astro
				<div class="border-t border-border pt-6 text-center sm:text-left">
					<p class="text-sm text-muted">Powered by <a class="text-text-secondary" href="https://emdashcms.com">EmDash</a></p>
				</div>
```

- [ ] **Step 8: 换 `<script>`**

把 `<script>` 到 `</script>`（主题切换和 ⌘K 那段）整段换成：

```astro
		<script>
			// Theme: html.light / html.dark plus a `theme` cookie; "system" removes both. Every [data-theme-toggle]
			// (header and drawer) cycles light -> dark -> system; ThemeToggle.astro shows the icon from the html class.
			const THEMES = ["light", "dark", "system"] as const;
			type Theme = (typeof THEMES)[number];
			const root = document.documentElement;
			const toggles = document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]");
			const nextTheme = (theme: Theme) => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

			function setCookie(name: string, value: string, maxAge: number = 31536000) {
				const secure = location.protocol === "https:" ? "; Secure" : "";
				document.cookie =
					value === ""
						? `${name}=; path=/; max-age=0; SameSite=Lax${secure}`
						: `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
			}

			function setTheme(theme: Theme) {
				root.classList.remove("light", "dark");
				if (theme === "system") setCookie("theme", "");
				else {
					setCookie("theme", theme);
					root.classList.add(theme);
				}
				toggles.forEach((btn) => {
					btn.dataset.current = theme;
					btn.setAttribute("aria-label", `Theme: ${theme}. Switch to ${nextTheme(theme)}`);
				});
			}

			// Same whitelist as the head script: any other cookie value counts as "system" (and is cleared).
			const stored = document.cookie.split("; ").find((item) => item.startsWith("theme="))?.slice(6);
			setTheme(stored === "light" || stored === "dark" ? stored : "system");
			toggles.forEach((btn) =>
				btn.addEventListener("click", () => setTheme(nextTheme(THEMES.find((t) => t === btn.dataset.current) ?? "system"))),
			);

			// Drawer below 1024 px (spec 2026-10-17 docs UX §3.3): a modal <dialog>, so the browser traps focus, makes the
			// page inert and closes it on Esc.
			const drawer = document.getElementById("site-drawer") as HTMLDialogElement | null;
			const drawerOpen = document.querySelector<HTMLButtonElement>("[data-drawer-open]");
			function openDrawer() {
				if (!drawer || drawer.open) return;
				drawer.showModal();
				drawerOpen?.setAttribute("aria-expanded", "true");
			}
			drawerOpen?.addEventListener("click", openDrawer);
			drawer?.addEventListener("close", () => {
				drawerOpen?.setAttribute("aria-expanded", "false");
				drawerOpen?.focus();
			});
			drawer?.querySelector("[data-drawer-close]")?.addEventListener("click", () => drawer?.close());
			// A click on the backdrop reaches the dialog element itself, outside its box
			drawer?.addEventListener("click", (e) => {
				const box = drawer.getBoundingClientRect();
				const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
				if (e.target === drawer && outside) drawer.close();
			});
			// Widening the window past the breakpoint hides the menu button; the drawer closes with it
			matchMedia("(min-width: 1024px)").addEventListener("change", (e) => {
				if (e.matches && drawer?.open) drawer.close();
			});

			// An open dropdown (LanguageMenu's <details data-dropdown>) closes on a click outside it
			document.addEventListener("click", (e) => {
				document.querySelectorAll<HTMLDetailsElement>("details[data-dropdown][open]").forEach((d) => {
					if (!d.contains(e.target as Node)) d.open = false;
				});
			});

			// ⌘K / Ctrl+K focuses the visible search box; below 1024 px it opens the drawer first
			document.addEventListener("keydown", (e) => {
				if ((e.metaKey || e.ctrlKey) && e.key === "k") {
					e.preventDefault();
					const visible = [...document.querySelectorAll<HTMLInputElement>(".site-search-input")].find((el) => el.offsetParent !== null);
					if (visible) return visible.focus();
					openDrawer();
					drawer?.querySelector<HTMLInputElement>(".site-search-input")?.focus();
				}
			});
		</script>
```

- [ ] **Step 9: 改 scoped `<style>`**

1. 把搜索框在窄屏下的这段：

```css
			@media (max-width: 640px) {
				.site-search,
				:global(.site-search-input) {
					width: 100%;
				}
			}
```

换成：

```css
			/* The drawer's search box spans the drawer. LiveSearch's root carries LiveSearch's scope attribute, not this
			   file's, so a scoped selector would not reach it: :global. */
			:global(.drawer-search),
			:global(.drawer-search .site-search-input) {
				width: 100%;
			}

			/*
			 * The drawer is a modal <dialog>: the browser puts it in the top layer, so it needs no position or z-index
			 * of its own (check-public-css rejects position:fixed), and its viewport sizes stay here, out of utility classes.
			 */
			.site-drawer {
				width: min(20rem, 85vw);
				max-width: none;
				height: 100dvh;
				max-height: none;
				margin: 0;
				padding: 0;
				border: 0;
				border-inline-end: 1px solid var(--color-border);
				background: var(--color-bg);
				color: var(--color-text);
				overflow-y: auto;
			}
			.site-drawer::backdrop {
				background: rgb(0 0 0 / 0.45);
			}
			.site-drawer[open] {
				animation: drawer-in 180ms ease-out;
			}
			@keyframes drawer-in {
				from {
					transform: translateX(-100%);
				}
			}
			@media (prefers-reduced-motion: reduce) {
				.site-drawer[open] {
					animation: none;
				}
			}
			/* The page behind an open drawer does not scroll */
			:global(html:has(.site-drawer[open])) {
				overflow: hidden;
			}
```

2. 其余 scoped 样式（`.site-header`、`.site-main`、`@media (max-width: 640px) { .site-header { position: relative; } }`、搜索框和结果的样式）不动。

- [ ] **Step 10: 跑测试**

Run: `npx vitest run packages/web9-site/render-sinks.test.mjs && npm test`
Expected: PASS。

- [ ] **Step 11: 构建和类型检查**

```bash
npx astro dev stop
npm run build
npm run typecheck
npm run dev -- --port 4321
```

Expected:
- build 成功，结尾有 `check-public-css: ok`；
- typecheck `0 errors`；
- dev server 重新起来。

- [ ] **Step 12: 冒烟检查（不开浏览器）**

```bash
curl -s http://localhost:4321/ | command grep -o 'data-drawer-open\|id="site-drawer"\|data-theme-toggle\|/img/logo-64.png\|data-dropdown' | sort | uniq -c
curl -s http://localhost:4321/posts | command grep -o 'aria-current="page"[^>]*>[^<]*' | head -3
```

Expected:
- 首页里 `data-drawer-open` 1 次、`id="site-drawer"` 1 次、`data-theme-toggle` 2 次、`/img/logo-64.png` 2 次（站点设置里没有 siteLogo 时）、`data-dropdown` 1 次；
- `/posts` 页里 Blog 菜单项带 `aria-current="page"`（header 和抽屉各一次）。

- [ ] **Step 13: Commit**

```bash
git add public/img/logo-64.png src/components/ThemeToggle.astro src/components/LanguageMenu.astro src/layouts/Base.astro packages/web9-site/render-sinks.test.mjs
git commit -m "feat(header): old-site navbar behaviour, mobile drawer, one theme button

Logo icon and site links on the left with the current section highlighted;
search, language menu, external links and a light/dark/system button on the right.
Below 1024 px a modal <dialog> drawer holds them all (spec 2026-10-17 §3.1, §3.3).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Jp8xna9DgFiYY23QsXGEnB"
```

---

### Task 4: Docs 页

**Files:**
- Create: `src/env.d.ts`
- Create: `src/components/DocsSidebar.astro`
- Create: `src/components/Heading.astro`
- Create: `src/components/Toc.astro`
- Modify: `src/components/DocsPage.astro`（整个文件替换）

**Interfaces:**
- Consumes：
  - Task 1：`docsSidebar`、`breadcrumbs`（`docs-nav.mjs`）；`LANGUAGES`、`localizeHref`（`nav.mjs`）；
  - Task 2：`headingAnchors`、`idsByKey`、`legacyIdsFor`、`tocEntries`、`blockText`、`isHeading`（`anchors.mjs`）；
  - Task 3：`Base` 的 `docNav`、`languages` prop 和 `drawer` slot。
- Produces：
  - `Astro.locals.headingIds?: Record<string, string>`；
  - `DocsPage` 的正文容器 `<article class="docs-article …">`（Task 5 的高亮脚本找它）；
  - DocsPage 末尾的 `<script>`（Task 5 往里加一段）。

- [ ] **Step 1: 类型**

Create `src/env.d.ts`：

```ts
// Request-scoped values shared by the components of one render; merges with emdash's App.Locals.
declare namespace App {
	interface Locals {
		/** Doc heading ids by block _key: DocsPage sets them, Heading.astro reads them (spec 2026-10-17 docs UX §3.2). */
		headingIds?: Record<string, string>;
	}
}
```

- [ ] **Step 2: `Heading.astro`**

Create `src/components/Heading.astro`：

```astro
---
// The `block` renderer for doc bodies (spec 2026-10-17 docs UX §3.2). Every block, heading or not, is rendered by
// core's Block, which spreads extra props onto the element: that is how h2-h6 get their id, next to core's text-align
// class. A heading also gets a "#" link after its text. The ids come from DocsPage through Astro.locals.headingIds,
// by block _key (anchors.mjs); a block without _key gets the plain slug of its text, as headingAnchors gives it.
// In edit mode PortableText renders the inline editor instead, so headings there have no ids.
// `{...{ ...props, id }}`: a spread is not checked for excess props, and Block's Props type has no `id`.
import { Block } from "emdash/ui";
import { slug } from "github-slugger";
import { blockText, isHeading } from "../../packages/web9-site/lib/anchors.mjs";

const props = Astro.props;
const { node } = props;
const text = isHeading(node) ? blockText(node) : "";
// _key is content: look it up as an own property only (a key such as "constructor" must not reach Object.prototype)
const key = typeof node?._key === "string" && node._key ? node._key : null;
const ids = Astro.locals.headingIds ?? {};
const id = !text.trim() ? undefined : key ? (Object.hasOwn(ids, key) ? ids[key] : undefined) : slug(text);
---

{
	id ? (
		<Block {...{ ...props, id }}>
			<slot />
			<a class="hash-link" href={`#${id}`} aria-label={`Direct link to ${text}`}>
				#
			</a>
		</Block>
	) : (
		<Block {...props}>
			<slot />
		</Block>
	)
}

<style>
	.hash-link {
		margin-inline-start: 0.35em;
		color: var(--color-brand);
		font-weight: 400;
		text-decoration: none;
		opacity: 0;
		transition: opacity 120ms ease;
	}
	:global(:is(h2, h3, h4, h5, h6):hover) > .hash-link,
	.hash-link:focus-visible {
		opacity: 1;
	}
</style>
```

- [ ] **Step 3: `Toc.astro`**

Create `src/components/Toc.astro`：

```astro
---
// One "On this page" list (spec 2026-10-17 docs UX §3.2): DocsPage renders it in the right column and in the inline
// <details>; its script marks the link of the current section with aria-current="true".
interface Props {
	entries: { level: number; text: string; id: string }[];
	class?: string;
}
const { entries, class: className } = Astro.props;
---

<ul class:list={["m-0 list-none space-y-1 p-0 text-[0.85rem] leading-snug", className]} data-toc>
	{
		entries.map((e) => (
			<li class:list={[e.level === 3 && "ps-3"]}>
				<a
					class="block py-0.5 text-text-secondary hover:text-brand aria-[current=true]:font-medium aria-[current=true]:text-brand"
					href={`#${e.id}`}
				>
					{e.text}
				</a>
			</li>
		))
	}
</ul>
```

- [ ] **Step 4: `DocsSidebar.astro`**

Create `src/components/DocsSidebar.astro`：

```astro
---
// The docs sidebar (spec 2026-10-17 docs UX §3.2): the current section only; each category is a <details>, open only
// around the current doc. No JS. DocsPage renders it twice: the desktop column and the drawer.
interface Props {
	sidebar: { rootItems: any[]; categories: { key: string; label: string; open: boolean; items: any[] }[] };
	prefix: string;
	currentSlug: string;
}
const { sidebar, prefix, currentSlug } = Astro.props;
const linkClass =
	"block rounded px-2 py-1.5 text-text-secondary hover:bg-surface hover:text-text aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-brand";
---

<nav aria-label="Docs" class="text-[0.92rem]">
	<ul class="m-0 list-none space-y-0.5 p-0">
		{
			sidebar.rootItems.map((e) => (
				<li>
					<a class={linkClass} href={`${prefix}/docs/${e.data.slug}`} aria-current={e.data.slug === currentSlug ? "page" : undefined}>
						{e.data.title}
					</a>
				</li>
			))
		}
		{
			sidebar.categories.map((c) => (
				<li>
					<details class="docs-category" open={c.open}>
						<summary class="flex cursor-pointer list-none items-center justify-between rounded px-2 py-1.5 font-medium text-text hover:bg-surface">
							{c.label}
							<svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="m9 18 6-6-6-6"></path>
							</svg>
						</summary>
						<ul class="m-0 ms-2 mt-0.5 list-none space-y-0.5 border-s border-border-subtle p-0 ps-2">
							{c.items.map((e) => (
								<li>
									<a class={linkClass} href={`${prefix}/docs/${e.data.slug}`} aria-current={e.data.slug === currentSlug ? "page" : undefined}>
										{e.data.title}
									</a>
								</li>
							))}
						</ul>
					</details>
				</li>
			))
		}
	</ul>
</nav>

<style>
	.docs-category summary::-webkit-details-marker {
		display: none;
	}
	.chevron {
		transition: transform 150ms ease;
	}
	.docs-category[open] > summary .chevron {
		transform: rotate(90deg);
	}
</style>
```

- [ ] **Step 5: 重写 `DocsPage.astro`**

整个文件替换成：

```astro
---
import { getEmDashCollection, getTranslations } from "emdash";
import { PortableText } from "emdash/ui";
import { headingAnchors, idsByKey, legacyIdsFor, tocEntries } from "../../packages/web9-site/lib/anchors.mjs";
import { breadcrumbs, docsSidebar, groupDocs } from "../../packages/web9-site/lib/docs-nav.mjs";
import { LANGUAGES, localizeHref } from "../../packages/web9-site/lib/nav.mjs";
import Base from "../layouts/Base.astro";
import DocsSidebar from "./DocsSidebar.astro";
import Heading from "./Heading.astro";
import Toc from "./Toc.astro";

interface Props {
	doc: any;
	locale: string;
	fallbackLocale?: string;
}
const { doc, locale, fallbackLocale } = Astro.props;
const prefix = locale === "en" ? "" : `/${locale}`;

// Sidebar: every en doc, with this locale's translation swapped in where one exists (an untranslated
// doc is still reachable under this locale's prefix through the fallback route), plus docs that exist
// only in this locale; grouped section -> category, ordered by sort_order, with the old sidebar's labels.
const byGroup = new Map();
// slug -> section of every doc loaded here (en and this locale), for the header's active menu item (nav.mjs)
const sectionOf: Record<string, string> = {};
for (const l of new Set(["en", locale])) {
	const { entries: list } = await getEmDashCollection("docs", { locale: l, limit: 500 });
	for (const e of list) {
		// translationGroup is on every entry at runtime but not in the generated Doc type
		byGroup.set((e.data as { translationGroup?: string | null }).translationGroup ?? e.data.id, e);
		sectionOf[e.data.slug] = e.data.section ?? "ai";
	}
}
const section: string = doc.data.section ?? "ai";
// Only the current section, as on the old site (spec 2026-10-17 docs UX §3.2)
const sidebar = docsSidebar(groupDocs([...byGroup.values()], locale), section, doc.data.slug);
const crumbs: string[] = breadcrumbs(doc.data, locale);

// Heading ids: the old site's custom ids, else Docusaurus's slugs (anchors.mjs). Heading.astro reads them by block
// _key from Astro.locals, because PortableText gives block renderers nothing but the node. A fallback page shows
// the en body, so it takes the en table.
const anchors = headingAnchors(doc.data.body, legacyIdsFor(fallbackLocale ?? locale, doc.data.slug));
Astro.locals.headingIds = idsByKey(anchors);
const toc = tocEntries(anchors);
const tocLabel = locale === "zh-CN" ? "本页目录" : "On this page";

// A fallback page shows the en text, so search engines are pointed at the en URL.
const canonicalLocale = fallbackLocale ?? locale;
const canonical = new URL(`${canonicalLocale === "en" ? "" : `/${canonicalLocale}`}/docs/${doc.data.slug}`, Astro.site).href;

const translations = (await getTranslations("docs", doc.data.id)).translations?.filter(
	(t) => t.status === "published",
) ?? [];
// The header's language menu offers every locale; one without a translation opens the fallback page for this doc.
const languages = LANGUAGES.map(({ code, label }) => ({
	code,
	label,
	href: `${code === "en" ? "" : `/${code}`}/docs/${translations.find((t) => t.locale === code)?.slug ?? doc.data.slug}`,
}));
const notTranslated: Record<string, string> = {
	en: "This page is not translated yet; showing the original.",
	"zh-CN": "本页还没有中文翻译，以下显示原文。",
};
---

<Base
	title={doc.data.title}
	description={doc.data.description}
	canonical={canonical}
	content={{ collection: "docs", id: doc.data.id, slug: doc.data.slug }}
	docNav={{ section, sectionOf }}
	languages={languages}
>
	<DocsSidebar slot="drawer" sidebar={sidebar} prefix={prefix} currentSlug={doc.data.slug} />
	<div
		class:list={[
			"mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]",
			toc.length >= 2 && "xl:grid-cols-[240px_minmax(0,1fr)_220px]",
		]}
	>
		<aside class="docs-sidebar hidden lg:block">
			<DocsSidebar sidebar={sidebar} prefix={prefix} currentSlug={doc.data.slug} />
		</aside>
		<div class="min-w-0 py-6">
			<nav aria-label="Breadcrumbs" class="mb-5 text-sm">
				<ol class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-text-secondary">
					<li class="flex">
						<a href={localizeHref("/", locale)} aria-label="Home" class="flex text-text-secondary hover:text-brand">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
								<path d="M9 22V12h6v10"></path>
							</svg>
						</a>
					</li>
					{
						crumbs.map((label, i) => (
							<li class="flex items-center gap-1.5">
								<span aria-hidden="true" class="text-muted">
									›
								</span>
								{i === crumbs.length - 1 ? (
									<span aria-current="page" class="rounded-full bg-surface px-2.5 py-0.5 text-text">
										{label}
									</span>
								) : (
									<span>{label}</span>
								)}
							</li>
						))
					}
				</ol>
			</nav>
			{
				toc.length >= 2 && (
					<details class="mb-6 rounded-md border border-border xl:hidden">
						<summary class="cursor-pointer px-3 py-2 text-sm font-medium text-text">{tocLabel}</summary>
						<Toc entries={toc} class="px-3 pb-3" />
					</details>
				)
			}
			<article class="docs-article prose max-w-none">
				{
					fallbackLocale && (
						<p class="rounded-md bg-[color-mix(in_srgb,#d9a400_15%,transparent)] px-3 py-2">
							{notTranslated[locale] ?? notTranslated.en}
						</p>
					)
				}
				<h1 {...doc.edit.title}>{doc.data.title}</h1>
				<div {...doc.edit.body}>
					<PortableText value={doc.data.body} components={{ block: Heading }} />
				</div>
			</article>
		</div>
		{
			toc.length >= 2 && (
				<aside class="docs-toc hidden xl:block" aria-label={tocLabel}>
					<p class="mt-0 mb-2 text-xs font-semibold tracking-wider text-text-secondary uppercase">{tocLabel}</p>
					<Toc entries={toc} />
				</aside>
			)
		}
	</div>
</Base>

<script>
	// "On this page" (spec 2026-10-17 docs UX §3.2): the current section is the last heading above a line 6rem below the
	// top of the window; every TOC (right column and inline) marks its link with aria-current. The observer only says
	// when to look again.
	const tocLinks = [...document.querySelectorAll<HTMLAnchorElement>("[data-toc] a[href^='#']")];
	const idOf = (a: HTMLAnchorElement) => decodeURIComponent(a.hash.slice(1));
	const tocHeadings = [...new Set(tocLinks.map(idOf))]
		.map((id) => document.getElementById(id))
		.filter((h): h is HTMLElement => h !== null);
	if (tocHeadings.length) {
		const update = () => {
			let current = tocHeadings[0];
			for (const h of tocHeadings) if (h.getBoundingClientRect().top < 96) current = h;
			for (const a of tocLinks) {
				if (idOf(a) === current.id) a.setAttribute("aria-current", "true");
				else a.removeAttribute("aria-current");
			}
		};
		const observer = new IntersectionObserver(update, { rootMargin: "0px 0px -60% 0px" });
		for (const h of tocHeadings) observer.observe(h);
		update();
	}
</script>

<style>
	/* The sticky columns sit below the 4rem sticky header (Base.astro .site-header). Their viewport heights stay here,
	   out of utility classes (check-public-css). This also stops the sidebar showing through the translucent header. */
	.docs-sidebar,
	.docs-toc {
		position: sticky;
		top: 4rem;
		align-self: start;
		overflow-y: auto;
		padding-block: 1.5rem;
	}
	.docs-sidebar {
		max-height: calc(100dvh - 4rem);
	}
	.docs-toc {
		max-height: calc(100dvh - 5rem);
	}
	/* A heading reached through its #anchor clears the sticky header */
	.docs-article :global(:is(h2, h3, h4, h5, h6)[id]) {
		scroll-margin-top: 5rem;
	}
</style>
```

- [ ] **Step 6: 跑测试**

Run: `npm test`
Expected: PASS。

- [ ] **Step 7: 构建和类型检查**

```bash
npx astro dev stop
npm run build
npm run typecheck
npm run dev -- --port 4321
```

Expected: build 成功，有 `check-public-css: ok`；typecheck `0 errors`；dev server 重新起来。

- [ ] **Step 8: 冒烟检查（不开浏览器）**

```bash
node scripts/check-page.mjs http://localhost:4321/docs/learn_ai_coding 'id="what-is-not"' 'aria-label="Breadcrumbs"' 'On this page' 'href="#what-is-not"' 'aria-label="Direct link to What NOT ?"' --absent 'data-portabletext-unknown'
node scripts/check-page.mjs http://localhost:4321/zh-CN/docs/learn_ai_coding 'id="function"' '本页目录' 'id="大纲---3大模块"'
node scripts/check-page.mjs http://localhost:4321/docs/guide 'id="programming-code"'
curl -s http://localhost:4321/docs/learn_ai_coding | command grep -c 'aria-label="Docs"'
```

Expected:
- 三条 `check-page` 都 exit 0（`missing` 和 `unexpected` 都是空的）。第一条的 `--absent 'data-portabletext-unknown'` 确认段落仍由 core `Block` 渲染，没有落到 astro-portabletext 的 `UnknownBlock`；
- `aria-label="Docs"` 出现 2 次（桌面 sidebar 和抽屉）。

- [ ] **Step 9: Commit**

```bash
git add src/env.d.ts src/components/DocsSidebar.astro src/components/Heading.astro src/components/Toc.astro src/components/DocsPage.astro
git commit -m "feat(docs): section sidebar, breadcrumbs, On this page and heading anchors

The sidebar shows the current section with collapsible categories and sticks below
the header; headings get the old site's ids and a # link; the TOC highlights the
section in view (spec 2026-10-17 §3.2).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Jp8xna9DgFiYY23QsXGEnB"
```

---

### Task 5: 代码高亮（客户端 Prism）

**Files:**
- Modify: `package.json`、`package-lock.json`（`prismjs` 1.30.0）
- Create: `packages/web9-blocks/astro/prism-client.mjs`
- Create: `packages/web9-blocks/astro/prism-client.d.mts`
- Create: `packages/web9-blocks/prism-client.test.mjs`
- Modify: `packages/web9-blocks/package.json`（`exports`）
- Modify: `packages/web9-blocks/astro/blocks.css`（`@layer utilities` 末尾）
- Modify: `src/components/DocsPage.astro`（`<script>` 末尾）
- Modify: `src/pages/posts/[slug].astro`（加一个 `<script>`）

**Interfaces:**
- Consumes（Task 4）：DocsPage 的 `<article class="docs-article …">` 和它的 `<script>`。
- Produces：`@web9/blocks/prism-client` 导出 `highlightUnder(root: Element): Promise<void>`。

配色的决定见 spec §3.4（修订版）：core code 块总是深色底，所以 Markdown 代码块也改成深色底，整站一套深色 Prism 配色，不新增 `--color-*` token。

- [ ] **Step 1: 加依赖**

Run: `npm install --save-exact prismjs@1.30.0`
Expected: `package.json` 的 `dependencies` 多一行 `"prismjs": "1.30.0"`；lock 里 `node_modules/prismjs` 仍是 1.30.0。

- [ ] **Step 2: 写失败的测试**

Create `packages/web9-blocks/prism-client.test.mjs`：

```js
// prism-client.mjs runs in the browser; here, Prism core runs in Node (it sets global.Prism there too), which checks
// that every bundled language loads on core alone, in any order, as the client loads them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./astro/prism-client.mjs", import.meta.url), "utf8");
const languages = [...source.matchAll(/import\("prismjs\/components\/prism-([a-z]+)\.js"\)/g)].map((m) => m[1]);
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

describe("prism-client", () => {
	it("bundles exactly the languages of the old site's code blocks, plus javascript (in core) and json", () => {
		expect([...languages].sort()).toEqual(["bash", "csharp", "java", "json", "kotlin", "markdown", "python", "swift", "typescript", "yaml"]);
	});
	it("sets the manual flag before Prism core loads", () => {
		expect(source.indexOf("manual: true")).toBeGreaterThan(-1);
		expect(source.indexOf("manual: true")).toBeLessThan(source.indexOf('import("prismjs")'));
	});
	it("is exported as @web9/blocks/prism-client", () => {
		expect(pkg.exports["./prism-client"]).toBe("./astro/prism-client.mjs");
	});
	it("highlights every bundled language and alias with Prism core alone", async () => {
		const { default: Prism } = await import("prismjs");
		await Promise.all(languages.map((l) => import(`prismjs/components/prism-${l}.js`)));
		const samples = {
			python: "def f():\n    return 1",
			bash: "echo $HOME",
			yaml: "key: value",
			typescript: "const x: number = 1;",
			javascript: "const x = 1;",
			json: '{"a": 1}',
			kotlin: "fun main() {}",
			java: "class A {}",
			csharp: "class A {}",
			swift: "let x = 1",
			markdown: "# Title",
		};
		for (const [lang, code] of Object.entries(samples)) expect(Prism.highlight(code, Prism.languages[lang], lang), lang).toContain('class="token');
		for (const alias of ["py", "sh", "shell", "yml", "ts", "cs", "kt", "md"]) expect(Prism.languages[alias], alias).toBeDefined();
	});
});
```

Run: `npx vitest run packages/web9-blocks/prism-client.test.mjs`
Expected: FAIL（`prism-client.mjs` 不存在）。

- [ ] **Step 3: 实现 `prism-client.mjs` 和类型**

Create `packages/web9-blocks/astro/prism-client.mjs`：

```js
// Client-side syntax highlighting (spec 2026-10-17 docs UX §3.4). Pages import this module only when they hold a
// `pre code[class*="language-"]`, so pages without code download nothing. Prism is bundled from npm into lazy chunks
// served from this site. Only these languages are bundled: the old site's code blocks, plus javascript (in core) and
// json; any other language stays plain text. Prism reads textContent and writes escaped token spans; the classes it
// adds exist only in the live DOM, never in stored content.
let prismPromise;

function loadPrism() {
	prismPromise ??= (async () => {
		// Core reads this flag as it loads: no automatic highlighting of the whole document. Core then replaces window.Prism.
		window.Prism = { ...window.Prism, manual: true };
		const { default: Prism } = await import("prismjs");
		// Core includes markup, css, clike and javascript; each language below extends only those, so any order works
		await Promise.all([
			import("prismjs/components/prism-python.js"),
			import("prismjs/components/prism-bash.js"),
			import("prismjs/components/prism-yaml.js"),
			import("prismjs/components/prism-typescript.js"),
			import("prismjs/components/prism-json.js"),
			import("prismjs/components/prism-kotlin.js"),
			import("prismjs/components/prism-java.js"),
			import("prismjs/components/prism-csharp.js"),
			import("prismjs/components/prism-swift.js"),
			import("prismjs/components/prism-markdown.js"),
		]);
		return Prism;
	})();
	return prismPromise;
}

/** Highlights every language-tagged code block under `root`. */
export async function highlightUnder(root) {
	const Prism = await loadPrism();
	Prism.highlightAllUnder(root);
}
```

Create `packages/web9-blocks/astro/prism-client.d.mts`：

```ts
// Types for prism-client.mjs, so `import("@web9/blocks/prism-client")` type-checks in .astro scripts.
/** Highlights every language-tagged code block under `root` with Prism (loaded on the first call). */
export declare function highlightUnder(root: Element): Promise<void>;
```

`packages/web9-blocks/package.json` 的 `exports` 里，`"./to-markdown": "./lib/to-markdown.mjs",` 后面加一行：

```json
    "./prism-client": "./astro/prism-client.mjs",
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx vitest run packages/web9-blocks/prism-client.test.mjs`
Expected: PASS。

- [ ] **Step 5: 配色**

`packages/web9-blocks/astro/blocks.css`：在 `@layer utilities {` 块里、`pre.mermaid { @apply bg-transparent text-center; }` 这一行后面（`}` 之前）加：

```css

	/*
	 * Code (spec 2026-10-17 docs UX §3.4). emdash's core code block is always dark (#1e1e1e in its Code.astro), so
	 * Markdown code in callout, tabs and details is dark too, and one Prism palette (VS Code Dark+) serves both.
	 * Prism adds the .token spans in the browser (prism-client.mjs); stored content never carries them.
	 */
	.prose pre:not(.mermaid) { background: #1e1e1e; color: #e0e0e0; }
	pre .token:is(.comment, .prolog, .doctype, .cdata) { color: #6a9955; }
	pre .token:is(.punctuation, .operator, .entity) { color: #d4d4d4; }
	pre .token:is(.keyword, .boolean, .important, .atrule, .tag, .selector) { color: #569cd6; }
	pre .token:is(.string, .char, .attr-value, .regex, .url) { color: #ce9178; }
	pre .token:is(.number, .inserted) { color: #b5cea8; }
	pre .token.function { color: #dcdcaa; }
	pre .token:is(.class-name, .builtin) { color: #4ec9b0; }
	pre .token:is(.property, .attr-name, .variable, .constant, .symbol, .parameter) { color: #9cdcfe; }
	pre .token.deleted { color: #f48771; }
	pre .token:is(.bold, .title) { font-weight: 600; }
	pre .token.italic { font-style: italic; }
```

- [ ] **Step 6: 页面加载脚本**

1. `src/components/DocsPage.astro` 的 `<script>` 里，在最后一个 `}`（`if (tocHeadings.length) { … }` 结束）后面加：

```ts

	// Syntax highlighting, only when the body has a language-tagged code block (spec 2026-10-17 docs UX §3.4)
	const docsArticle = document.querySelector<HTMLElement>(".docs-article");
	if (docsArticle?.querySelector('pre code[class*="language-"]')) {
		import("@web9/blocks/prism-client").then(({ highlightUnder }) => highlightUnder(docsArticle));
	}
```

2. `src/pages/posts/[slug].astro`：在 `</Base>` 前面（现有的 `<script>…</script>` 之后）加一个新的 `<script>`：

```astro
	<script>
		// Syntax highlighting, only when the post has a language-tagged code block (spec 2026-10-17 docs UX §3.4)
		const postContent = document.querySelector<HTMLElement>(".article-content");
		if (postContent?.querySelector('pre code[class*="language-"]')) {
			import("@web9/blocks/prism-client").then(({ highlightUnder }) => highlightUnder(postContent));
		}
	</script>
```

- [ ] **Step 7: 跑全部测试**

Run: `npm test`
Expected: PASS。

- [ ] **Step 8: 构建和类型检查**

```bash
npx astro dev stop
npm run build
npm run typecheck
npm run dev -- --port 4321
```

Expected:
- build 成功，有 `check-public-css: ok`；
- `ls dist/client/_astro | command grep -ci prism` 至少 1（Prism 在单独的懒加载 chunk 里）；
- typecheck `0 errors`；dev server 重新起来。

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json packages/web9-blocks/astro/prism-client.mjs packages/web9-blocks/astro/prism-client.d.mts packages/web9-blocks/prism-client.test.mjs packages/web9-blocks/package.json packages/web9-blocks/astro/blocks.css src/components/DocsPage.astro "src/pages/posts/[slug].astro"
git commit -m "feat(code): Prism syntax highlighting, loaded only on pages with code

Ten languages on Prism core, one dark palette for core and Markdown code blocks
(spec 2026-10-17 §3.4, as amended: core code blocks are always dark).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Jp8xna9DgFiYY23QsXGEnB"
```

---

### Task 6: 浏览器验收和文档（controller 做）

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-docs-ux-parity-design.md`（状态行）

这一步用已在运行的 Chrome（CDP，localhost:9222），只用 `list_pages` → `select_page` → `navigate_page` 操作已有标签页，不开新标签页、不开新 Chrome；用完把标签页导航回原来的地址。窗口尺寸用 `emulate`（`resize_page` 改不了 viewport），结束时清掉 emulation。

- [ ] **Step 1: 1440 px**

逐页打开 `http://localhost:4321/docs/learn_ai_coding`、`/docs/ai-tools-adhoc`、`/zh-CN/docs/learn_ai_coding`、`/posts` 下的一篇、`/`，检查：
- sidebar 只有当前 section；当前分类展开、其余收起；当前页有底色和主色；
- header 高亮：`learn_ai_coding` 高亮 Dev，`ai-tools-adhoc` 高亮 AI，文章页高亮 Blog，首页不高亮；
- 面包屑：首页图标 › section › 分类 › 标题；
- 右侧目录存在，滚动时 `aria-current` 跟着变；
- 滚到底部再滚回来，sidebar 顶部始终在 header 下面（`getBoundingClientRect().top >= 64`）；
- `/docs/learn_ai_coding#what-is-not` 直接打开时，标题在 header 下方可见；
- 代码块有 token 颜色（`document.querySelectorAll("pre .token").length > 0`）；
- 语言下拉能打开，点外面关闭；GitHub 链接带外链图标，在右边。

- [ ] **Step 2: 1024 px 和 390 px**

- 1024 px：sidebar 在，右侧目录不在，正文顶部有收起的 "On this page"；☰ 不显示；
- 390 px：header 只有 ☰、logo、站名；正文紧接在 header 和面包屑后面；
- ☰ 打开抽屉：焦点在关闭按钮；Tab 循环不跑出抽屉；Esc 关闭，焦点回到 ☰，`aria-expanded` 变回 `false`；
- 再打开，点遮罩（抽屉右边的空白）关闭；
- 抽屉里有搜索、菜单（当前项高亮）、语言、主题按钮，doc 页还有当前 section 的 sidebar。

- [ ] **Step 3: 主题和控制台**

- 主题按钮按 浅色 → 深色 → 跟随系统 循环，图标跟着变，`aria-label` 写出当前和下一个；刷新后保持；
- 浅色和深色下代码都可读（底色 `#1e1e1e`）；
- 每页的控制台没有报错。

- [ ] **Step 4: 记录结果**

spec 的状态行加一句"2026-10-17 实现，浏览器验收通过（1440 / 1024 / 390 px）"，并把发现的问题和修复写进 PR 描述。然后 commit：

```bash
git add docs/superpowers/specs/2026-10-17-docs-ux-parity-design.md
git commit -m "docs(spec): docs UX parity implemented and checked in the browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Jp8xna9DgFiYY23QsXGEnB"
```

- [ ] **Step 5: 合并后**

PR、Fable review、合并按 memory 里的流程（独立 Fable review → 修复和复审到 Approve → PR 评论 → CI 绿且 CLEAN → merge commit）。合并后：
- `watch-build.sh` 看自动构建；
- 线上跑 `node scripts/check-page.mjs https://www.web9.ai/docs/learn_ai_coding 'id="what-is-not"' 'aria-label="Breadcrumbs"' 'On this page'`；
- `node scripts/migrate.mjs verify` 仍是全部 unchanged。
