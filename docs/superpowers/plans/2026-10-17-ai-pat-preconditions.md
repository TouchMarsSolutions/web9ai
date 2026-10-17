# AI token 之前的安全前提 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把上级 spec §12「AI PAT 之前」的 7 项都做到，之后才能给 AI Editor 账号发 token。

**Architecture:**
- 长度上限和 body 上限放在 `packages/web9-blocks/lib/`（`limits.mjs`、`pt-guard.mjs`）。
- 单个条目的检查是一个纯函数 `entryProblems`（`lib/entry-guard.mjs`），由 `content:beforeSave`、新增的 `content:beforePublish`/`beforeSchedule` hook 和 `scripts/guard-scan.mjs` 共用。
- slug、菜单、term、byline 没有 hook，由新增的 `src/middleware.ts` 写入闸门在路由之前检查（判定逻辑在 `packages/web9-site/lib/write-gate.mjs`）。
- 文档写明 AI 用 Editor 账号的 device flow token。

**Tech Stack:** EmDash 1.3（Astro 7、Cloudflare adapter、workerd dev）、vitest、Node 24 脚本经 MCP（`scripts/lib/mcp.mjs`）。

**Spec:** `docs/superpowers/specs/2026-10-17-ai-pat-preconditions-design.md`（上级：`docs/superpowers/specs/2026-10-15-emdash-migration-design.md`）

## Global Constraints

- 文档用中文，技术术语保留英文；代码注释用英文，注释密度和用词跟周围代码一致。
- 不改 `node_modules`。core 源码只读，引用时写 `node_modules/emdash/src/...` 的路径和行号。
- 上限值都来自 `packages/web9-blocks/lib/limits.mjs`：title 200、description 1000、excerpt 1000、slug 100、label 80、url 2048、menuItems 50。body 上限在 `pt-guard.mjs`：顶层节点 2000、span 总数 20000、mark 总数 5000、表格 500 行和 2000 个单元格、tabs 20、tools 100、buttons 10。
- 现有内容（35 篇 doc、2 篇 post、2 个 page、菜单、term）必须全部通过新规则。如果有不通过的，停下来报告，不要放宽规则、也不要改内容。
- 提交：按文件名 `git add`，不用 `git add -A` 或 `.`。永远不提交 `.env`、`.dev.vars`、`.local/`、`.wrangler/`、`data.db`、`dist/`、`.superpowers/`。提交信息最后一行写 `Co-Authored-By: <你的模型名> <noreply@anthropic.com>`，不写其他署名行。
- 不打印 secret；token 最多打印前 8 个字符。
- 不直接写 sqlite。探针只走 MCP 或 REST；探针写入要么被拒绝，要么之后永久删除（`content_delete` 再 `content_permanent_delete`；term 用 `taxonomy_delete_term`）。
- dev server 运行时不要跑 `npm run build` 或 `npm run typecheck`。
  - 启动：`npm run dev -- --port 4321`（daemon，跑在 workerd 里，和生产一样）。
  - 停止：`npx astro dev stop`。
  - 改了 plugin 或 middleware 之后，要先停再启 dev，探针才能看到新代码。
  - 健康检查：`curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/` 应返回 200。
- 不用浏览器；不改 Cloudflare 和 GitHub 的设置；不建 AI 用户、不建 token、不部署、不 push。
- Shell：`grep` 是 ugrep，长正则会失败，用 `command grep`；zsh 会自己展开 `--include=*.ts`，glob 要加引号；`sed -i ''` 不可用，改文件用编辑工具或 node。
- subagent 不再派 subagent。
- 测试：全部用 `npm test`，单个文件用 `npx vitest run <path>`。MCP 调用：`node scripts/mcp.mjs <tool> '<json>'`，token 来自 `.local/dev-token`，它是 admin token。

## File Structure

| 文件 | 任务 | 职责 |
|---|---|---|
| `packages/web9-blocks/lib/limits.mjs`（新） | 1 | 上限表，`lengthProblem`，`clampText` |
| `packages/web9-blocks/lib/entry-guard.mjs`（新） | 1 | 钉死的字段表（从 `index.mjs` 搬来），`staticFields`、`mergeLiveFields`、`fieldsFor`、`entryProblems` |
| `packages/web9-blocks/index.mjs` | 1、2 | `beforeSave` 改用 `entryProblems`；新增 `beforePublish`、`cancelDecision`；capabilities |
| `packages/web9-blocks/lib/pt-guard.mjs` | 3 | body 总量、表格单元格、块结构 |
| `packages/web9-blocks/lib/tabs.mjs`（新）、`lib/tool-grid.mjs` | 4 | `tabItems`、`toolItems` |
| `packages/web9-blocks/astro/Tabs.astro`、`ToolGrid.astro` | 4 | 改用上面两个函数 |
| `packages/web9-site/lib/write-gate.mjs`（新） | 5 | 闸门判定 |
| `src/middleware.ts`（新） | 5 | 读请求体，调用闸门 |
| `src/layouts/Base.astro` | 5 | 菜单最多 50 项，label 截断 |
| `packages/web9-site/write-gate.core.test.mjs`（新） | 5 | core 工具名和路由文件快照 |
| `scripts/lib/schema-drift.mjs`（新）、`scripts/migrate.mjs` | 6 | schema 漂移检查 |
| `scripts/lib/guard-scan.mjs`（新）、`scripts/guard-scan.mjs`（新） | 6 | 全库扫描 |
| `packages/web9-site/render-sinks.test.mjs` | 7 | sections、`publicUrl` 钉子 |
| 文档 | 7 | 上级 spec §8/§10/§12、计划 2 未决事项、`CLAUDE.md`、`.agents/skills/web9-blocks/SKILL.md` |

---

### Task 1: 上限表和共用的条目检查

**Files:**
- Create: `packages/web9-blocks/lib/limits.mjs`, `packages/web9-blocks/lib/limits.test.mjs`
- Create: `packages/web9-blocks/lib/entry-guard.mjs`, `packages/web9-blocks/lib/entry-guard.test.mjs`
- Modify: `packages/web9-blocks/index.mjs`（import 区、`PT_FIELDS`/`IMAGE_FIELDS`/`BLOCK_IMAGE_FIELDS` 定义（约 108-118 行）、`beforeSave`（约 120-145 行）、`createPlugin`）
- Modify: `packages/web9-blocks/index.test.mjs`

**Interfaces:**
- Produces（`limits.mjs`）：
  - `LIMITS`（frozen）：`{ title: 200, description: 1000, excerpt: 1000, slug: 100, label: 80, url: 2048, menuItems: 50 }`；
  - `DATA_LIMITS`：`{ title, description, excerpt }`；
  - `lengthProblem(field: string, value: unknown, max: number): string | null`；
  - `clampText(value: unknown, max: number): unknown`。
- Produces（`entry-guard.mjs`）：
  - `PT_FIELDS`、`IMAGE_FIELDS`、`BLOCK_IMAGE_FIELDS`（值不变，`index.mjs` 照旧 re-export）；
  - `staticFields(collection): EntryFields`，其中 `EntryFields = { pt: string[], image: string[], blocks: [string, Record<string,string[]>][] }`；
  - `mergeLiveFields(fields: EntryFields, schemaFields: unknown): EntryFields`；
  - `fieldsFor(collection, schema?): Promise<EntryFields>`；
  - `entryProblems(data: unknown, fields: EntryFields, { slug }?: { slug?: unknown }): string[]`。
- `beforeSave(event, ctx)`：第二个参数是 plugin ctx（core `plugins/hooks.ts:591` 传 `handler(event, ctx)`）。

- [ ] **Step 1: 写 `limits.test.mjs`（失败）**

```js
import { describe, expect, it } from "vitest";
import { DATA_LIMITS, LIMITS, clampText, lengthProblem } from "./limits.mjs";

describe("LIMITS", () => {
	it("holds the limits of spec 2026-10-17 §3.1", () => {
		expect(LIMITS).toEqual({ title: 200, description: 1000, excerpt: 1000, slug: 100, label: 80, url: 2048, menuItems: 50 });
		expect(DATA_LIMITS).toEqual({ title: 200, description: 1000, excerpt: 1000 });
		expect(Object.isFrozen(LIMITS)).toBe(true);
		expect(Object.isFrozen(DATA_LIMITS)).toBe(true);
	});
});

describe("lengthProblem", () => {
	it("reports a string over the limit, with its length", () => {
		expect(lengthProblem("slug", "a".repeat(101), 100)).toBe("slug: at most 100 characters (got 101)");
		expect(lengthProblem("slug", "a".repeat(100), 100)).toBeNull();
	});
	it("ignores anything but a string (core validates types)", () => {
		for (const v of [undefined, null, 5, ["a".repeat(200)], { length: 999 }]) expect(lengthProblem("slug", v, 100)).toBeNull();
	});
});

describe("clampText", () => {
	it("cuts a long string to max units, ending in …", () => {
		expect(clampText("abcdef", 4)).toBe("abc…");
		expect(clampText("abcd", 4)).toBe("abcd");
		expect(clampText("a".repeat(100), 80)).toHaveLength(80);
	});
	it("never splits a surrogate pair", () => {
		const s = "ab😀cd"; // 😀 is two UTF-16 units, at 2 and 3
		expect(clampText(s, 4)).toBe("ab…");
		expect(clampText(s, 5)).toBe("ab😀…");
	});
	it("returns anything but a string unchanged", () => {
		for (const v of [undefined, null, 5, { a: 1 }]) expect(clampText(v, 3)).toBe(v);
	});
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run packages/web9-blocks/lib/limits.test.mjs`
Expected: FAIL（`limits.mjs` 不存在）

- [ ] **Step 3: 写 `limits.mjs`**

```js
// Length and count limits (spec 2026-10-17 §3.1). One table for the save and publish check (entry-guard.mjs), the write
// gate (packages/web9-site/lib/write-gate.mjs), scripts/guard-scan.mjs and the menu in Base.astro. A length is a
// JavaScript string length (UTF-16 code units). Every limit is far above what the site holds today (the spec lists them).
export const LIMITS = Object.freeze({
	title: 200,
	description: 1000,
	excerpt: 1000,
	slug: 100,
	label: 80,
	url: 2048,
	menuItems: 50,
});

/** The `data` fields whose length the save and publish check limits, in every collection. */
export const DATA_LIMITS = Object.freeze({ title: LIMITS.title, description: LIMITS.description, excerpt: LIMITS.excerpt });

/** `field: at most N characters (got M)` when `value` is a string longer than `max`; otherwise null. */
export function lengthProblem(field, value, max) {
	return typeof value === "string" && value.length > max ? `${field}: at most ${max} characters (got ${value.length})` : null;
}

/** `value` cut to at most `max` UTF-16 units ending in "…", never splitting a surrogate pair; anything else unchanged. */
export function clampText(value, max) {
	if (typeof value !== "string" || value.length <= max) return value;
	let end = max - 1;
	const last = value.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end--;
	return `${value.slice(0, end)}…`;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run packages/web9-blocks/lib/limits.test.mjs`
Expected: PASS

- [ ] **Step 5: 写 `entry-guard.test.mjs`（失败）**

```js
import { describe, expect, it, vi } from "vitest";
import { docPayloads } from "../../../scripts/lib/docs-payloads.mjs";
import { homePayload } from "../../../scripts/lib/home-content.mjs";
import { readLegacyTree } from "../../../scripts/lib/legacy-tree.mjs";
import { postPayloads } from "../../../scripts/lib/posts.mjs";
import { BLOCK_IMAGE_FIELDS, IMAGE_FIELDS, PT_FIELDS, entryProblems, fieldsFor, mergeLiveFields, staticFields } from "./entry-guard.mjs";

describe("staticFields", () => {
	it("gives the pinned fields as fresh arrays", () => {
		expect(staticFields("posts")).toEqual({ pt: ["content"], image: ["featured_image"], blocks: [] });
		expect(staticFields("pages")).toEqual({ pt: ["content"], image: [], blocks: [["layout", BLOCK_IMAGE_FIELDS.pages.layout]] });
		staticFields("docs").pt.push("x");
		expect(PT_FIELDS.docs).toEqual(["body"]);
	});
	it("gives nothing for an unknown collection, a prototype name included", () => {
		for (const c of ["other", "constructor", "__proto__", "toString", undefined]) expect(staticFields(c)).toEqual({ pt: [], image: [], blocks: [] });
	});
	it("keeps the pinned tables as they were", () => {
		expect(IMAGE_FIELDS).toEqual({ posts: ["featured_image"] });
	});
});

describe("mergeLiveFields / fieldsFor", () => {
	const live = [{ slug: "title", type: "string" }, { slug: "summary", type: "portableText" }, { slug: "body", type: "portableText" }, { slug: "cover", type: "image" }, { type: "image" }, null];
	it("adds the live portableText and image fields once, keeping the pinned ones", () => {
		expect(mergeLiveFields(staticFields("docs"), live)).toEqual({ pt: ["body", "summary"], image: ["cover"], blocks: [] });
		expect(mergeLiveFields(staticFields("docs"), "not a list")).toEqual(staticFields("docs"));
	});
	it("reads ctx.schema, and falls back to the pinned fields without it or when it fails", async () => {
		const schema = { getCollection: async (slug) => ({ slug, fields: live }) };
		expect((await fieldsFor("docs", schema)).pt).toEqual(["body", "summary"]);
		expect(await fieldsFor("docs")).toEqual(staticFields("docs"));
		expect(await fieldsFor("docs", { getCollection: async () => null })).toEqual(staticFields("docs"));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await fieldsFor("docs", { getCollection: async () => { throw new Error("db down"); } })).toEqual(staticFields("docs"));
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});
});

describe("entryProblems", () => {
	const docs = staticFields("docs");
	it("prefixes each problem with its field", () => {
		expect(entryProblems({ body: [{ _type: "htmlBlock", _key: "h" }] }, docs)).toEqual([
			"body: #0 htmlBlock: raw HTML blocks are not allowed; use Markdown or a Web9 block",
		]);
	});
	it("limits title, description and excerpt in any collection, and the slug when given", () => {
		const none = { pt: [], image: [], blocks: [] };
		expect(entryProblems({ title: "t".repeat(201), description: "d".repeat(1001), excerpt: "e".repeat(1001) }, none, { slug: "s".repeat(101) })).toEqual([
			"title: at most 200 characters (got 201)",
			"description: at most 1000 characters (got 1001)",
			"excerpt: at most 1000 characters (got 1001)",
			"slug: at most 100 characters (got 101)",
		]);
		expect(entryProblems({ title: "t".repeat(200), description: "d".repeat(1000) }, none, { slug: "s".repeat(100) })).toEqual([]);
	});
	it("treats data that is not an object as empty, and reads only own fields", () => {
		for (const data of [undefined, null, "x", 5]) expect(entryProblems(data, docs)).toEqual([]);
		expect(entryProblems(Object.create({ title: "t".repeat(500) }), docs)).toEqual([]);
	});
	it("passes every migrated doc, post and home page (spec 2026-10-17 §4)", () => {
		const tree = readLegacyTree();
		const payloads = [
			...docPayloads(tree).map(({ want }) => want),
			...postPayloads(tree, { dateOf: () => "2020-01-01T00:00:00.000Z" }).map(({ want }) => want),
			homePayload("en"),
			homePayload("zh-CN"),
		];
		expect(payloads.length).toBeGreaterThanOrEqual(39);
		for (const p of payloads) expect(entryProblems(p.data, staticFields(p.collection), { slug: p.slug }), `${p.collection}/${p.locale}/${p.slug}`).toEqual([]);
	});
});
```

