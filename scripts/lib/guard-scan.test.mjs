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
	it("checks the item's seo.image and bylines[].roleLabel, which content_list carries beside data", () => {
		const item = {
			id: "D1",
			slug: "a",
			data: {},
			seo: { title: null, image: long(2049) },
			bylines: [{ roleLabel: "ok" }, { roleLabel: long(81) }, { roleLabel: null, source: "inferred" }],
		};
		expect(entryFindings("docs", item, [], 0, fields)).toEqual([
			"docs/D1: seo.image: at most 2048 characters (got 2049)",
			"docs/D1: bylines[1].roleLabel: at most 80 characters (got 81)",
		]);
	});
	it("reads an item without seo or bylines (a trashed one) or with odd ones as clean", () => {
		const bare = { id: "D1", slug: "a", data: {} };
		for (const extra of [{}, { seo: null, bylines: null }, { seo: { image: null }, bylines: [] }, { seo: "x", bylines: [null, "y", {}] }, { seo: { image: long(2048) }, bylines: [{ roleLabel: long(80) }] }]) {
			expect(entryFindings("docs", { ...bare, ...extra }, [], 0, fields), JSON.stringify(extra)).toEqual([]);
		}
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
	it("checks a menu item's titleAttr, target and, when an answer carries one, its resolved url", () => {
		expect(menuFindings({ name: "m", items: [{ label: "a", titleAttr: long(201), target: long(33) }, { label: "b", url: long(2049) }] })).toEqual([
			"menu m items[0]: titleAttr: at most 200 characters (got 201)",
			"menu m items[0]: target: at most 32 characters (got 33)",
			"menu m items[1]: url: at most 2048 characters (got 2049)",
		]);
		expect(menuFindings({ name: "m", items: [{ label: "a", customUrl: null, titleAttr: long(200), target: "_blank", url: long(2048) }, null, {}] })).toEqual([]);
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
