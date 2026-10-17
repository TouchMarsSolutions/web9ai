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