`postPayloads` 返回 `[{ file, want }]`，`want` 是 `{ collection: "posts", slug, locale, data, … }`；`dateOf` 要传桩函数，因为默认的 `firstCommitDate` 在浅克隆（CI）里会抛错。

- [ ] **Step 6: 运行，确认失败**

Run: `npx vitest run packages/web9-blocks/lib/entry-guard.test.mjs`
Expected: FAIL（`entry-guard.mjs` 不存在）

- [ ] **Step 7: 写 `entry-guard.mjs`**

```js
// The check of one entry (spec §10; spec 2026-10-17 §3.2, §3.3): its Portable Text, image and block-image fields
// (pt-guard.mjs) and the length limits (limits.mjs). content:beforeSave, the publish hooks (index.mjs) and
// scripts/guard-scan.mjs all call entryProblems, so a value is judged the same wherever it is checked. Nothing here
// imports emdash, so guard-scan runs it in plain node.
import { DATA_LIMITS, LIMITS, lengthProblem } from "./limits.mjs";
import { guardBlockImages, guardImageValue, guardPortableText } from "./pt-guard.mjs";

/** Portable Text fields per collection: all are guarded on every save; the first one feeds search_text. Pinned to the seed. */
export const PT_FIELDS = { docs: ["body"], posts: ["content"], pages: ["content"] };

/** `image` fields per collection: guarded on every save (colour and blurhash values reach style and a decoder). */
export const IMAGE_FIELDS = { posts: ["featured_image"] };

/**
 * `blocks` fields per collection, and in each the paths of the `image` values inside a block type (the same
 * colour and blurhash values, rendered by <Image> in the hero and feature_grid components). Pinned to the seed;
 * `migrate verify` reports a live block type with an image path missing here (scripts/lib/schema-drift.mjs).
 */
export const BLOCK_IMAGE_FIELDS = { pages: { layout: { hero: ["image"], feature_grid: ["features[].image"] } } };

/** @typedef {{ pt: string[], image: string[], blocks: Array<[string, Record<string, string[]>]> }} EntryFields */

const own = (table, key) => (Object.hasOwn(table, key) ? table[key] : undefined);

/** The pinned fields of `collection`, as fresh arrays. @returns {EntryFields} */
export function staticFields(collection) {
	return {
		pt: [...(own(PT_FIELDS, collection) ?? [])],
		image: [...(own(IMAGE_FIELDS, collection) ?? [])],
		blocks: Object.entries(own(BLOCK_IMAGE_FIELDS, collection) ?? {}),
	};
}

/**
 * Adds the live schema's `portableText` and `image` fields to `fields` (`schemaFields`: [{ slug, type }] from the
 * plugin's ctx.schema or MCP schema_get_collection) and returns it. The pinned fields stay: a field the schema no
 * longer lists is still guarded.
 */
export function mergeLiveFields(fields, schemaFields) {
	for (const field of Array.isArray(schemaFields) ? schemaFields : []) {
		if (typeof field?.slug !== "string") continue;
		const list = field.type === "portableText" ? fields.pt : field.type === "image" ? fields.image : null;
		if (list && !list.includes(field.slug)) list.push(field.slug);
	}
	return fields;
}

/**
 * The fields to guard in `collection`: the pinned ones plus the live schema's, read through `schema` (the plugin's
 * ctx.schema, present with the schema:read capability). Without it, or when the read fails, the pinned ones alone.
 * @returns {Promise<EntryFields>}
 */
export async function fieldsFor(collection, schema) {
	const fields = staticFields(collection);
	if (typeof schema?.getCollection !== "function") return fields;
	try {
		return mergeLiveFields(fields, (await schema.getCollection(collection))?.fields);
	} catch (error) {
		console.warn(`[web9-blocks] reading the ${collection} schema failed; guarding the pinned fields only`, error);
		return fields;
	}
}

/**
 * Problems of one entry, each prefixed with its field (`body: #0 htmlBlock: ...`, `title: at most 200 characters
 * (got 201)`); empty means OK. `data` may be partial (an update passes only the changed fields); anything but an
 * object counts as empty (core rejects it). `slug`, when a string, is held to LIMITS.slug.
 * @param {unknown} data @param {EntryFields} fields @param {{ slug?: unknown }} [options]
 */
export function entryProblems(data, fields, { slug } = {}) {
	const value = (field) => (data !== null && typeof data === "object" && Object.hasOwn(data, field) ? data[field] : undefined);
	const prefixed = (field, problems) => problems.map((p) => `${field}: ${p}`);
	return [
		...fields.pt.flatMap((f) => prefixed(f, guardPortableText(value(f)))),
		...fields.image.flatMap((f) => prefixed(f, guardImageValue(value(f)))),
		...fields.blocks.flatMap(([f, paths]) => prefixed(f, guardBlockImages(value(f), paths))),
		...Object.entries(DATA_LIMITS).map(([f, max]) => lengthProblem(f, value(f), max)),
		lengthProblem("slug", slug, LIMITS.slug),
	].filter(Boolean);
}
```

- [ ] **Step 8: 运行，确认通过**

Run: `npx vitest run packages/web9-blocks/lib/entry-guard.test.mjs`
Expected: PASS。如果 corpus 测试失败，说明某个现有条目超了上限：停下来报告是哪个条目、哪一条，不要放宽上限。

- [ ] **Step 9: 在 `index.test.mjs` 的 `describe("content:beforeSave")` 末尾加测试（失败）**

文件顶部的 vitest import 加上 `vi`，然后加：

```js
	it("rejects an over-long title, description or excerpt in any collection (spec 2026-10-17 §3.1)", async () => {
		await expect(beforeSave({ collection: "docs", content: { title: "t".repeat(201) } })).rejects.toMatchObject({
			name: "ContentSaveRejectedError",
			message: "Save rejected (spec §10): title: at most 200 characters (got 201)",
		});
		await expect(beforeSave({ collection: "docs", content: { description: "d".repeat(1001) } })).rejects.toMatchObject({
			message: expect.stringContaining("description: at most 1000 characters (got 1001)"),
		});
		await expect(beforeSave({ collection: "posts", content: { excerpt: "e".repeat(1001) } })).rejects.toMatchObject({ message: expect.stringContaining("excerpt: at most 1000") });
		await expect(beforeSave({ collection: "other", content: { title: "t".repeat(201) } })).rejects.toMatchObject({ name: "ContentSaveRejectedError" });
		const ok = { title: "t".repeat(200), description: "d".repeat(1000), search_text: "kept" };
		expect(await beforeSave({ collection: "other", content: ok })).toBe(ok);
	});
	it("guards the live schema's portableText and image fields too (ctx.schema, schema:read)", async () => {
		const schema = { getCollection: async (slug) => ({ slug, fields: [{ slug: "summary", type: "portableText" }, { slug: "cover", type: "image" }] }) };
		await expect(beforeSave({ collection: "docs", content: { summary: [{ _type: "htmlBlock" }] } }, { schema })).rejects.toMatchObject({
			message: expect.stringContaining("summary: #0 htmlBlock"),
		});
		await expect(beforeSave({ collection: "products", content: { cover: { dominantColor: "red;position:fixed" } } }, { schema })).rejects.toMatchObject({
			message: expect.stringContaining("cover: dominantColor"),
		});
		// search_text still comes from the pinned field only: a collection without one keeps its content as it is
		const products = { summary: [] };
		expect(await beforeSave({ collection: "products", content: products }, { schema })).toBe(products);
	});
	it("falls back to the pinned fields when the schema read fails", async () => {
		const schema = { getCollection: async () => { throw new Error("db down"); } };
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await expect(beforeSave({ collection: "docs", content: { body: [{ _type: "htmlBlock" }] } }, { schema })).rejects.toMatchObject({
			message: expect.stringContaining("body: #0 htmlBlock"),
		});
		expect((await beforeSave({ collection: "docs", content: { body: [callout] } }, { schema })).search_text).toBe("T\nprobe-word");
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
	it("declares schema:read (ctx.schema exists only with it) besides content:write", () => {
		expect(createPlugin().capabilities).toEqual(expect.arrayContaining(["content:write", "schema:read"]));
	});
```

`createPlugin()` 返回 `definePlugin` 的结果，capabilities 已经过规范化（`content:write` 会自动补上 `content:read`），所以只用 `arrayContaining` 断言。

- [ ] **Step 10: 运行，确认新测试失败**

Run: `npx vitest run packages/web9-blocks/index.test.mjs`
Expected: 新加的 4 个测试 FAIL，原有测试 PASS

- [ ] **Step 11: 改 `index.mjs`**

import 区改成：

```js
import { ContentSaveRejectedError, definePlugin } from "emdash";
import { PT_FIELDS, entryProblems, fieldsFor } from "./lib/entry-guard.mjs";
import { extractBlockText } from "./lib/search-text.mjs";

export { BLOCK_IMAGE_FIELDS, IMAGE_FIELDS, PT_FIELDS } from "./lib/entry-guard.mjs";
```

删掉 `index.mjs` 里原来的 `PT_FIELDS`、`IMAGE_FIELDS`、`BLOCK_IMAGE_FIELDS` 定义和它们的注释（已搬到 `entry-guard.mjs`），`beforeSave` 换成：

```js
/**
 * content:beforeSave. Rejects unsafe blocks, image values and over-long fields (spec §10; spec 2026-10-17 §3.1) in the
 * pinned fields plus the live schema's (ctx.schema, schema:read), then mirrors this plugin's block text into
 * search_text, because core search only indexes text/alt/caption/code strings (spec §4).
 */
export async function beforeSave(event, ctx) {
	const { content, collection } = event;
	const problems = entryProblems(content, await fieldsFor(collection, ctx?.schema));
	if (problems.length) throw new ContentSaveRejectedError(`Save rejected (spec §10): ${problems.join("; ")}`.slice(0, 1000));
	// search_text comes from the first pinned Portable Text field: a collection without one keeps its content as it is.
	const main = Object.hasOwn(PT_FIELDS, collection) ? PT_FIELDS[collection][0] : undefined;
	if (main === undefined) return content;
	// Updates pass only the changed fields; when the body didn't change, keep the stored search_text
	// (so a caller-sent one is dropped, not stored).
	if (content[main] === undefined) {
		if (!("search_text" in content)) return content;
		const { search_text: _dropped, ...rest } = content;
		return rest;
	}
	return { ...content, search_text: extractBlockText(content[main], BLOCK_TYPES) };
}
```

`createPlugin` 里：

```js
		// content:beforeSave is skipped without content:write; ctx.schema exists only with schema:read (plugins/context.ts)
		capabilities: ["content:write", "schema:read"],
```

- [ ] **Step 12: 运行全部测试**

Run: `npm test`
Expected: 全部 PASS（原有的 `index.test.mjs` 测试不改也通过：它们不传 ctx，走钉死的表）

- [ ] **Step 13: 在 dev 上探针**

先停再启 dev，让 plugin 生效：`npx astro dev stop`，然后 `npm run dev -- --port 4321`，等 `/` 返回 200。

```bash
node scripts/mcp.mjs content_create "{\"collection\":\"docs\",\"slug\":\"probe-title\",\"locale\":\"en\",\"data\":{\"title\":\"$(node -e 'process.stdout.write("t".repeat(201))')\",\"section\":\"ai\",\"category\":\"usecase\",\"sort_order\":1,\"body\":[]}}"
```

Expected：报错，消息里有 `title: at most 200 characters (got 201)`。然后：

```bash
node scripts/mcp.mjs content_get '{"collection":"docs","id":"probe-title"}'
```

Expected：NOT_FOUND，说明什么都没写进去。另外看 dev 日志里没有 `[web9-blocks] reading the ... schema failed`：这说明 `ctx.schema` 在线上可用。

- [ ] **Step 14: Commit**

```bash
git add packages/web9-blocks/lib/limits.mjs packages/web9-blocks/lib/limits.test.mjs packages/web9-blocks/lib/entry-guard.mjs packages/web9-blocks/lib/entry-guard.test.mjs packages/web9-blocks/index.mjs packages/web9-blocks/index.test.mjs
git commit -m "feat(guard): shared entry check with length limits and live schema fields

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 2: 发布和定时发布前重跑检查

**Files:**
- Modify: `packages/web9-blocks/index.mjs`（新增 `cancelDecision`、`beforePublish`；`createPlugin` 的 capabilities 和 hooks）
- Modify: `packages/web9-blocks/index.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `entryProblems(data, fields, { slug })`、`fieldsFor(collection, schema)`。
- Produces: `cancelDecision(message: string): { cancel: true, reason: string }`；`beforePublish(event, ctx): Promise<undefined | { cancel: true, reason: string }>`。

core 的约束（实现前读一遍）：
- `node_modules/emdash/src/emdash-runtime.ts:4441` `checkContentPolicy`：`event.content` 是草稿合并到线上数据后的条目，`slug` 是待生效的 slug。
- `node_modules/emdash/src/plugins/content-policy.ts` `inspectContentPolicyDecision`：只接受 `undefined`，或者恰好两个 key 的 `{ cancel: true, reason }`。`reason` trim 后要非空、最多 500 个 code point、不含控制字符（tab、LF、CR 除外）。
- `emdash-runtime.ts` `handleContentPublish`：只有拿到 cancellation 时才会把定时发布的条目 unschedule。handler 抛错不会产生 cancellation，条目留在排期里，scheduler 每次都重试。**所以 handler 绝不能抛错，出错也要返回 cancel。**

