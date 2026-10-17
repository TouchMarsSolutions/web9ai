import { describe, expect, it, vi } from "vitest";
import { docPayloads } from "../../../scripts/lib/docs-payloads.mjs";
import { homePayload } from "../../../scripts/lib/home-content.mjs";
import { readLegacyTree } from "../../../scripts/lib/legacy-tree.mjs";
import { postPayloads } from "../../../scripts/lib/posts.mjs";
import { BLOCK_IMAGE_FIELDS, BLOCK_TEXT_FIELDS, IMAGE_FIELDS, PT_FIELDS, SCHEMA_TIMEOUT_MS, entryProblems, fieldsFor, mergeLiveFields, staticFields } from "./entry-guard.mjs";

describe("staticFields", () => {
	it("gives the pinned fields as fresh arrays", () => {
		expect(staticFields("posts")).toEqual({ pt: ["content"], image: ["featured_image"], blocks: [], blockText: [] });
		expect(staticFields("pages")).toEqual({ pt: ["content"], image: [], blocks: [["layout", BLOCK_IMAGE_FIELDS.pages.layout]], blockText: [["layout", BLOCK_TEXT_FIELDS.pages.layout]] });
		staticFields("docs").pt.push("x");
		expect(PT_FIELDS.docs).toEqual(["body"]);
	});
	it("gives nothing for an unknown collection, a prototype name included", () => {
		for (const c of ["other", "constructor", "__proto__", "toString", undefined]) expect(staticFields(c)).toEqual({ pt: [], image: [], blocks: [], blockText: [] });
	});
	it("keeps the pinned tables as they were", () => {
		expect(IMAGE_FIELDS).toEqual({ posts: ["featured_image"] });
		// every text value Hero.astro and FeatureGrid.astro print, with its cap (spec 2026-10-17 §3.6)
		expect(BLOCK_TEXT_FIELDS).toEqual({
			pages: {
				layout: {
					hero: { title: 200, tagline: 1000, primary_label: 80, secondary_label: 80, primary_href: 2048, secondary_href: 2048, "image.alt": 1000 },
					feature_grid: { title: 200, "features[].title": 200, "features[].description": 1000, "features[].image.alt": 1000 },
				},
			},
		});
	});
});

