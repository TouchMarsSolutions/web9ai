import { describe, expect, it } from "vitest";
import {
	bylineFindings,
	entryFindings,
	menuFindings,
	pages,
	restGet,
	revisionsOf,
	scanFields,
	summaryLine,
	termFindings,
	widgetAreaFindings,
	widgetAreasOf,
} from "./guard-scan.mjs";

const long = (n) => "x".repeat(n);

/** A stand-in for callTool that answers with `answers` in order and records each call. */
const fakeCall = (answers) => {
	const calls = [];
	const call = async (tool, args) => {
		calls.push([tool, args]);
		return answers[calls.length - 1];
	};
	return Object.assign(call, { calls });
};
const collect = async (call) => {
	const out = [];
	for await (const item of pages(call, "t", { a: 1 })) out.push(item);
	return out;
};

describe("pages", () => {
	it("follows nextCursor with a page size of 100 and yields every item", async () => {
		const call = fakeCall([{ items: [1, 2], nextCursor: "c1", total: 3 }, { items: [3], total: 3 }]);
		expect(await collect(call)).toEqual([1, 2, 3]);
		expect(call.calls).toEqual([["t", { a: 1, limit: 100 }], ["t", { a: 1, limit: 100, cursor: "c1" }]]);
	});
	it("accepts an empty list, an absent or null nextCursor and an absent total", async () => {
		expect(await collect(fakeCall([{ items: [] }]))).toEqual([]);
		expect(await collect(fakeCall([{ items: [1], nextCursor: null }]))).toEqual([1]);
	});
	it("throws on an answer without an items array", async () => {
		for (const answer of [{ rows: [] }, { items: "x" }, { items: {} }, "some text", null, undefined]) {
			await expect(collect(fakeCall([answer])), JSON.stringify(answer)).rejects.toThrow("t: expected an items array");
		}
		await expect(collect(fakeCall([{ items: [1], nextCursor: "c" }, { rows: [2] }]))).rejects.toThrow("t: expected an items array");
	});
	it("throws on a nextCursor that is not a non-empty string or that repeats", async () => {
		for (const nextCursor of [5, {}, true, ""]) {
			await expect(collect(fakeCall([{ items: [1], nextCursor }])), JSON.stringify(nextCursor)).rejects.toThrow("t: nextCursor is not a non-empty string");
		}
		await expect(collect(fakeCall([{ items: [1], nextCursor: "c" }, { items: [2], nextCursor: "d" }, { items: [3], nextCursor: "c" }]))).rejects.toThrow("t: cursor repeated");
	});
	it("throws when the items it listed are not the total the answer states", async () => {
		await expect(collect(fakeCall([{ items: [1, 2], nextCursor: "c", total: 5 }, { items: [3], total: 5 }]))).rejects.toThrow("t: listed 3 items but the answer's total is 5");
		await expect(collect(fakeCall([{ items: [1], total: 0 }]))).rejects.toThrow("t: listed 1 items but the answer's total is 0");
	});
});

describe("revisionsOf", () => {
	it("returns a revision_list answer's items and total", () => {
		expect(revisionsOf({ items: [{ id: "R1" }], total: 51 })).toEqual({ items: [{ id: "R1" }], total: 51 });
	});
	it("throws on a missing items array or a total that is not an integer", () => {
		expect(() => revisionsOf({ rows: [], total: 0 })).toThrow("revision_list: expected an items array");
		expect(() => revisionsOf("text")).toThrow("revision_list: expected an items array");
		for (const total of [undefined, null, "3", 1.5]) {
			expect(() => revisionsOf({ items: [], total }), String(total)).toThrow("revision_list: expected an integer total");
		}
	});
});