- [ ] **Step 1: 在 `index.test.mjs` 加测试（失败）**

import 加上 `beforePublish`、`cancelDecision`。新的 describe：

```js
describe("content:beforePublish / content:beforeSchedule (spec 2026-10-17 §3.2)", () => {
	const entry = (data, slug = "ok") => ({ collection: "docs", content: { id: "x", slug, data } });
	it("allows an entry the save check passes", async () => {
		expect(await beforePublish(entry({ title: "T", body: [callout] }))).toBeUndefined();
		expect(await beforePublish({ collection: "docs", content: { id: "x", slug: null } })).toBeUndefined();
	});
	it("cancels a draft the save check rejects, and a staged slug over the limit", async () => {
		expect(await beforePublish(entry({ body: [{ _type: "htmlBlock", _key: "h" }] }))).toEqual({
			cancel: true,
			reason: "Publish rejected (spec §10): body: #0 htmlBlock: raw HTML blocks are not allowed; use Markdown or a Web9 block",
		});
		expect(await beforePublish(entry({ title: "T" }, "s".repeat(101)))).toEqual({
			cancel: true,
			reason: "Publish rejected (spec §10): slug: at most 100 characters (got 101)",
		});
	});
	it("guards the live schema's fields through ctx.schema", async () => {
		const schema = { getCollection: async () => ({ fields: [{ slug: "summary", type: "portableText" }] }) };
		const d = await beforePublish({ collection: "docs", content: { id: "x", data: { summary: [{ _type: "iframe" }] } } }, { schema });
		expect(d.reason).toContain("summary: #0 iframe");
	});
	it("answers only with a decision core accepts: two keys, at most 500 code points, no control characters", async () => {
		const many = Array.from({ length: 60 }, (_, k) => ({ _type: "htmlBlock", _key: `h${k}` }));
		const d = await beforePublish(entry({ body: many }));
		expect(Object.keys(d)).toEqual(["cancel", "reason"]);
		expect(Array.from(d.reason).length).toBeLessThanOrEqual(500);
		expect(d.reason.endsWith("…")).toBe(true);
		expect(cancelDecision("a\u0007b\tc\nd\u007f")).toEqual({ cancel: true, reason: "a b\tc\nd" });
		expect(Array.from(cancelDecision("😀".repeat(600)).reason)).toHaveLength(500);
		expect(cancelDecision(" \u0001 ")).toEqual({ cancel: true, reason: "Publish rejected (spec §10): the content check failed" });
	});
	it("cancels instead of throwing when the check itself fails (a throw would leave a scheduled entry scheduled)", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const ctx = { get schema() { throw new Error("boom"); } };
		expect(await beforePublish(entry({ title: "T" }), ctx)).toEqual({ cancel: true, reason: "Publish rejected (spec §10): the content check failed" });
		expect(await beforePublish(undefined)).toBeUndefined();
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
	});
	it("is registered for publish and schedule, with the content-policy capability", () => {
		const plugin = createPlugin();
		expect(plugin.hooks["content:beforePublish"]).toMatchObject({ handler: beforePublish });
		expect(plugin.hooks["content:beforeSchedule"]).toMatchObject({ handler: beforePublish });
		// definePlugin normalizes: content:write adds the implied content:read (plugins/types.ts PLUGIN_CAPABILITY_IMPLICATIONS)
		expect(plugin.capabilities).toEqual(expect.arrayContaining(["content:write", "schema:read", "hooks.content-policy:register"]));
	});
});
```

`beforePublish(undefined)` 应该返回 `undefined`：没有 `content`，就没有数据，也就没有问题。

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run packages/web9-blocks/index.test.mjs`
Expected: 新 describe FAIL

- [ ] **Step 3: 实现**

加在 `index.mjs` 的 `beforeSave` 后面：

```js
const MAX_REASON = 500; // core's MAX_CONTENT_POLICY_REASON_LENGTH (plugins/content-policy.ts), in code points
const CHECK_FAILED = "Publish rejected (spec §10): the content check failed";

/**
 * A cancel decision core accepts (inspectContentPolicyDecision): exactly { cancel, reason }, the reason trimmed and
 * non-empty, without control characters (tab, LF and CR are allowed) and at most MAX_REASON code points.
 */
export function cancelDecision(message) {
	const clean = String(message).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
	const points = Array.from(clean);
	const reason = points.length > MAX_REASON ? `${points.slice(0, MAX_REASON - 1).join("").trimEnd()}…` : clean;
	return { cancel: true, reason: reason || CHECK_FAILED };
}

/**
 * content:beforePublish and content:beforeSchedule (spec 2026-10-17 §3.2). core hands over the entry with its draft
 * merged in and the staged slug (emdash-runtime.ts checkContentPolicy), so this judges what would go live: the save
 * check plus the slug length. It never throws: a throw also blocks the publish but sets no cancellation, so a
 * scheduled entry would stay scheduled and the scheduler would retry it on every tick.
 */
export async function beforePublish(event, ctx) {
	try {
		const content = event?.content;
		const problems = entryProblems(content?.data, await fieldsFor(event?.collection, ctx?.schema), { slug: content?.slug });
		return problems.length ? cancelDecision(`Publish rejected (spec §10): ${problems.join("; ")}`) : undefined;
	} catch (error) {
		console.error("[web9-blocks] the publish check failed; rejecting", error);
		return cancelDecision(CHECK_FAILED);
	}
}
```

`createPlugin`：

```js
		// content:beforeSave is skipped without content:write; ctx.schema exists only with schema:read (plugins/context.ts);
		// the publish and schedule hooks need hooks.content-policy:register (plugins/hooks.ts:346)
		capabilities: ["content:write", "schema:read", "hooks.content-policy:register"],
		hooks: {
			"content:beforeSave": beforeSave,
			"content:beforePublish": beforePublish,
			"content:beforeSchedule": beforePublish,
			"page:metadata": pageMetadata,
		},
```

- [ ] **Step 4: 运行全部测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 在 dev 上探针（Task 5 的闸门还没加，所以这时还能写进超长 slug 的草稿）**

先停再启 dev。然后：

1. `node scripts/mcp.mjs content_create '{"collection":"posts","slug":"<"probe-" 加 150 个 x>","locale":"en","data":{"title":"Probe"}}'`：Expected 成功（草稿），记下返回的 `id`。
2. `node scripts/mcp.mjs content_publish '{"collection":"posts","id":"<id>"}'`：Expected 失败，消息含 `Publish rejected (spec §10): slug: at most 100 characters (got 156)`。
3. `node scripts/mcp.mjs content_schedule '{"collection":"posts","id":"<id>","_rev":"<rev>","scheduledAt":"2030-01-01T00:00:00.000Z"}'`（`_rev` 必填，先用 `content_get` 取）：Expected 失败，同样的消息。参数名以 `node_modules/emdash/src/mcp/server.ts` 里 `content_schedule` 的 inputSchema 为准。
4. 正向探针：`content_create` 一篇 slug 为 `probe-ok` 的 posts 草稿，`content_publish` 成功，然后 `content_unpublish`。
5. 清理两篇探针：`content_delete`，再 `content_permanent_delete`（参数看 server.ts）。确认两个 slug 的 `content_get` 都是 NOT_FOUND，`content_list_trashed {"collection":"posts"}` 里也没有它们。

- [ ] **Step 6: Commit**

```bash
git add packages/web9-blocks/index.mjs packages/web9-blocks/index.test.mjs
git commit -m "feat(guard): re-run the entry check on publish and schedule, fail closed

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 3: guard 加 body 总量、表格单元格、块结构

**Files:**
- Modify: `packages/web9-blocks/lib/pt-guard.mjs`
- Modify: `packages/web9-blocks/lib/pt-guard.test.mjs`（只改一处，见 Step 3 第 7 点）
- Create: `packages/web9-blocks/lib/pt-guard.caps.test.mjs`

**Interfaces:**
- `guardPortableText(value)` 签名不变，新增的问题文案见下面的测试。
- 现有 `pt-guard.test.mjs` 除了 Step 3 第 7 点那一处，都必须不改就通过：特别是 "returns at most 50 problems plus a final entry"（输出最多 50 条加 `…and more`）和单 span、单 block 的上限测试。

- [ ] **Step 1: 写 `pt-guard.caps.test.mjs`（失败）**

```js
import { describe, expect, it } from "vitest";
import { guardPortableText } from "./pt-guard.mjs";

const span = (text = "a", marks = []) => ({ _type: "span", _key: "s", text, marks });
const para = (children) => ({ _type: "block", _key: "b", style: "normal", markDefs: [], children });
const cell = (content) => ({ _type: "tableCell", _key: "c", content, markDefs: [] });
const row = (cells) => ({ _type: "tableRow", _key: "r", cells });
const table = (rows) => ({ _type: "table", _key: "t", rows });

describe("guardPortableText: totals over the whole value (spec 2026-10-17 §3.6)", () => {
	it("allows at most 2000 top-level nodes", () => {
		expect(guardPortableText(Array.from({ length: 2001 }, () => para([span()])))).toEqual(["at most 2000 top-level blocks are allowed (got 2001)"]);
		expect(guardPortableText(Array.from({ length: 2000 }, () => para([span()])))).toEqual([]);
	});
	it("allows at most 20000 spans in total, counting blocks, container blocks and table cells", () => {
		const full = (n) => para(Array.from({ length: n }, () => span()));
		expect(guardPortableText(Array.from({ length: 20 }, () => full(1000)))).toEqual([]);
		expect(guardPortableText([...Array.from({ length: 20 }, () => full(1000)), full(1)])).toEqual(["at most 20000 spans are allowed in total"]);
		expect(guardPortableText([...Array.from({ length: 19 }, () => full(1000)), { _type: "cover", _key: "v", content: [full(1000)] }, table([row([cell([span()])])])])).toEqual([
			"at most 20000 spans are allowed in total",
		]);
	});
	it("allows at most 5000 marks in total (render CPU grows with marks)", () => {
		const marked = (n) => para(Array.from({ length: n }, () => span("a", ["strong", "em"])));
		expect(guardPortableText([marked(1000), marked(1000), marked(500)])).toEqual([]);
		expect(guardPortableText([marked(1000), marked(1000), marked(500), table([row([cell([span("a", ["strong"])])])])])).toEqual(["at most 5000 marks are allowed in total"]);
	});
});

describe("guardPortableText: tables (spec 2026-10-17 §3.6)", () => {
	it("passes the shape the converter writes", () => {
		expect(guardPortableText([table([row([cell([span("h", ["strong"])]), cell([])]), row([cell([span("x")])])])])).toEqual([]);
		expect(guardPortableText([{ _type: "table", _key: "t" }])).toEqual([]);
	});
	it("requires arrays and objects where core maps", () => {
		expect(guardPortableText([table("rows")])).toEqual(["#0 table rows: must be an array"]);
		expect(guardPortableText([table([null, row("cells"), row([5, cell({})])])])).toEqual([
			"#0 table rows[0]: must be an object",
			"#0 table rows[1].cells: must be an array",
			"#0 table rows[2].cells[0]: must be an object",
			"#0 table rows[2].cells[1] content: must be an array of spans",
		]);
	});
	it("allows spans only in a cell, without children, with at most 20 marks", () => {
		expect(guardPortableText([table([row([cell([{ _type: "image", _key: "i" }, { ...span(), children: [] }, span("a", Array(21).fill("em")), span("a", "em")])])])])).toEqual([
			"#0 table rows[0].cells[0] content[0] image: only spans are allowed in a table cell",
			"#0 table rows[0].cells[0] content[1] span: a span must not have children",
			"#0 table rows[0].cells[0] content[2].marks: at most 20 marks are allowed",
			"#0 table rows[0].cells[0] content[3].marks: must be an array",
		]);
	});
	it("allows at most 500 rows, 2000 cells per table and 1000 spans per cell", () => {
		expect(guardPortableText([table(Array.from({ length: 501 }, () => row([])))])).toEqual(["#0 table rows: at most 500 rows are allowed"]);
		expect(guardPortableText([table(Array.from({ length: 500 }, () => row(Array.from({ length: 4 }, () => cell([])))))])).toEqual([]);
		expect(guardPortableText([table(Array.from({ length: 401 }, () => row(Array.from({ length: 5 }, () => cell([])))))])).toEqual(["#0 table: at most 2000 cells are allowed"]);
		expect(guardPortableText([table([row([cell(Array.from({ length: 1001 }, () => span()))])])])).toEqual(["#0 table rows[0].cells[0] content: at most 1000 spans are allowed"]);
	});
});

describe("guardPortableText: block shapes that crash their renderer (spec 2026-10-17 §3.6)", () => {
	it("requires buttons, tabs and tools to be arrays of objects", () => {
		for (const [type, field] of [["buttons", "buttons"], ["tabs", "tabs"], ["tool_grid", "tools"]]) {
			for (const bad of ["x", 5, {}, true]) expect(guardPortableText([{ _type: type, _key: "k", [field]: bad }])).toEqual([`#0 ${type} ${field}: must be an array`]);
			expect(guardPortableText([{ _type: type, _key: "k", [field]: [null, 5, []] }])).toEqual([
				`#0 ${type} ${field}[0]: must be an object`,
				`#0 ${type} ${field}[1]: must be an object`,
				`#0 ${type} ${field}[2]: must be an object`,
			]);
			for (const ok of [undefined, null, []]) expect(guardPortableText([{ _type: type, _key: "k", [field]: ok }])).toEqual([]);
		}
	});
	it("caps tabs at 20, tools at 100 and buttons at 10", () => {
		const n = (k) => Array.from({ length: k }, () => ({}));
		expect(guardPortableText([{ _type: "tabs", _key: "k", tabs: n(21) }])).toEqual(["#0 tabs tabs: at most 20 items are allowed"]);
		expect(guardPortableText([{ _type: "tool_grid", _key: "k", tools: n(101) }])).toEqual(["#0 tool_grid tools: at most 100 items are allowed"]);
		expect(guardPortableText([{ _type: "buttons", _key: "k", buttons: n(11) }])).toEqual(["#0 buttons buttons: at most 10 items are allowed"]);
		expect(guardPortableText([{ _type: "tabs", _key: "k", tabs: n(20) }, { _type: "tool_grid", _key: "g", tools: n(100) }, { _type: "buttons", _key: "b", buttons: n(10) }])).toEqual([]);
	});
	it("requires the text fields to be strings and featured a boolean when present", () => {
		expect(guardPortableText([{ _type: "tabs", _key: "k", tabs: [{ label: 5, body: {} }, { label: "a", body: "md" }, { label: null }] }])).toEqual([
			"#0 tabs tabs[0].label: value 5 is not allowed",
			"#0 tabs tabs[0].body: value {} is not allowed",
		]);
		expect(guardPortableText([{ _type: "tool_grid", _key: "k", tools: [{ name: ["n"], tagline: 5, featured: "yes" }, { name: "a", tagline: "t", featured: false }] }])).toEqual([
			'#0 tool_grid tools[0].name: value ["n"] is not allowed',
			"#0 tool_grid tools[0].tagline: value 5 is not allowed",
			'#0 tool_grid tools[0].featured: value "yes" is not allowed',
		]);
		expect(guardPortableText([{ _type: "buttons", _key: "k", buttons: [{ text: 5 }, { text: "ok" }] }])).toEqual(["#0 buttons buttons[0].text: value 5 is not allowed"]);
	});
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run packages/web9-blocks/lib/pt-guard.caps.test.mjs`
Expected: FAIL

- [ ] **Step 3: 实现（`pt-guard.mjs`）**

1. 文件头注释：把 "Table cells are not walked: they are left to core's normalizePortableTextTable, which bounds their types (spans only) and marks (decorators or a link) but not their sizes, so the caps below do not reach them." 换成：

```js
// Table cells (core: rows[] of { _type: "tableRow", cells[] }, a cell { _type: "tableCell", content: Span[], markDefs? })
// are walked for shape and size: rows and cells must be arrays of objects, a cell's content spans only, with the span
// caps below. Mark names and markDefs in cells are left to core's normalizePortableTextTable, which bounds them.
// Totals over the whole value (spec 2026-10-17 §3.6): render CPU grows with every span and, most, with every mark
// (plan 2 measured 0.3 s for one block of 1000 spans × 20 marks), so a value holds at most MAX_NODES top-level nodes,
// MAX_SPANS spans and MAX_TOTAL_MARKS marks, counting blocks, container blocks and table cells; past a total the walk
// stops with that one problem. Lists that a renderer maps (buttons.buttons, tabs.tabs, tool_grid.tools) must be arrays
// of objects within a size cap, and their text fields strings: a null item or a number tagline throws at render time.
```

2. 常量放在 `MAX_CHILDREN` 旁边：

```js
const MAX_NODES = 2000;
const MAX_SPANS = 20000;
const MAX_TOTAL_MARKS = 5000;
const MAX_ROWS = 500;
const MAX_CELLS = 2000;
/** Lists a renderer maps: [field, max items, string fields of an item, boolean fields of an item]. url/logo are in RULES. */
const LISTS = {
	buttons: ["buttons", 10, ["text"], []],
	tabs: ["tabs", 20, ["label", "body"], []],
	tool_grid: ["tools", 100, ["name", "tagline"], ["featured"]],
};
```

3. `collector()` 换成下面这版（`full` 的语义不变；新增 `stop`、计数，只有真的丢了问题时才加 `MORE`）：

```js
/** Keeps the first MAX_PROBLEMS problems. `full` turns true once one was left out or the walk was stopped, so loops end. */
function collector() {
	const list = [];
	let dropped = false;
	return {
		full: false,
		spans: 0,
		marks: 0,
		add(problem) {
			if (list.length < MAX_PROBLEMS) list.push(problem);
			else dropped = this.full = true;
		},
		/** Adds `problem` and ends the walk (a total cap is past). */
		stop(problem) {
			this.add(problem);
			this.full = true;
		},
		done() {
			return dropped ? [...list, MORE] : list;
		},
	};
}