describe("mergeLiveFields / fieldsFor", () => {
	const live = [{ slug: "title", type: "string" }, { slug: "summary", type: "portableText" }, { slug: "body", type: "portableText" }, { slug: "cover", type: "image" }, { type: "image" }, null];
	it("adds the live portableText and image fields once, keeping the pinned ones", () => {
		expect(mergeLiveFields(staticFields("docs"), live)).toEqual({ pt: ["body", "summary"], image: ["cover"], blocks: [], blockText: [] });
		expect(mergeLiveFields(staticFields("docs"), "not a list")).toEqual(staticFields("docs"));
	});
	it("reads ctx.schema, and falls back to the pinned fields without it or when it fails", async () => {
		const schema = { getCollection: async (slug) => ({ slug, fields: live }) };
		expect((await fieldsFor("docs", schema)).pt).toEqual(["body", "summary"]);
		expect(await fieldsFor("docs")).toEqual(staticFields("docs"));
		expect(await fieldsFor("docs", { getCollection: async () => null })).toEqual(staticFields("docs"));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(await fieldsFor("docs", { getCollection: async () => { throw new Error("db down"); } })).toEqual(staticFields("docs"));
			expect(await fieldsFor("docs", { getCollection: () => { throw new Error("sync"); } })).toEqual(staticFields("docs"));
			expect(warn).toHaveBeenCalledTimes(2);
		} finally {
			warn.mockRestore();
		}
	});
	// core aborts a hook after 5 s (plugins/define-plugin.ts:293, hooks.ts executeWithTimeout) with an error the hook
	// cannot catch, so a hung schema read must give up well before that.
	it("gives the pinned fields, once, when the schema read outlasts SCHEMA_TIMEOUT_MS", async () => {
		expect(SCHEMA_TIMEOUT_MS).toBe(1500);
		vi.useFakeTimers();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			let settled = false;
			const pending = fieldsFor("docs", { getCollection: () => new Promise(() => {}) }).then((f) => ((settled = true), f));
			await vi.advanceTimersByTimeAsync(SCHEMA_TIMEOUT_MS - 1);
			expect(settled).toBe(false);
			await vi.advanceTimersByTimeAsync(1);
			expect(await pending).toEqual(staticFields("docs"));
			expect(warn).toHaveBeenCalledOnce();
			expect(warn.mock.calls[0][0]).toBe(`[web9-blocks] reading the docs schema took over ${SCHEMA_TIMEOUT_MS} ms; guarding the pinned fields only`);
			// a late answer changes nothing
			let late;
			const slow = fieldsFor("docs", { getCollection: () => new Promise((resolve) => (late = resolve)) }, 10);
			await vi.advanceTimersByTimeAsync(10);
			late({ fields: live });
			expect(await slow).toEqual(staticFields("docs"));
		} finally {
			warn.mockRestore();
			vi.useRealTimers();
		}
	});
	it("clears its timer when the read answers or fails in time", async () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect((await fieldsFor("docs", { getCollection: async (slug) => ({ slug, fields: live }) })).pt).toEqual(["body", "summary"]);
			expect(vi.getTimerCount()).toBe(0);
			await fieldsFor("docs", { getCollection: async () => { throw new Error("db down"); } });
			expect(vi.getTimerCount()).toBe(0);
			await fieldsFor("docs", { getCollection: () => { throw new Error("sync"); } });
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			warn.mockRestore();
			vi.useRealTimers();
		}
	});
	it("times out for real with a short timeout", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const start = Date.now();
			expect(await fieldsFor("posts", { getCollection: () => new Promise(() => {}) }, 20)).toEqual(staticFields("posts"));
			expect(Date.now() - start).toBeLessThan(1000);
			expect(warn).toHaveBeenCalledOnce();
		} finally {
			warn.mockRestore();
		}
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
		const none = { pt: [], image: [], blocks: [], blockText: [] };
		expect(entryProblems({ title: "t".repeat(201), description: "d".repeat(1001), excerpt: "e".repeat(1001) }, none, { slug: "s".repeat(101) })).toEqual([
			"title: at most 200 characters (got 201)",
			"description: at most 1000 characters (got 1001)",
			"excerpt: at most 1000 characters (got 1001)",
			"slug: at most 100 characters (got 101)",
		]);
		expect(entryProblems({ title: "t".repeat(200), description: "d".repeat(1000) }, none, { slug: "s".repeat(100) })).toEqual([]);
	});
	it("limits category (the docs sidebar label) to 80 characters", () => {
		expect(entryProblems({ category: "c".repeat(81) }, docs)).toEqual(["category: at most 80 characters (got 81)"]);
		expect(entryProblems({ category: "c".repeat(80) }, docs)).toEqual([]);
	});
	it("checks the text of pages.layout blocks: a string within its cap when present", () => {
		const pages = staticFields("pages");
		const s = (n) => "x".repeat(n);
		const hero = { _type: "hero", _version: 1, _key: "h" };
		const grid = { _type: "feature_grid", _version: 1, _key: "g" };
		expect(
			entryProblems(
				{
					layout: [
						{ ...hero, title: s(201), tagline: s(1001), primary_label: s(81), secondary_label: s(80), primary_href: `/${s(2048)}`, secondary_href: "/a", image: { id: "", alt: s(1001) } },
						{ ...grid, title: s(200), features: [{ title: s(200), description: s(1000) }, { title: s(201), description: s(1001), image: { alt: s(1001) } }] },
					],
				},
				pages,
			),
		).toEqual([
			"layout: #0 hero title: at most 200 characters (got 201)",
			"layout: #0 hero tagline: at most 1000 characters (got 1001)",
			"layout: #0 hero primary_label: at most 80 characters (got 81)",
			"layout: #0 hero primary_href: at most 2048 characters (got 2049)",
			"layout: #0 hero image.alt: at most 1000 characters (got 1001)",
			"layout: #1 feature_grid features[1].title: at most 200 characters (got 201)",
			"layout: #1 feature_grid features[1].description: at most 1000 characters (got 1001)",
			"layout: #1 feature_grid features[1].image.alt: at most 1000 characters (got 1001)",
		]);
		const bad = JSON.parse('{"toString":1}');
		expect(entryProblems({ layout: [{ ...hero, title: bad }, { ...grid, features: [{ title: "t", description: [5] }] }] }, pages)).toEqual([
			'layout: #0 hero title: value {"toString":1} is not allowed',
			"layout: #1 feature_grid features[0].description: value [5] is not allowed",
		]);
		// absent and null pass; an unknown block type and a non-array value are left to core
		expect(entryProblems({ layout: [{ ...hero, title: "T", tagline: null }, { ...grid, features: [null, { title: "t" }] }, { _type: "other", title: bad }] }, pages)).toEqual([]);
		for (const layout of [null, "x", { title: bad }]) expect(entryProblems({ layout }, pages)).toEqual([]);
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