describe("scanFields", () => {
	it("is the pinned fields plus the live schema's", () => {
		expect(scanFields({ slug: "docs", fields: [{ slug: "summary", type: "portableText" }] })).toEqual({ pt: ["body", "summary"], image: [], blocks: [], blockText: [] });
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
		expect(entryFindings("docs", item, revisions, 3, fields)).toEqual({
			entry: ["docs/D1: slug: at most 100 characters (got 101)"],
			revisions: [
				"docs/D1@R1: body: #0 htmlBlock: raw HTML blocks are not allowed; use Markdown or a Web9 block",
				"docs/D1@R2: title: at most 200 characters (got 201)",
				"docs/D1@R2: slug: at most 100 characters (got 101)",
			],
		});
	});
	it("reports revisions it could not see as a finding of the entry", () => {
		expect(entryFindings("docs", { id: "D1", slug: "a", data: {} }, [], 51, fields)).toEqual({ entry: ["docs/D1: only the newest 0 of 51 revisions were scanned"], revisions: [] });
	});
	it("checks the item's seo.image and bylines[].roleLabel, which content_list carries beside data", () => {
		const item = {
			id: "D1",
			slug: "a",
			data: {},
			seo: { title: null, image: long(2049), canonical: long(2049) },
			bylines: [{ roleLabel: "ok" }, { roleLabel: long(81) }, { roleLabel: null, source: "inferred" }],
		};
		expect(entryFindings("docs", item, [], 0, fields)).toEqual({
			entry: [
				"docs/D1: seo.image: at most 2048 characters (got 2049)",
				"docs/D1: seo.canonical: at most 2048 characters (got 2049)",
				"docs/D1: bylines[1].roleLabel: at most 80 characters (got 81)",
			],
			revisions: [],
		});
	});
	it("reads an item without seo or bylines (a trashed one) or with odd ones as clean", () => {
		const bare = { id: "D1", slug: "a", data: {} };
		for (const extra of [
			{},
			{ seo: null, bylines: null },
			{ seo: { image: null, canonical: null }, bylines: [] },
			{ seo: "x", bylines: [null, "y", {}] },
			{ seo: { image: long(2048), canonical: long(2048) }, bylines: [{ roleLabel: long(80) }] },
		]) {
			expect(entryFindings("docs", { ...bare, ...extra }, [], 0, fields), JSON.stringify(extra)).toEqual({ entry: [], revisions: [] });
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
		expect(bylineFindings({ id: "B2", slug: "a", displayName: "A", avatarMediaId: long(65) })).toEqual(["byline B2: avatarMediaId: at most 64 characters (got 65)"]);
		for (const avatarMediaId of [null, long(64), "01JABCDEFGHJKMNPQRSTVWXYZ0"]) expect(bylineFindings({ id: "B3", slug: "a", displayName: "A", avatarMediaId })).toEqual([]);
		expect(termFindings("tag", { slug: "ai", label: "AI" })).toEqual([]);
	});
});

describe("summaryLine", () => {
	const counts = { entries: 39, revisions: 38, menus: 2, terms: 3, bylines: 1, areas: 2 };
	it("counts each kind of record and the problems", () => {
		expect(summaryLine(counts, 0, 0)).toBe("guard-scan: 39 entries, 38 revisions, 2 menus, 3 terms, 1 bylines, 2 widget areas; 0 problems");
		expect(summaryLine(counts, 4, 0)).toBe("guard-scan: 39 entries, 38 revisions, 2 menus, 3 terms, 1 bylines, 2 widget areas; 4 problems");
	});
	it("says how many problems are in revisions, which no edit fixes", () => {
		expect(summaryLine(counts, 5, 3)).toBe(
			"guard-scan: 39 entries, 38 revisions, 2 menus, 3 terms, 1 bylines, 2 widget areas; 5 problems (3 in revisions, which cannot be edited; they age out after 50 newer revisions)",
		);
	});
});

describe("restGet", () => {
	/** A stand-in for fetch that answers with `status` and `body` and records each call. */
	const fakeFetch = (status, body, type = "application/json") => {
		const calls = [];
		const fetch = async (url, init) => {
			calls.push([String(url), init]);
			return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": type } });
		};
		return Object.assign(fetch, { calls });
	};
	it("GETs the path on the site with the token and returns the answer's data", async () => {
		const fetch = fakeFetch(200, { success: true, data: { items: [] } });
		expect(await restGet("http://localhost:4321", "tok", fetch)("/_emdash/api/widget-areas")).toEqual({ items: [] });
		expect(fetch.calls).toEqual([["http://localhost:4321/_emdash/api/widget-areas", { headers: { Authorization: "Bearer tok" } }]]);
	});
	it("throws on an answer that is not JSON, not ok, or a failure, never reading it as data", async () => {
		const get = (fetch) => restGet("http://x", "t", fetch)("/p");
		await expect(get(fakeFetch(200, "<html>", "text/html"))).rejects.toThrow("REST GET /p: HTTP 200, not JSON (text/html)");
		await expect(get(fakeFetch(403, { error: { code: "FORBIDDEN" } }))).rejects.toThrow('REST GET /p: HTTP 403 {"code":"FORBIDDEN"}');
		await expect(get(fakeFetch(200, { success: false, error: { code: "X" } }))).rejects.toThrow('REST GET /p: HTTP 200 {"code":"X"}');
	});
});

describe("widgetAreasOf", () => {
	it("returns the areas of a GET widget-areas answer", () => {
		const areas = [{ name: "footer", widgets: [] }, { name: "sidebar", widgets: [{ type: "component" }] }];
		expect(widgetAreasOf({ items: areas })).toEqual(areas);
	});
	it("throws on an answer without an items array, or an area without a name string and a widgets array", () => {
		for (const answer of [undefined, null, "text", { areas: [] }, { items: {} }]) expect(() => widgetAreasOf(answer), JSON.stringify(answer)).toThrow("widget-areas: expected an items array");
		for (const area of [null, "footer", { name: "footer" }, { name: 5, widgets: [] }, { name: "footer", widgets: {} }, { widgets: [] }]) {
			expect(() => widgetAreasOf({ items: [area] }), JSON.stringify(area)).toThrow("widget-areas: expected each area to have a name string and a widgets array");
		}
	});
});

describe("widgetAreaFindings", () => {
	const WIDGET_CHECK =
		"fails the widget check (a content widget, an unknown type, component or prop, a string over its length cap, or more than 20 widgets), so SafeWidgetArea renders nothing";
	const MENU_CHECK =
		"fails the menu check (more than 50 items, a label that is not a string or is over 80 characters, a url over 2048 or a titleAttr over 200), so SafeWidgetArea renders nothing";
	const area = (...widgets) => ({ name: "footer", widgets });
	const menuWidget = { type: "menu", menuName: "links" };
	/** A menu as menu_get answers it: flat items with customUrl, no resolved url. */
	const menu = (locale, ...items) => ({ name: "links", locale, items: items.map((item) => ({ type: "custom", customUrl: "/a", titleAttr: null, ...item })) });

	it("passes the seed's areas", () => {
		expect(widgetAreaFindings(area(), [])).toEqual([]);
		expect(widgetAreaFindings(area({ type: "component", componentId: "core:search", title: "Search" }, { type: "component", componentId: "core:recent-posts", componentProps: { count: 5, showDate: true } }), [])).toEqual([]);
	});
	it("reports an area that fails widgetAreaIsSafe, without reading its menus", () => {
		expect(widgetAreaFindings(area({ type: "content", content: [] }), [])).toEqual([`widget area footer: ${WIDGET_CHECK}`]);
		expect(widgetAreaFindings(area(menuWidget, { type: "component", componentId: "constructor" }), [menu("en", { label: long(81) })])).toEqual([`widget area footer: ${WIDGET_CHECK}`]);
	});
	it("checks every locale's menu of each name a menu widget gives, as SafeWidgetArea's getMenu may resolve to any", () => {
		const menus = [menu("en", { label: "ok" }), menu("zh-CN", { label: long(81) }), { ...menu("en", { label: long(81) }), name: "other" }];
		expect(widgetAreaFindings(area(menuWidget), menus)).toEqual([`widget area footer: menu links (zh-CN) ${MENU_CHECK}`]);
		expect(widgetAreaFindings(area(menuWidget), [menu("en", ...Array.from({ length: 51 }, () => ({ label: "a" })))])).toEqual([`widget area footer: menu links (en) ${MENU_CHECK}`]);
		expect(widgetAreaFindings(area(menuWidget), [menu("en", { label: null })])).toEqual([`widget area footer: menu links (en) ${MENU_CHECK}`]);
	});
	it("reads a custom item's customUrl as the url getMenu gives it, and an empty titleAttr as none", () => {
		expect(widgetAreaFindings(area(menuWidget), [menu("en", { label: "a", customUrl: long(2049) })])).toEqual([`widget area footer: menu links (en) ${MENU_CHECK}`]);
		expect(widgetAreaFindings(area(menuWidget), [menu("en", { label: "a", titleAttr: long(201) })])).toEqual([`widget area footer: menu links (en) ${MENU_CHECK}`]);
		const fine = [{ label: "a", customUrl: long(2048), titleAttr: long(200) }, { label: "b", customUrl: null, titleAttr: "" }, { label: "c", type: "page", customUrl: null, referenceId: "P1" }];
		expect(widgetAreaFindings(area(menuWidget), [menu("en", ...fine)])).toEqual([]);
	});
	it("passes a menu widget without a menu name, or naming a menu that does not exist (it renders nothing)", () => {
		expect(widgetAreaFindings(area({ type: "menu" }, { type: "menu", menuName: null }), [menu("en", { label: long(81) })])).toEqual([]);
		expect(widgetAreaFindings(area({ type: "menu", menuName: "missing" }), [menu("en", { label: long(81) })])).toEqual([]);
	});
});