/** Counts spans and marks toward the value's totals; past one, stops the walk with its problem. */
function count(out, spans, marks) {
	if (out.full) return;
	out.spans += spans;
	out.marks += marks;
	if (out.spans > MAX_SPANS) out.stop(`at most ${MAX_SPANS} spans are allowed in total`);
	else if (out.marks > MAX_TOTAL_MARKS) out.stop(`at most ${MAX_TOTAL_MARKS} marks are allowed in total`);
}
```

4. `checkBlock`：通过 `node.children.length > MAX_CHILDREN` 检查之后、循环之前，加 `count(out, node.children.length, 0);`。在循环里，一个 span 的 `marks` 通过数组和 `MAX_MARKS` 检查之后（`for (let m …)` 之前），加 `count(out, 0, child.marks.length);`；如果 `out.full`，`for` 的条件会让循环结束。

5. 新函数：

```js
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** A table cell's content: spans only (core renders them inline), within the span and mark caps. */
function checkCell(cell, at, out) {
	if (cell.content == null) return;
	if (!Array.isArray(cell.content)) return out.add(`${at} content: must be an array of spans`);
	if (cell.content.length > MAX_CHILDREN) return out.add(`${at} content: at most ${MAX_CHILDREN} spans are allowed`);
	count(out, cell.content.length, 0);
	for (let j = 0; j < cell.content.length && !out.full; j++) {
		const span = cell.content[j];
		const type = typeof span?._type === "string" ? span._type : "(no _type)";
		if (type !== "span") {
			out.add(`${at} content[${j}] ${type}: only spans are allowed in a table cell`);
			continue;
		}
		if (span.children != null) out.add(`${at} content[${j}] span: a span must not have children`);
		if (span.marks == null) continue;
		if (!Array.isArray(span.marks)) out.add(`${at} content[${j}].marks: must be an array`);
		else if (span.marks.length > MAX_MARKS) out.add(`${at} content[${j}].marks: at most ${MAX_MARKS} marks are allowed`);
		else count(out, 0, span.marks.length);
	}
}

/** core's Table.astro maps rows[].cells[]: arrays of objects, within MAX_ROWS rows and MAX_CELLS cells. */
function checkTable(node, i, out) {
	const where = `#${i} table`;
	if (node.rows == null) return;
	if (!Array.isArray(node.rows)) return out.add(`${where} rows: must be an array`);
	if (node.rows.length > MAX_ROWS) return out.add(`${where} rows: at most ${MAX_ROWS} rows are allowed`);
	let cells = 0;
	for (let r = 0; r < node.rows.length && !out.full; r++) {
		const row = node.rows[r];
		if (!isObject(row)) {
			out.add(`${where} rows[${r}]: must be an object`);
			continue;
		}
		if (row.cells == null) continue;
		if (!Array.isArray(row.cells)) {
			out.add(`${where} rows[${r}].cells: must be an array`);
			continue;
		}
		cells += row.cells.length;
		if (cells > MAX_CELLS) return out.add(`${where}: at most ${MAX_CELLS} cells are allowed`);
		for (let c = 0; c < row.cells.length && !out.full; c++) {
			const at = `${where} rows[${r}].cells[${c}]`;
			if (!isObject(row.cells[c])) out.add(`${at}: must be an object`);
			else checkCell(row.cells[c], at, out);
		}
	}
}

/** A list a renderer maps (LISTS): an array of objects within its cap, text fields strings, flags booleans. */
function checkList(node, type, i, out) {
	const [field, max, strings, booleans] = LISTS[type];
	const list = node[field];
	const where = `#${i} ${type} ${field}`;
	if (list == null) return;
	if (!Array.isArray(list)) return out.add(`${where}: must be an array`);
	if (list.length > max) return out.add(`${where}: at most ${max} items are allowed`);
	for (let k = 0; k < list.length && !out.full; k++) {
		const item = list[k];
		if (!isObject(item)) {
			out.add(`${where}[${k}]: must be an object`);
			continue;
		}
		for (const key of strings) if (item[key] != null && typeof item[key] !== "string") out.add(notAllowed(`#${i} ${type}`, `${field}[${k}].${key}`, item[key]));
		for (const key of booleans) if (item[key] != null && typeof item[key] !== "boolean") out.add(notAllowed(`#${i} ${type}`, `${field}[${k}].${key}`, item[key]));
	}
}
```

6. `guardPortableText`：在 `if (!Array.isArray(value)) …` 之后、`const out = collector()` 之前加：

```js
	if (value.length > MAX_NODES) return [`at most ${MAX_NODES} top-level blocks are allowed (got ${value.length})`];
```

在循环里，`if (type === "columns") checkColumns(node, i, out);` 的后面加：

```js
		if (type === "table") checkTable(node, i, out);
		if (Object.hasOwn(LISTS, type)) checkList(node, type, i, out);
```

`checkList` 和现有 `RULES` 对 `buttons[].url`、`tools[].url`、`tools[].logo` 的检查不重叠（这几个字段不在 `LISTS` 的字符串字段里），所以同一个值不会报两次。

7. `pt-guard.test.mjs` 的 "does not throw on 200k bad top-level nodes, markDefs, container blocks or gallery images"（约 492 行）：200k 个顶层节点现在只报节点上限，不再以 `…and more` 结尾。把 `bad(200000, () => ({ _type: "marquee" })),` 这一项从循环的数组里删掉，在循环后面加：

```js
		expect(guardPortableText(bad(200000, () => ({ _type: "marquee" })))).toEqual(["at most 2000 top-level blocks are allowed (got 200000)"]);
```

- [ ] **Step 4: 运行**

Run: `npx vitest run packages/web9-blocks/lib/pt-guard.caps.test.mjs packages/web9-blocks/lib/pt-guard.test.mjs scripts/lib/legacy-tree.test.mjs packages/web9-blocks/lib/entry-guard.test.mjs`
Expected: 全部 PASS。`legacy-tree.test.mjs` 和 `entry-guard.test.mjs` 会对全部迁移内容跑 guard；如果失败，停下来报告是哪个条目、哪一条。

- [ ] **Step 5: 全部测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web9-blocks/lib/pt-guard.mjs packages/web9-blocks/lib/pt-guard.test.mjs packages/web9-blocks/lib/pt-guard.caps.test.mjs
git commit -m "feat(guard): body totals, table cells and block list shapes

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 4: Tabs 和 ToolGrid 遇到异常结构不崩

**Files:**
- Create: `packages/web9-blocks/lib/tabs.mjs`, `packages/web9-blocks/lib/tabs.test.mjs`
- Modify: `packages/web9-blocks/lib/tool-grid.mjs`, `packages/web9-blocks/lib/tool-grid.test.mjs`
- Modify: `packages/web9-blocks/astro/Tabs.astro`, `packages/web9-blocks/astro/ToolGrid.astro`
- Modify: `packages/web9-blocks/astro-registry.test.mjs`（源码钉子）

**Interfaces:**
- Produces: `tabItems(node): { label: string, body: string }[]`；`toolItems(node): { name: string, tagline: string, url: string, logo: string, featured: boolean }[]`。

- [ ] **Step 1: 写测试（失败）**

`packages/web9-blocks/lib/tabs.test.mjs`：

```js
import { describe, expect, it } from "vitest";
import { tabItems } from "./tabs.mjs";

describe("tabItems", () => {
	it("keeps object tabs, with label and body as strings", () => {
		expect(tabItems({ tabs: [{ label: "A", body: "md" }, null, 5, [], { label: 7, body: { x: 1 } }, {}] })).toEqual([
			{ label: "A", body: "md" },
			{ label: "", body: "" },
			{ label: "", body: "" },
		]);
	});
	it("gives no tabs for a missing or non-array list", () => {
		for (const node of [undefined, null, {}, { tabs: "x" }, { tabs: { 0: {} } }]) expect(tabItems(node)).toEqual([]);
	});
});
```

在 `tool-grid.test.mjs` 末尾加（import 改成 `import { logoSize, toolItems } from "./tool-grid.mjs";`）：

```js
describe("toolItems", () => {
	it("keeps object tools, text fields as strings, featured only when true", () => {
		expect(
			toolItems({
				tools: [
					{ name: "Coze", tagline: "AI **Agent**", logo: "/img/c.png", url: "https://www.coze.com/", featured: true },
					null,
					"x",
					{ name: 5, tagline: 6, logo: {}, url: [], featured: "yes" },
				],
			}),
		).toEqual([
			{ name: "Coze", tagline: "AI **Agent**", logo: "/img/c.png", url: "https://www.coze.com/", featured: true },
			{ name: "", tagline: "", logo: "", url: "", featured: false },
		]);
	});
	it("gives no tools for a missing or non-array list", () => {
		for (const node of [undefined, null, {}, { tools: 5 }]) expect(toolItems(node)).toEqual([]);
	});
});
```

在 `astro-registry.test.mjs` 末尾加：

```js
describe("Tabs and ToolGrid", () => {
	const component = (name) => readFileSync(new URL(`./astro/${name}`, import.meta.url), "utf8");
	it("render the lists tabItems and toolItems give (a null item or a number tagline used to throw)", () => {
		const tabs = component("Tabs.astro");
		expect(tabs).toMatch(/^import \{ tabItems \} from "\.\.\/lib\/tabs\.mjs";$/m);
		expect(tabs).toContain("const tabs = tabItems(node);");
		const grid = component("ToolGrid.astro");
		expect(grid).toMatch(/^import \{ logoSize, toolItems \} from "\.\.\/lib\/tool-grid\.mjs";$/m);
		expect(grid).toContain("const tools = toolItems(node);");
		for (const source of [tabs, grid]) expect(source).not.toMatch(/Array\.isArray\(node\?\.(tabs|tools)\)/);
	});
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run packages/web9-blocks/lib/tabs.test.mjs packages/web9-blocks/lib/tool-grid.test.mjs packages/web9-blocks/astro-registry.test.mjs`
Expected: FAIL

- [ ] **Step 3: 实现**

`packages/web9-blocks/lib/tabs.mjs`：

```js
// The tabs of a tabs block as Tabs.astro renders them. The write check rejects a bad shape (pt-guard.mjs), but stored
// values from before it, or written past it, must not take the page down: tab.label on a null tab throws.
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v : "");

/** Object tabs only; label and body as strings ("" when missing or not a string). */
export function tabItems(node) {
	const list = Array.isArray(node?.tabs) ? node.tabs : [];
	return list.filter(isObject).map((tab) => ({ label: text(tab.label), body: text(tab.body) }));
}
```

`tool-grid.mjs` 末尾加：

```js
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v : "");

/**
 * The tools of a tool_grid block as ToolGrid.astro renders them: object tools only, text fields as strings ("" when
 * missing or not a string), featured only when true. tool.featured on a null tool, or tagline.replace on a number,
 * used to throw and take the page down.
 */
export function toolItems(node) {
	const list = Array.isArray(node?.tools) ? node.tools : [];
	return list
		.filter(isObject)
		.map((tool) => ({ name: text(tool.name), tagline: text(tool.tagline), url: text(tool.url), logo: text(tool.logo), featured: tool.featured === true }));
}
```

`Tabs.astro` frontmatter：

```astro
---
import { renderMarkdown } from "../lib/markdown.mjs";
import { tabItems } from "../lib/tabs.mjs";

interface Props {
	node: { _type: "tabs"; _key: string; tabs?: unknown; default_tab?: number; fullscreen?: boolean };
}
const { node } = Astro.props;
const tabs = tabItems(node);
const active = Math.min(Math.max((node?.default_tab ?? 1) - 1, 0), Math.max(tabs.length - 1, 0));
// Unique per render, so two tabs blocks on one page never share ids (a missing or repeated _key used to collide)
const uid = `w9t-${crypto.randomUUID().slice(0, 8)}`;
---
```

markup 不变（`{tab.label}`、`renderMarkdown(tab.body)` 现在拿到的都是字符串）。

`ToolGrid.astro` frontmatter：

```astro
---
import { sanitizeHref } from "emdash";
import { renderInlineMarkdown } from "../lib/markdown.mjs";
import { logoSize, toolItems } from "../lib/tool-grid.mjs";

interface Props {
	node: { _type: "tool_grid"; _key: string; title?: string; tools?: unknown; logo_size?: number };
}
const { node } = Astro.props;
const tools = toolItems(node);
// Also set inline on the img: preflight's img { height: auto } would otherwise undo object-contain.
const size = logoSize(node?.logo_size);
---
```

markup 里只改一处：`alt={tool.name ?? ""}` 改成 `alt={tool.name}`。其余（`tool.featured ?`、`tool.url ? sanitizeHref(tool.url) : undefined`、`tool.logo &&`、`tool.tagline && … tool.tagline.replace(…)`）不变。

- [ ] **Step 4: 运行全部测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 在 dev 上检查页面**

Run: `node scripts/check-page.mjs http://localhost:4321/docs/guide data-w9-tabs`、`node scripts/check-page.mjs http://localhost:4321/docs/ai-tools-adhoc data-w9-tabs data-w9-tools` 和 `node scripts/check-page.mjs http://localhost:4321/docs/tools-summary data-w9-tools`
Expected: 三个页面都返回 200，marker 都在（脚本用法：`check-page.mjs <url> <marker>...`，任何一条不满足就退出 1）。

- [ ] **Step 6: Commit**

```bash
git add packages/web9-blocks/lib/tabs.mjs packages/web9-blocks/lib/tabs.test.mjs packages/web9-blocks/lib/tool-grid.mjs packages/web9-blocks/lib/tool-grid.test.mjs packages/web9-blocks/astro/Tabs.astro packages/web9-blocks/astro/ToolGrid.astro packages/web9-blocks/astro-registry.test.mjs
git commit -m "fix(blocks): Tabs and ToolGrid skip malformed items instead of throwing

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 5: 写入闸门 middleware 和菜单截断

**Files:**
- Create: `packages/web9-site/lib/write-gate.mjs`, `packages/web9-site/lib/write-gate.test.mjs`
- Create: `src/middleware.ts`
- Create: `packages/web9-site/write-gate.core.test.mjs`
- Modify: `src/layouts/Base.astro`（第 9 行的 import 区；约第 45 行的 `menuItems`）
- Modify: `packages/web9-site/render-sinks.test.mjs`（菜单钉子）

**Interfaces:**
- Consumes: Task 1 的 `LIMITS`、`lengthProblem`、`clampText`（`packages/web9-blocks/lib/limits.mjs`）。
- Produces:
  - `MAX_GATED_BODY_BYTES`（= 10 MiB）；
  - `gatedRequest(method: string, pathname: string): boolean`；
  - `writeGateResponse(method: string, pathname: string, body: unknown): null | { status: number, body: object }`。

背景（实现前读一遍）：
- EmDash 的 middleware 都是 `order: "pre"`（`node_modules/emdash/src/astro/integration/index.ts:411-436`），所以 `src/middleware.ts` 在它的鉴权之后、路由之前运行。
- Astro 7 的 `context.url.pathname` 已经解码，重复斜杠也已合并（`node_modules/astro/dist/core/util/normalized-url.js`），路由匹配用的就是它。**不要再解码**，也不要用 `request.url`。
- core 的 `parseBody` 不看 Content-Type（`node_modules/emdash/src/api/parse.ts:27`）。MCP 接受 JSON-RPC batch（数组，最多 100 条）。
- core 的错误格式：`{ success: false, error: { code, message } }`，带 `Cache-Control: private, no-store`（`node_modules/emdash/src/api/error.ts`）。

- [ ] **Step 1: 写 `write-gate.test.mjs`（失败）**

```js
import { describe, expect, it } from "vitest";
import { MAX_GATED_BODY_BYTES, gatedRequest, writeGateResponse } from "./write-gate.mjs";

const long = (n) => "x".repeat(n);
const call = (name, args, id = 7) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

describe("gatedRequest", () => {
	it("reads the body of writes to the gated REST routes and the MCP endpoint only", () => {
		for (const [method, path] of [
			["POST", "/_emdash/api/content/docs"],
			["PUT", "/_emdash/api/content/docs/01ABC"],
			["POST", "/_emdash/api/menus/primary/items"],
			["PUT", "/_emdash/api/menus/primary/items/01ABC"],
			["POST", "/_emdash/api/taxonomies/tag/terms"],
			["PUT", "/_emdash/api/taxonomies/tag/terms/ai"],
			["POST", "/_emdash/api/taxonomies/tag/terms/ai/translations"],
			["POST", "/_emdash/api/mcp"],
			["PATCH", "/_emdash/api/content/docs/01ABC/"],
		]) expect(gatedRequest(method, path), `${method} ${path}`).toBe(true);
		for (const [method, path] of [
			["GET", "/_emdash/api/content/docs"],
			["DELETE", "/_emdash/api/content/docs/01ABC"],
			["POST", "/_emdash/api/content/docs/01ABC/publish"],
			["POST", "/_emdash/api/menus/primary"],
			["POST", "/_emdash/api/taxonomies/tag/terms/ai/reorder"],
			["POST", "/_emdash/api/media"],
			["POST", "/docs/x"],
			["POST", "/_emdash/api/mcp/extra"],
		]) expect(gatedRequest(method, path), `${method} ${path}`).toBe(false);
	});
	it("matches the path as Astro routes it: empty segments dropped, nothing decoded again", () => {
		expect(gatedRequest("POST", "/_emdash/api/content/docs/")).toBe(true);
		expect(gatedRequest("PUT", "/_emdash/api/content/docs/100%")).toBe(true);
		expect(gatedRequest("PUT", "/_emdash/api/content/docs/a%2Fb")).toBe(true);
	});
	it("names core's body limit", () => {
		expect(MAX_GATED_BODY_BYTES).toBe(10 * 1024 * 1024);
	});
});

describe("writeGateResponse: REST", () => {
	it("rejects an over-long slug, menu label or URL, term label or slug with core's 400 shape", () => {
		expect(writeGateResponse("POST", "/_emdash/api/content/docs", { slug: long(101), data: {} })).toEqual({
			status: 400,
			body: { success: false, error: { code: "VALIDATION_ERROR", message: "Write rejected (spec §10): slug: at most 100 characters (got 101)" } },
		});
		expect(writeGateResponse("PUT", "/_emdash/api/menus/primary/items/1", { label: long(81), customUrl: long(2049) }).body.error.message).toBe(
			"Write rejected (spec §10): label: at most 80 characters (got 81); customUrl: at most 2048 characters (got 2049)",
		);
		expect(writeGateResponse("POST", "/_emdash/api/taxonomies/tag/terms/ai/translations", { locale: "zh-CN", slug: long(101) }).status).toBe(400);
	});
	it("lets through values within the limits, other routes and bodies that are not objects", () => {
		expect(writeGateResponse("POST", "/_emdash/api/content/docs", { slug: long(100), data: { title: long(5000) } })).toBeNull();
		expect(writeGateResponse("POST", "/_emdash/api/content/docs/1/publish", { slug: long(500) })).toBeNull();
		for (const body of [null, "x", 5, [{ slug: long(500) }]]) expect(writeGateResponse("POST", "/_emdash/api/content/docs", body)).toBeNull();
	});
});

describe("writeGateResponse: MCP", () => {
	it("rejects a gated tool call with a JSON-RPC error carrying the request id", () => {
		expect(writeGateResponse("POST", "/_emdash/api/mcp", call("content_create", { collection: "docs", slug: long(101), data: {} }))).toEqual({
			status: 200,
			body: { jsonrpc: "2.0", id: 7, error: { code: -32602, message: "Write rejected (spec §10): content_create slug: at most 100 characters (got 101)" } },
		});
		for (const [name, args, problem] of [
			["content_update", { id: "x", slug: long(101) }, "content_update slug: at most 100"],
			["taxonomy_create_term", { taxonomy: "tag", label: long(81) }, "taxonomy_create_term label: at most 80"],
			["taxonomy_update_term", { taxonomy: "tag", termSlug: "ai", slug: long(101) }, "taxonomy_update_term slug: at most 100"],
			["byline_create", { slug: "a", displayName: long(81) }, "byline_create displayName: at most 80"],
			["byline_update", { id: "b", slug: long(101) }, "byline_update slug: at most 100"],
			["menu_set_items", { name: "primary", items: [{ label: "ok", type: "custom" }, { label: long(81), type: "custom", customUrl: long(2049) }] }, "menu_set_items items[1].label: at most 80"],
			["menu_set_items", { name: "primary", items: Array.from({ length: 51 }, () => ({ label: "a" })) }, "menu_set_items items: at most 50 menu items are allowed (got 51)"],
		]) expect(writeGateResponse("POST", "/_emdash/api/mcp", call(name, args)).body.error.message, name).toContain(problem);
	});
	it("checks every message of a batch and answers a batch with HTTP 400 and id null", () => {
		const verdict = writeGateResponse("POST", "/_emdash/api/mcp", [call("content_list", {}, 1), call("content_create", { slug: long(101) }, 2)]);
		expect(verdict.status).toBe(400);
		expect(verdict.body).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32602 } });
	});
	it("lets through other methods, other tools, values within limits and malformed messages", () => {
		for (const body of [
			call("content_create", { slug: long(100) }),
			call("content_list", { slug: long(500) }),
			call("menu_set_items", { items: "x" }),
			call("menu_set_items", { items: [null, 5, { label: 5 }] }),
			{ jsonrpc: "2.0", id: 1, method: "tools/list" },
			{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: 5, arguments: { slug: long(500) } } },
			{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "content_create", arguments: "x" } },
			null,
			"x",
			[],
		]) expect(writeGateResponse("POST", "/_emdash/api/mcp", body)).toBeNull();
	});
	it("keeps the message short when a batch has many problems", () => {
		const batch = Array.from({ length: 100 }, (_, k) => call("content_create", { slug: long(101) }, k));
		const message = writeGateResponse("POST", "/_emdash/api/mcp", batch).body.error.message;
		expect(message.split("; ")).toHaveLength(21);
		expect(message.endsWith("; …")).toBe(true);
	});
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run packages/web9-site/lib/write-gate.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写 `write-gate.mjs`**

```js
// Write-length gate (spec 2026-10-17 §3.1), run by src/middleware.ts. core's REST and MCP schemas put no maximum on
// a content slug, a menu item's label and URL, a term's label and slug or a byline's name and slug, and no hook sees
// them, while menus and terms render on many pages. EmDash's middleware is all order "pre", so src/middleware.ts runs
// after its auth and before the route, and answers in the route's place when a value is over LIMITS. Pure: the
// middleware passes the method, Astro's normalized pathname and the parsed JSON body. Anything the gate cannot read
// (a body that is not JSON, an unknown route or tool) passes through to core, which validates it.
import { LIMITS, lengthProblem } from "../../web9-blocks/lib/limits.mjs";

/** core's parseBody limit (emdash api/parse.ts MAX_BODY_SIZE): a larger body is core's 413, so the gate does not read it. */
export const MAX_GATED_BODY_BYTES = 10 * 1024 * 1024;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);
const MAX_SHOWN = 20;
const SLUG = ["slug", LIMITS.slug];
const LABEL = ["label", LIMITS.label];
const MENU_ITEM = [LABEL, ["customUrl", LIMITS.url]];
const TERM = [LABEL, SLUG];
const BYLINE = [["displayName", LIMITS.label], SLUG];
/** MCP tools whose arguments carry gated values (emdash mcp/server.ts); menu_set_items is a list, handled on its own. */
const TOOLS = {
	content_create: [SLUG],
	content_update: [SLUG],
	taxonomy_create_term: TERM,
	taxonomy_update_term: TERM,
	byline_create: BYLINE,
	byline_update: BYLINE,
};

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Segments after /_emdash/api/ of Astro's normalized pathname (already decoded: never decode again), or null. */
function apiSegments(pathname) {
	const segments = String(pathname).split("/").filter(Boolean);
	return segments[0] === "_emdash" && segments[1] === "api" ? segments.slice(2) : null;
}

/** The [field, max] checks of a REST route's body (emdash astro/routes/api), or null when the route is not gated. */
function restChecks([area, ...rest]) {
	if (area === "content" && (rest.length === 1 || rest.length === 2)) return [SLUG];
	if (area === "menus" && rest[1] === "items" && (rest.length === 2 || rest.length === 3)) return MENU_ITEM;
	if (area === "taxonomies" && rest[1] === "terms" && (rest.length === 2 || rest.length === 3 || (rest.length === 4 && rest[3] === "translations"))) return TERM;
	return null;
}

const isMcp = (segments) => segments.length === 1 && segments[0] === "mcp";

/** Problems of `record` against [field, max] checks, each prefixed with `at`. */
function fieldProblems(record, checks, at) {
	return checks.map(([field, max]) => lengthProblem(`${at}${field}`, record[field], max)).filter(Boolean);
}

function toolProblems(name, args) {
	if (!isRecord(args)) return [];
	if (name === "menu_set_items") {
		if (!Array.isArray(args.items)) return [];
		if (args.items.length > LIMITS.menuItems) return [`items: at most ${LIMITS.menuItems} menu items are allowed (got ${args.items.length})`];
		return args.items.flatMap((item, k) => (isRecord(item) ? fieldProblems(item, MENU_ITEM, `items[${k}].`) : []));
	}
	return Object.hasOwn(TOOLS, name) ? fieldProblems(args, TOOLS[name], "") : [];
}

/** Problems of one JSON-RPC message: only a tools/call of a gated tool has any. */
function messageProblems(message) {
	if (!isRecord(message) || message.method !== "tools/call" || !isRecord(message.params)) return [];
	const { name, arguments: args } = message.params;
	return typeof name === "string" ? toolProblems(name, args).map((p) => `${name} ${p}`) : [];
}

const rejected = (problems) =>
	`Write rejected (spec §10): ${problems.slice(0, MAX_SHOWN).join("; ")}${problems.length > MAX_SHOWN ? "; …" : ""}`;

/** True when the gate reads the body of a request with this method and (normalized) path. */
export function gatedRequest(method, pathname) {
	if (!WRITE_METHODS.has(method)) return false;
	const segments = apiSegments(pathname);
	return segments !== null && (isMcp(segments) || restChecks(segments) !== null);
}

/**
 * The gate's answer to a request whose body parsed as `body`: null lets it through; otherwise `{ status, body }` to
 * send as JSON in the route's place. REST: 400 in core's error shape. MCP: a JSON-RPC error (-32602, invalid params),
 * with HTTP 200 and the request's id for one message, HTTP 400 and id null for a batch.
 */
export function writeGateResponse(method, pathname, body) {
	if (!gatedRequest(method, pathname)) return null;
	const segments = apiSegments(pathname);
	if (isMcp(segments)) {
		const batch = Array.isArray(body);
		const problems = (batch ? body : [body]).flatMap(messageProblems);
		if (!problems.length) return null;
		const id = !batch && (typeof body.id === "string" || typeof body.id === "number") ? body.id : null;
		return { status: batch ? 400 : 200, body: { jsonrpc: "2.0", id, error: { code: -32602, message: rejected(problems) } } };
	}
	if (!isRecord(body)) return null;
	const problems = fieldProblems(body, restChecks(segments), "");
	if (!problems.length) return null;
	return { status: 400, body: { success: false, error: { code: "VALIDATION_ERROR", message: rejected(problems) } } };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run packages/web9-site/lib/write-gate.test.mjs`
Expected: PASS

- [ ] **Step 5: 写 `src/middleware.ts`**

```ts
import { defineMiddleware } from "astro:middleware";
import { MAX_GATED_BODY_BYTES, gatedRequest, writeGateResponse } from "../packages/web9-site/lib/write-gate.mjs";

// Write-length gate (spec 2026-10-17 §3.1). EmDash's middleware is all order "pre", so this runs after its auth and
// before the route. context.url is Astro's normalized URL (decoded, duplicate slashes collapsed): the one routes match.
export const onRequest = defineMiddleware(async ({ request, url }, next) => {
	if (!gatedRequest(request.method, url.pathname)) return next();
	if (Number(request.headers.get("content-length")) > MAX_GATED_BODY_BYTES) return next();
	let body: unknown;
	try {
		body = JSON.parse(await request.clone().text());
	} catch {
		return next();
	}
	const verdict = writeGateResponse(request.method, url.pathname, body);
	if (!verdict) return next();
	return new Response(JSON.stringify(verdict.body), {
		status: verdict.status,
		headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
	});
});
```

- [ ] **Step 6: 写 `packages/web9-site/write-gate.core.test.mjs`（core 快照）**

```js
// The write gate (lib/write-gate.mjs) knows core's write paths as of emdash 1.3. These snapshots fail when an emdash
// upgrade adds an MCP tool or a REST route in a gated area: re-check the gate against it, then update the snapshot
// (spec 2026-10-17 §3.1). emdash ships its src/, so the files are read from node_modules; a missing file fails the test.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = (p) => new URL(`../../node_modules/emdash/src/${p}`, import.meta.url);

describe("core write paths the gate was checked against", () => {
	it("MCP tools", () => {
		const names = [...readFileSync(core("mcp/server.ts"), "utf8").matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
		expect(names).toEqual([
			"content_list", "content_get", "content_create", "content_update", "content_delete", "content_restore", "content_permanent_delete",
			"content_publish", "content_unpublish", "content_schedule", "content_unschedule", "content_compare", "content_discard_draft",
			"content_list_trashed", "content_duplicate", "content_translations", "byline_list", "byline_get", "byline_create", "byline_update",
			"byline_delete", "byline_translations", "schema_list_collections", "schema_get_collection", "schema_list_block_types",
			"schema_get_block_type", "schema_create_block_type", "schema_update_block_type", "schema_activate_block_type_version",
			"schema_create_collection", "schema_delete_collection", "schema_update_collection", "schema_create_field", "schema_delete_field",
			"schema_update_field", "media_list", "media_create", "media_upload", "media_get", "media_update", "media_delete",
			"media_usage_repair", "search", "taxonomy_list", "taxonomy_get", "taxonomy_create", "taxonomy_update", "taxonomy_delete",
			"taxonomy_list_terms", "taxonomy_create_term", "taxonomy_update_term", "taxonomy_delete_term", "taxonomy_term_translations",
			"menu_list", "menu_get", "menu_translations", "menu_create", "menu_update", "menu_delete", "menu_set_items", "revision_list",
			"revision_restore", "settings_get", "settings_update", "site_transfer_capabilities", "site_export_start", "site_export_status",
			"site_import_analyze", "site_import_start", "site_import_status", "site_import_resume", "site_import_receipt",
		]);
	});
	it("REST routes under content, menus and taxonomies", () => {
		const routes = (area) => readdirSync(core(`astro/routes/api/${area}`), { recursive: true }).filter((f) => f.endsWith(".ts")).sort();
		expect(routes("content")).toEqual([
			"[collection]/[id].ts", "[collection]/[id]/compare.ts", "[collection]/[id]/discard-draft.ts", "[collection]/[id]/duplicate.ts",
			"[collection]/[id]/lock.ts", "[collection]/[id]/permanent.ts", "[collection]/[id]/plugin-extensions/[pluginId]/[kind]/[extensionId].ts",
			"[collection]/[id]/preview-url.ts", "[collection]/[id]/publish.ts", "[collection]/[id]/references/[relation]/children.ts",
			"[collection]/[id]/references/[relation]/parents.ts", "[collection]/[id]/restore.ts", "[collection]/[id]/revisions.ts",
			"[collection]/[id]/schedule.ts", "[collection]/[id]/terms/[taxonomy].ts", "[collection]/[id]/translations.ts",
			"[collection]/[id]/unpublish.ts", "[collection]/authors.ts", "[collection]/index.ts", "[collection]/trash.ts",
		]);
		expect(routes("menus")).toEqual(["[name].ts", "[name]/items.ts", "[name]/items/[id].ts", "[name]/reorder.ts", "[name]/translations.ts", "index.ts"]);
		expect(routes("taxonomies")).toEqual([
			"[name].ts", "[name]/reorder.ts", "[name]/terms/[slug].ts", "[name]/terms/[slug]/translations.ts", "[name]/terms/index.ts",
			"[name]/translations.ts", "bulk-tag.ts", "index.ts",
		]);
	});
});
```

这几个列表是 2026-10-17 在 emdash 1.3 上生成的。先运行一次；不一致的话，按实际输出改快照，并在报告里说明差异。

- [ ] **Step 7: 改 `Base.astro`（菜单截断）**

import 区，紧挨着 `nav.mjs` 那行加：

```astro
import { LIMITS, clampText } from "../../packages/web9-blocks/lib/limits.mjs";
```

`menuItems` 那行换成：

```astro
// One en menu; on zh-CN pages links that have a zh-CN route get the prefix (spec §5). The menu is on every page and
// has no hook, so the render keeps it bounded too: at most LIMITS.menuItems items, labels cut to LIMITS.label.
const menuItems = (menuResult.data?.items ?? [])
	.slice(0, LIMITS.menuItems)
	.map((item) => ({ ...item, label: clampText(item.label, LIMITS.label), href: localizeHref(item.url, locale) }));
```

在 `render-sinks.test.mjs` 末尾加：

```js
describe("menu", () => {
	it("is bounded on render: at most LIMITS.menuItems items, labels cut to LIMITS.label (spec 2026-10-17 §3.1)", () => {
		const base = raw("src/layouts/Base.astro");
		expect(base).toMatch(/^import \{ LIMITS, clampText \} from "\.\.\/\.\.\/packages\/web9-blocks\/lib\/limits\.mjs";$/m);
		expect(base).toContain(".slice(0, LIMITS.menuItems)");
		expect(base).toContain("label: clampText(item.label, LIMITS.label)");
	});
});
```

- [ ] **Step 8: 运行全部测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: typecheck 和 build（先停 dev）**

```bash
npx astro dev stop
npm run typecheck
npm run build
```

Expected: 都通过（`build` 后面的 `check-public-css` 也通过）。然后 `npm run dev -- --port 4321`，等 `/` 返回 200。

- [ ] **Step 10: 在 dev 上探针**

token：`TOKEN=$(cat .local/dev-token)`（不要打印它）。`L101` 是 101 个字符，`L81` 是 81 个字符。

1. REST 超长 slug：
   ```bash
   curl -s -X POST localhost:4321/_emdash/api/content/posts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"slug\":\"$L101\",\"data\":{\"title\":\"Probe\"}}"
   ```
   Expected：400，消息含 `slug: at most 100`。同样的请求换成 `Content-Type: text/plain` 也是 400（闸门不看 Content-Type）。
2. REST 路径变体：`POST localhost:4321/_emdash/api/%63ontent/posts`（编码过的路径）和 `POST 'localhost:4321/_emdash//api/content/posts/'`，body 同上。Expected：都是 400，或者 core 根本不路由（404）；不能是 2xx。记下结果。
3. REST 菜单项：`POST /_emdash/api/menus/primary/items`，body `{"type":"custom","label":"$L81","customUrl":"/x"}`。Expected：400。
4. REST term：`POST /_emdash/api/taxonomies/tag/terms`，body `{"label":"$L81"}`。Expected：400。
5. MCP 超长：`node scripts/mcp.mjs content_create '{"collection":"posts","slug":"<L101>","data":{"title":"Probe"}}'`、`taxonomy_create_term {"taxonomy":"tag","label":"<L81>"}`、`byline_create {"slug":"probe","displayName":"<L81>"}`、`menu_set_items {"name":"primary","items":[...51 项...]}`。Expected：每个都报错，消息含 `Write rejected (spec §10)`。**`menu_set_items` 只用超过上限的请求**：通过闸门的请求会真的覆盖菜单。
6. MCP batch：用 curl POST 到 `/_emdash/api/mcp`，body 是两条消息的数组（一条 `content_list`，一条超长的 `content_create`），header 带 `Accept: application/json, text/event-stream`。Expected：HTTP 400，`id: null`。
7. 未登录：步骤 1 去掉 Authorization。Expected：401 或 403（core 的鉴权先拒绝），不是闸门的 400。
8. 正常请求不受影响：`node scripts/migrate.mjs all --dry-run` 每一步都是 unchanged；`node scripts/migrate.mjs verify` 为 54/54 页面、86/86 redirect。
9. 确认什么都没写进去：`content_list {"collection":"posts"}` 还是 2 篇；`taxonomy_list_terms {"taxonomy":"tag"}` 没有新 term；`byline_list` 为空；`menu_get {"name":"primary"}` 还是原来的 4 项。如果有任何探针写进去了，用 MCP 删掉，并在报告里写明。

- [ ] **Step 11: Commit**

```bash
git add packages/web9-site/lib/write-gate.mjs packages/web9-site/lib/write-gate.test.mjs packages/web9-site/write-gate.core.test.mjs src/middleware.ts src/layouts/Base.astro packages/web9-site/render-sinks.test.mjs
git commit -m "feat(gate): write-length gate for slugs, menu items, terms and bylines; bounded menu render

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 6: 全库扫描和 schema 漂移检查

**Files:**
- Create: `scripts/lib/schema-drift.mjs`, `scripts/lib/schema-drift.test.mjs`
- Create: `scripts/lib/guard-scan.mjs`, `scripts/lib/guard-scan.test.mjs`
- Create: `scripts/guard-scan.mjs`
- Modify: `scripts/migrate.mjs`（`verify` 步骤）

**Interfaces:**
- Consumes:
  - Task 1 的 `BLOCK_IMAGE_FIELDS`、`IMAGE_FIELDS`、`PT_FIELDS`、`staticFields`、`mergeLiveFields`、`entryProblems`；
  - Task 1 的 `LIMITS`、`lengthProblem`；
  - `scripts/lib/mcp.mjs` 的 `callTool(name, args)`。
- Produces:
  - `schemaDrift(collection): string[]`；
  - `scanFields(schema)`；
  - `entryFindings(collection, item, revisions, total, fields)`；
  - `menuFindings(menu)`；
  - `termFindings(taxonomy, term)`；
  - `bylineFindings(byline)`。

线上 MCP 返回的形状（2026-10-17 实测）：
- `schema_list_collections` → `{ items: [{ slug, supports, … }] }`；
- `schema_get_collection` → `{ slug, supports, fields: [{ slug, type, validation, blockTypes? }] }`。`blocks` 字段的 `blockTypes` 是 `[{ slug, currentVersion, versions: [{ version, fields: [{ slug, type, validation: { subFields? } }] }] }]`。
- `content_list` → `{ items: [{ id, slug, status, locale, data }], nextCursor }`，不传 `status` 时返回所有未进回收站的条目，不传 `locale` 时返回所有 locale（docs 共 35 篇）；
- `content_list_trashed` → `{ items, nextCursor? }`；
- `revision_list` → `{ items: [{ id, data }], total }`，`limit` 最多 50，没有 cursor；
- `menu_list` → 菜单数组 `[{ name, locale }]`；
- `menu_get {name, locale}` → `{ items: [{ label, customUrl }] }`；
- `taxonomy_list` → `{ taxonomies: [{ name, locale }] }`；
- `taxonomy_list_terms {taxonomy, limit, cursor}` → `{ items: [{ slug, label }], nextCursor }`；
- `byline_list {limit, cursor}` → `{ items, nextCursor? }`。

- [ ] **Step 1: 写 `schema-drift.test.mjs`（失败）**

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { schemaDrift } from "./schema-drift.mjs";

const seed = JSON.parse(readFileSync(new URL("../../seed/seed.json", import.meta.url), "utf8"));
const types = new Map(seed.blockTypes.map((t) => [t.slug, t]));
/** A seed collection in the shape MCP schema_get_collection returns (blocks fields carry their blockTypes). */
const live = (c) => ({ ...c, fields: c.fields.map((f) => (f.type === "blocks" ? { ...f, blockTypes: f.validation.allowedTypes.map((t) => types.get(t)) } : f)) });

describe("schemaDrift", () => {
	it("finds none in the seed's collections", () => {
		for (const c of seed.collections) expect(schemaDrift(live(c)), c.slug).toEqual([]);
	});
	it("reports a portableText or image field the pinned tables lack", () => {
		const docs = live(seed.collections.find((c) => c.slug === "docs"));
		docs.fields.push({ slug: "summary", type: "portableText" }, { slug: "cover", type: "image" });
		expect(schemaDrift(docs)).toEqual([
			'schema drift: docs.summary is a portableText field missing from PT_FIELDS',
			'schema drift: docs.cover is an image field missing from IMAGE_FIELDS',
		]);
		expect(schemaDrift({ slug: "products", fields: [{ slug: "body", type: "portableText" }] })).toEqual([
			'schema drift: products.body is a portableText field missing from PT_FIELDS',
		]);
	});
	it("reports an image path in any version of a block type that BLOCK_IMAGE_FIELDS lacks", () => {
		const pages = live(seed.collections.find((c) => c.slug === "pages"));
		const layout = pages.fields.find((f) => f.slug === "layout");
		const hero = layout.blockTypes.find((t) => t.slug === "hero");
		layout.blockTypes = [
			...layout.blockTypes.filter((t) => t !== hero),
			{ ...hero, versions: [...hero.versions, { version: 2, fields: [{ slug: "background", type: "image" }, { slug: "logos", type: "repeater", validation: { subFields: [{ slug: "img", type: "image" }] } }] }] },
		];
		expect(schemaDrift(pages)).toEqual([
			'schema drift: pages.layout hero v2 has image path "background" missing from BLOCK_IMAGE_FIELDS',
			'schema drift: pages.layout hero v2 has image path "logos[].img" missing from BLOCK_IMAGE_FIELDS',
		]);
	});
	it("never throws on an odd shape", () => {
		for (const c of [{}, { slug: "x" }, { slug: "x", fields: "y" }, { slug: "x", fields: [null, { type: "blocks", slug: "b", blockTypes: [null, { slug: "t", versions: "v" }] }] }]) {
			expect(() => schemaDrift(c)).not.toThrow();
		}
	});
});
```

先读 `seed/seed.json`，确认块类型的版本里字段放在 `versions[].fields`（`index.test.mjs` 的 "pins BLOCK_IMAGE_FIELDS" 测试就是这么读的）。

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run scripts/lib/schema-drift.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写 `schema-drift.mjs`**

```js
// Schema drift (spec 2026-10-17 §3.3): fields of a live collection that the pinned tables in
// packages/web9-blocks/lib/entry-guard.mjs do not cover. The save and publish check adds live portableText and image
// fields by itself (schema:read), but image values inside a `blocks` field's block types are only guarded through
// BLOCK_IMAGE_FIELDS, so `migrate verify` reports each one missing, in every version (stored blocks keep their version).
import { BLOCK_IMAGE_FIELDS, IMAGE_FIELDS, PT_FIELDS } from "../../packages/web9-blocks/lib/entry-guard.mjs";

const own = (table, key) => (table && Object.hasOwn(table, key) ? table[key] : undefined);
const list = (v) => (Array.isArray(v) ? v : []);

/** Image paths among a block type version's fields: "image", and "features[].image" for an image in a repeater. */
function imagePaths(fields) {
	return list(fields).flatMap((f) => {
		if (f?.type === "image") return [f.slug];
		if (f?.type === "repeater") return list(f.validation?.subFields).filter((s) => s?.type === "image").map((s) => `${f.slug}[].${s.slug}`);
		return [];
	});
}

/** @param collection MCP schema_get_collection output. @returns `schema drift: …` messages, empty when the tables cover it. */
export function schemaDrift(collection) {
	const c = collection?.slug;
	const out = [];
	for (const field of list(collection?.fields)) {
		if (typeof field?.slug !== "string") continue;
		if (field.type === "portableText" && !own(PT_FIELDS, c)?.includes(field.slug)) out.push(`schema drift: ${c}.${field.slug} is a portableText field missing from PT_FIELDS`);
		if (field.type === "image" && !own(IMAGE_FIELDS, c)?.includes(field.slug)) out.push(`schema drift: ${c}.${field.slug} is an image field missing from IMAGE_FIELDS`);
		if (field.type !== "blocks") continue;
		for (const type of list(field.blockTypes)) {
			for (const version of list(type?.versions)) {
				const pinned = own(own(own(BLOCK_IMAGE_FIELDS, c), field.slug), type.slug) ?? [];
				for (const path of imagePaths(version?.fields)) {
					if (!pinned.includes(path)) out.push(`schema drift: ${c}.${field.slug} ${type.slug} v${version.version} has image path "${path}" missing from BLOCK_IMAGE_FIELDS`);
				}
			}
		}
	}
	return out;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx vitest run scripts/lib/schema-drift.test.mjs`
Expected: PASS

- [ ] **Step 5: 写 `guard-scan.test.mjs`（失败）**

```js
import { describe, expect, it } from "vitest";
import { bylineFindings, entryFindings, menuFindings, scanFields, termFindings } from "./guard-scan.mjs";

const long = (n) => "x".repeat(n);

describe("scanFields", () => {
	it("is the pinned fields plus the live schema's", () => {
		expect(scanFields({ slug: "docs", fields: [{ slug: "summary", type: "portableText" }] })).toEqual({ pt: ["body", "summary"], image: [], blocks: [] });
	});
});

describe("entryFindings", () => {
	const fields = scanFields({ slug: "docs", fields: [] });
	it("checks the item and each revision, with the revision's staged _slug", () => {
		const item = { id: "D1", slug: long(101), data: { title: "ok", body: [] } };
		const revisions = [
			{ id: "R1", data: { body: [{ _type: "htmlBlock", _key: "h" }] } },
			{ id: "R2", data: { _slug: long(101), title: long(201) } },
			{ id: "R3", data: { title: "fine" } },
		];
		expect(entryFindings("docs", item, revisions, 3, fields)).toEqual([
			"docs/D1: slug: at most 100 characters (got 101)",
			"docs/D1@R1: body: #0 htmlBlock: raw HTML blocks are not allowed; use Markdown or a Web9 block",
			"docs/D1@R2: title: at most 200 characters (got 201)",
			"docs/D1@R2: slug: at most 100 characters (got 101)",
		]);
	});
	it("reports revisions it could not see", () => {
		expect(entryFindings("docs", { id: "D1", slug: "a", data: {} }, [], 51, fields)).toEqual(["docs/D1: only the newest 0 of 51 revisions were scanned"]);
	});
});

describe("menu, term and byline findings", () => {
	it("checks menu size, labels and URLs", () => {
		expect(menuFindings({ name: "primary", locale: "en", items: [{ label: "ok", customUrl: "/a" }, { label: long(81), customUrl: long(2049) }] })).toEqual([
			"menu primary (en) items[1]: label: at most 80 characters (got 81)",
			"menu primary (en) items[1]: customUrl: at most 2048 characters (got 2049)",
		]);
		expect(menuFindings({ name: "m", items: Array.from({ length: 51 }, () => ({ label: "a" })) })).toEqual(["menu m: at most 50 items are allowed (got 51)"]);
		expect(menuFindings({ name: "m" })).toEqual([]);
	});
	it("checks term and byline lengths", () => {
		expect(termFindings("tag", { slug: long(101), label: long(81), locale: "en" })).toEqual([
			`term tag/${long(101).slice(0, 40)}… (en): label: at most 80 characters (got 81)`,
			`term tag/${long(101).slice(0, 40)}… (en): slug: at most 100 characters (got 101)`,
		]);
		expect(bylineFindings({ id: "B1", slug: "a", displayName: long(81) })).toEqual(["byline B1: displayName: at most 80 characters (got 81)"]);
		expect(termFindings("tag", { slug: "ai", label: "AI" })).toEqual([]);
	});
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `npx vitest run scripts/lib/guard-scan.test.mjs`
Expected: FAIL

- [ ] **Step 7: 写 `scripts/lib/guard-scan.mjs`**

```js
// What scripts/guard-scan.mjs reports for each stored record (spec 2026-10-17 §3.2): the save check (entryProblems) on
// every entry and revision, and the write gate's length limits on menus, terms and bylines, which have no hook.
import { entryProblems, mergeLiveFields, staticFields } from "../../packages/web9-blocks/lib/entry-guard.mjs";
import { LIMITS, lengthProblem } from "../../packages/web9-blocks/lib/limits.mjs";

const SHOWN = 40;
const short = (s) => (typeof s === "string" && s.length > SHOWN ? `${s.slice(0, SHOWN)}…` : String(s));
const at = (label, problems) => problems.filter(Boolean).map((p) => `${label}: ${p}`);

/** The fields to check in a collection: the pinned ones plus its live schema's (MCP schema_get_collection output). */
export function scanFields(schema) {
	return mergeLiveFields(staticFields(schema?.slug), schema?.fields);
}

/** An entry (content_list item) and its revisions (revision_list items; `total` from the same answer). */
export function entryFindings(collection, item, revisions, total, fields) {
	const label = `${collection}/${item.id}`;
	const out = at(label, entryProblems(item.data, fields, { slug: item.slug }));
	for (const rev of revisions) out.push(...at(`${label}@${rev.id}`, entryProblems(rev.data, fields, { slug: rev.data?._slug })));
	if (total > revisions.length) out.push(`${label}: only the newest ${revisions.length} of ${total} revisions were scanned`);
	return out;
}

/** A menu (menu_get answer). */
export function menuFindings(menu) {
	const label = `menu ${menu.name}${menu.locale ? ` (${menu.locale})` : ""}`;
	const items = Array.isArray(menu.items) ? menu.items : [];
	if (items.length > LIMITS.menuItems) return [`${label}: at most ${LIMITS.menuItems} items are allowed (got ${items.length})`];
	return items.flatMap((item, k) => at(`${label} items[${k}]`, [lengthProblem("label", item?.label, LIMITS.label), lengthProblem("customUrl", item?.customUrl, LIMITS.url)]));
}

/** A term (taxonomy_list_terms item). */
export function termFindings(taxonomy, term) {
	const label = `term ${taxonomy}/${short(term.slug)}${term.locale ? ` (${term.locale})` : ""}`;
	return at(label, [lengthProblem("label", term.label, LIMITS.label), lengthProblem("slug", term.slug, LIMITS.slug)]);
}

/** A byline (byline_list item). */
export function bylineFindings(byline) {
	return at(`byline ${byline.id}`, [lengthProblem("displayName", byline.displayName, LIMITS.label), lengthProblem("slug", byline.slug, LIMITS.slug)]);
}
```

- [ ] **Step 8: 运行，确认通过**

Run: `npx vitest run scripts/lib/guard-scan.test.mjs`
Expected: PASS

- [ ] **Step 9: 写 `scripts/guard-scan.mjs`**

```js
#!/usr/bin/env node
// Scans every stored record against today's rules (spec 2026-10-17 §3.2): each entry of each collection, trashed ones
// included, and its revisions through the save check, plus menus, terms and bylines through the length limits.
// Publish re-runs the check, but trash restore does not, and rules get stricter over time: run this after tightening
// a rule and before deploying. Prints one line per problem and a summary; exits 1 when there is any problem.
//
//   node scripts/guard-scan.mjs
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: .local/dev-token; needs an admin token).
import { bylineFindings, entryFindings, menuFindings, scanFields, termFindings } from "./lib/guard-scan.mjs";
import { callTool } from "./lib/mcp.mjs";

/** Every item of a cursor-paged MCP list tool. */
async function* pages(tool, args) {
	let cursor;
	do {
		const page = await callTool(tool, { ...args, limit: 100, ...(cursor ? { cursor } : {}) });
		yield* page.items ?? [];
		cursor = page.nextCursor;
	} while (cursor);
}

const findings = [];
const counts = { entries: 0, revisions: 0, menus: 0, terms: 0, bylines: 0 };

for (const { slug } of (await callTool("schema_list_collections", {})).items) {
	const schema = await callTool("schema_get_collection", { slug });
	const fields = scanFields(schema);
	const revisions = schema.supports?.includes("revisions");
	for (const tool of ["content_list", "content_list_trashed"]) {
		for await (const item of pages(tool, { collection: slug })) {
			const revs = revisions ? await callTool("revision_list", { collection: slug, id: item.id, limit: 50 }) : { items: [], total: 0 };
			counts.entries++;
			counts.revisions += revs.items.length;
			findings.push(...entryFindings(slug, item, revs.items, revs.total, fields));
		}
	}
}
for (const menu of await callTool("menu_list", {})) {
	counts.menus++;
	findings.push(...menuFindings(await callTool("menu_get", { name: menu.name, locale: menu.locale })));
}
for (const name of new Set((await callTool("taxonomy_list", {})).taxonomies.map((t) => t.name))) {
	for await (const term of pages("taxonomy_list_terms", { taxonomy: name })) {
		counts.terms++;
		findings.push(...termFindings(name, term));
	}
}
for await (const byline of pages("byline_list", {})) {
	counts.bylines++;
	findings.push(...bylineFindings(byline));
}

for (const f of findings) console.log(f);
console.log(
	`guard-scan: ${counts.entries} entries, ${counts.revisions} revisions, ${counts.menus} menus, ${counts.terms} terms, ${counts.bylines} bylines; ${findings.length} problems`,
);
if (findings.length) process.exitCode = 1;
```

运行前先核对 `content_list_trashed`、`byline_list`、`taxonomy_list_terms` 的 `limit`、`cursor` 参数名（`node_modules/emdash/src/mcp/server.ts`）。

- [ ] **Step 10: `migrate.mjs` 的 `verify` 加 schema 漂移**

import 区加 `import { schemaDrift } from "./lib/schema-drift.mjs";`。在 `verify()` 的 `for (const f of failures) console.error(…)` 之前加：

```js
		const drift = [];
		for (const { slug } of (await callTool("schema_list_collections", {})).items) drift.push(...schemaDrift(await callTool("schema_get_collection", { slug })));
		for (const d of drift) console.error(`verify: ${d}`);
```

在两行 `console.log(\`verify: …\`)` 之后加 `console.log(\`verify: ${drift.length ? \`${drift.length} schema drift\` : "no schema drift"}\`);`，并把 `if (failures.length) process.exitCode = 1;` 改成 `if (failures.length || drift.length) process.exitCode = 1;`。文件头注释里描述 verify 的那一句加上 "and reports schema drift (scripts/lib/schema-drift.mjs)"。

- [ ] **Step 11: 运行全部测试，再在 dev 上跑**

```bash
npm test
node scripts/guard-scan.mjs
node scripts/migrate.mjs verify
```

Expected：
- `npm test` PASS；
- `guard-scan` 输出 `guard-scan: 39 entries, … revisions, 1 menus, … terms, 0 bylines; 0 problems`，退出码 0（条目数以实际为准；问题必须为 0）；
- `verify` 为 54/54 页面、86/86 redirect、`no schema drift`，退出码 0。

再做一个负向探针：给 `node scripts/guard-scan.mjs` 设 `EMDASH_URL=http://localhost:1`，确认它报错退出（退出码非 0），不会输出 "0 problems"。

- [ ] **Step 12: Commit**

```bash
git add scripts/lib/schema-drift.mjs scripts/lib/schema-drift.test.mjs scripts/lib/guard-scan.mjs scripts/lib/guard-scan.test.mjs scripts/guard-scan.mjs scripts/migrate.mjs
git commit -m "feat(scripts): guard-scan over all stored records; schema drift in migrate verify

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 7: sections 和媒体的钉子；文档

**Files:**
- Modify: `packages/web9-site/render-sinks.test.mjs`
- Modify: `docs/superpowers/specs/2026-10-15-emdash-migration-design.md`（§8 AI 段、§10 风险表里 guard 那一格、§12「AI PAT 之前」）
- Modify: `docs/superpowers/plans/2026-10-15-emdash-plan2-migration-local.md`（路线图第 6 步，约 6377 行；未决事项里三条「AI PAT 之前修」，约 6406-6408 行）
- Modify: `CLAUDE.md`、`.agents/skills/web9-blocks/SKILL.md`

- [ ] **Step 1: 钉子测试（`render-sinks.test.mjs` 末尾）**

```js
describe("AI token preconditions (spec 2026-10-17 §3.4)", () => {
	const sourceFiles = (dir) =>
		readdirSync(new URL(`../../${dir}`, import.meta.url), { recursive: true })
			.filter((f) => /\.(astro|mjs|ts|tsx|js)$/.test(f) && !/\.test\.mjs$/.test(f) && !f.includes("node_modules"))
			.map((f) => `${dir}/${f}`);
	it("no page renders sections: they are writable with content:write and have no guard", () => {
		const files = [...sourceFiles("src"), ...sourceFiles("packages")];
		expect(files).toContain("src/layouts/Base.astro");
		for (const file of files) expect(raw(file), file).not.toMatch(/\bgetSections?\b/);
	});
	it("media stay behind /_emdash/api/media/file (sandbox CSP, nosniff): no public R2 URL", () => {
		for (const file of ["astro.config.mjs", "wrangler.jsonc"]) expect(raw(file), file).not.toMatch(/publicUrl/);
	});
});
```

Run: `npx vitest run packages/web9-site/render-sinks.test.mjs`
Expected: PASS。这两条锁定的是今天已经成立的事实。写完后临时在 `src/pages/search.astro` 里加一行 `// getSections` 跑一次，确认测试会失败，然后删掉那一行。

- [ ] **Step 2: 上级 spec §8「AI 管理内容」**

把以"**已定（owner 选择 AI 可以直接发布）**"开头的那一条，和"**前置条件：创建 AI 账号**"那一条（连同它的 4 个步骤和"简化方案"一段），整体换成：

```markdown
- **已定（owner 选择 AI 可以直接发布；token 方式 2026-10-17 改定）**：
  - 为 AI 单独建一个用户，角色用 **Editor**：Author 只能发布和修改自己的内容，而迁移进来的内容属于管理员账号。
  - token 走 **OAuth device flow**，不用 PAT。PAT 只能由 Admin 给自己生成（`POST /_emdash/api/admin/api-tokens`），生成出来就是 Admin 权限。device flow 发的 token 是"请求的 scope ∩ Editor 允许的 scope"。
  - scope 只要 `content:read content:write media:read media:write`。`content:write` 隐含 `menus:manage`、`taxonomies:manage`；不给 `schema:read`，也拿不到 `schema:write`、`settings:manage`、`admin`、`transfer:*`。schema 变更由开发者用 admin token 做。出错时用 `revision_list` 加 `content_update` 回滚（见 skill）。
- **runbook：发放 AI token（owner 操作，在 AI PAT 之前的 7 项都完成之后，见 `docs/superpowers/specs/2026-10-17-ai-pat-preconditions-design.md`）**
  1. 管理员在后台点 **Invite User**，填一个邮箱（如 `ai-agent@web9.ai`），角色选 Editor。没有配置邮件服务时，后台会生成邀请链接，打开它用 passkey 注册。
  2. 在 AI 的运行环境里调 `POST /_emdash/api/oauth/device/code`，body 为 `{"scope":"content:read content:write media:read media:write"}`。一定要显式传 scope：不传的话默认还会给 `schema:read`。
  3. 以 AI 用户登录后台，打开 `/_emdash/admin/device`，输入 user code 并批准。运行环境轮询 `/_emdash/api/oauth/device/token`，拿到 access token（1 小时过期）和 refresh token（90 天）。
  4. 核对：
     - 用这个 token 调 MCP `content_list` 应该成功；
     - `schema_list_collections`、`settings_update`、`site_export_start`，以及 REST `GET /_emdash/api/admin/api-tokens`、`GET /_emdash/api/redirects` 都应该被拒。
  5. refresh token 只放在 AI 运行环境的 secret 里。停用时调 `/_emdash/api/oauth/token/revoke`，或者在后台禁用这个用户。
  6. 永远不给 AI `transfer:*`、`admin` 或 import 权限；AI 发起的 transfer 请求一律不批准。R2 bucket 不开公开访问（不加 r2.dev 域名，也不绑自定义域名）。
```

同一节里"写入时 guard"那一条，在句末加上：

```markdown
保存、发布和定时发布都会跑这套检查（发布时被拒：`PUBLISH_REJECTED` / `SCHEDULE_REJECTED`）；长度上限、body 总量上限和写入闸门见 `docs/superpowers/specs/2026-10-17-ai-pat-preconditions-design.md`。
```

- [ ] **Step 3: 上级 spec §10 风险表**

在 "AI 直接发布的 Markdown / HTML" 那一格里，把这句：

> 表格单元格不检查，交给 core 的 `normalizePortableTextTable`：它限制单元格里的类型（只有 span）和 mark（decorator 或 link），但不限制规模，上面的上限管不到单元格；

换成：

> 表格单元格也检查（2026-10-17）：`rows` 和 `cells` 必须是对象数组，单元格里只能是 span，单个 span 的上限同上，每张表最多 500 行、2000 个单元格；mark 名字仍交给 core 的 `normalizePortableTextTable`。整个值最多 2000 个顶层节点、20000 个 span、5000 个 mark；`buttons`、`tabs`、`tool_grid` 的列表必须是对象数组（最多 10、20、100 项），文字字段必须是字符串；

- [ ] **Step 4: 上级 spec §12「AI PAT 之前」**

把第一行的 bullet 改成"**AI PAT 之前**（2026-10-17 全部完成，见 `docs/superpowers/specs/2026-10-17-ai-pat-preconditions-design.md`）：……"。原有 7 个子项各保留一句问题描述，后面加"**已做**："和做法，每条一句话：

1. 长度：guard 管 title、description、excerpt；`src/middleware.ts` 的写入闸门管 slug、菜单项、term、byline；菜单渲染只取前 50 项，label 截到 80。
2. 重跑 guard：发布、定时发布前的 hook 重跑 guard，并检查 slug，fail closed；`scripts/guard-scan.mjs` 扫描所有条目、回收站、revision、菜单、term、byline。skill 的撤销流程仍然用 `content_update`。
3. 字段表：hook 读线上 schema（`schema:read`），和钉死的表取并集；`migrate verify` 报告 schema 漂移。
4. `sections`：`render-sinks.test.mjs` 锁定不渲染。
5. import 和 transfer：AI 用 Editor 账号的 device flow token，没有 transfer、admin、import 权限（§8 runbook）。
6. 媒体：`render-sinks.test.mjs` 锁定没有 `publicUrl`。
7. 三个"AI PAT 之前修"：guard 已有 body 总量、表格单元格、块结构的上限；Tabs、ToolGrid 遇到异常结构不再抛错。

`DocsPage.astro` 那条里"（与上面长度上限同一类问题）"改成"（title 已限 200 字符，见上面第 1 项）"。

- [ ] **Step 5: 计划 2 文档**

- 路线图第 6 步：改成"**AI 账号**：owner 邀请 Editor 账号、passkey 注册，再按 spec §8 的 runbook 走 device flow 取 token（不用 PAT：Editor 拿不到 PAT）。spec §12「AI PAT 之前」的 7 项已于 2026-10-17 完成（`docs/superpowers/plans/2026-10-17-ai-pat-preconditions.md`）。"
- 未决事项里三条"**AI PAT 之前修**"：开头改成"**已修（2026-10-17）**"，每条后面加一句修法：
  - 单页 CPU：每个值最多 20000 个 span、5000 个 mark；
  - 表格单元格：guard 检查单元格；
  - 块形状：guard 拒绝错误形状，`Tabs`、`ToolGrid` 渲染时跳过错误项。

- [ ] **Step 6: `CLAUDE.md`**

Commands 里 Migration runner 那组之后加一行：

```markdown
- Guard scan (after tightening a guard rule, before deploying; exits 1 on any problem): `node scripts/guard-scan.mjs` (all entries incl. trashed, all revisions, menus, terms, bylines; admin token)
```

Rules 里加一行：

```markdown
- Length and size limits live in `packages/web9-blocks/lib/limits.mjs` and `lib/pt-guard.mjs`; slugs, menu items, terms and bylines are checked by the write gate (`src/middleware.ts` → `packages/web9-site/lib/write-gate.mjs`). An emdash upgrade that adds an MCP tool or a content/menu/taxonomy route fails `write-gate.core.test.mjs`: re-check the gate before updating the snapshot.
```

- [ ] **Step 7: `.agents/skills/web9-blocks/SKILL.md`**

- "Create and publish a doc" 下面加一条：
  ```markdown
  - Limits (the save, publish and write checks reject more): `title` 200 characters, `description` and `excerpt` 1000, `slug` 100; a menu item `label` 80 and `customUrl` 2048, at most 50 items per menu; a term `label` 80 and `slug` 100; a byline `displayName` 80 and `slug` 100.
  ```
- "Undo" 那条换成：
  ```markdown
  - Undo: `revision_list` {collection, id} returns each revision's `data`; send the earlier `body` back with `content_update` (the save check runs on it) → `content_get` for the new `_rev` → `content_publish`. Publish and schedule re-run the save check too (`PUBLISH_REJECTED` / `SCHEDULE_REJECTED` with the same problem list), but `content_restore` from the trash does not, so prefer `content_update` over `revision_restore` and `content_restore`.
  ```
- "The site rejects some blocks on save" 列表末尾（"Fix the block and send the save again" 之前）加：
  ```markdown
  - more than 2000 top-level blocks, 20000 spans or 5000 marks in one body (table cells count);
  - a table whose `rows` or `cells` are not arrays of objects, a cell whose `content` holds anything but spans, more than 500 rows or 2000 cells in a table, or more than 1000 spans in a cell;
  - `buttons.buttons`, `tabs.tabs` or `tool_grid.tools` that are not arrays of objects, or hold more than 10, 20 or 100 items; a tab `label`/`body`, tool `name`/`tagline` or button `text` that is not a string, or a tool `featured` that is not true or false.
  ```

- [ ] **Step 8: 全部测试，然后 commit**

Run: `npm test`
Expected: PASS

```bash
git add packages/web9-site/render-sinks.test.mjs docs/superpowers/specs/2026-10-15-emdash-migration-design.md docs/superpowers/plans/2026-10-15-emdash-plan2-migration-local.md CLAUDE.md .agents/skills/web9-blocks/SKILL.md
git commit -m "docs: AI token via Editor device flow; spec §12 'AI PAT 之前' done; pin sections and media

Co-Authored-By: <your model> <noreply@anthropic.com>"
```

---

### Task 8: 整体验收

**Files:** 不改代码。只有发现问题时才改，改完单独 commit，并在报告里说明。

- [ ] **Step 1: 测试、typecheck、build（dev 停着）**

```bash
npx astro dev stop
npm test
npm run typecheck
npm run build
```

Expected: 全部通过；`check-public-css` 通过。

- [ ] **Step 2: 启动 dev，跑迁移检查**

```bash
npm run dev -- --port 4321
node scripts/migrate.mjs all --dry-run
node scripts/migrate.mjs verify
node scripts/guard-scan.mjs
```

Expected：
- dry run 每一步都是 unchanged；
- verify 为 54/54 页面、86/86 redirect、`no schema drift`；
- guard-scan `0 problems`，退出码 0。

- [ ] **Step 3: 端到端探针（各一次，确认组合起来仍然有效）**

1. MCP `content_create` 超长 slug → `Write rejected`（闸门）。
2. MCP `content_create`：slug 正常、title 201 字符 → `Save rejected`（guard）。
3. MCP `content_create` posts 草稿，`body` 里放 21 个 tab 的 `tabs` 块 → `Save rejected`，消息含 `at most 20 items`。
4. REST 菜单项 label 81 字符 → 400。
5. 页面：`/`、`/docs/intro`、`/docs/guide`、`/docs/ai-tools-adhoc`、`/docs/tools-summary`、`/posts`、`/zh-CN/` 都返回 200（`curl -s -o /dev/null -w '%{http_code}'`）。
6. 收尾：posts 还是 2 篇，`menu_get primary` 还是 4 项，`guard-scan` 还是 0 problems。

- [ ] **Step 4: 报告**

报告里写清：
- 每一步的命令和结果（测试数、页面数、redirect 数、扫描到的条目数和 revision 数）；
- 所有探针的结果；
- 确认库里没有留下探针数据。
