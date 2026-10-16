import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLegacyTree } from "./legacy-tree.mjs";
import { GROUP, legacyRedirects, syncRedirects } from "./redirects.mjs";

const fakeTree = {
	docs: [
		{ locale: "en", rel: "ai/intro.md", file: "legacy/docs/ai/intro.md", category: "general", sortOrder: 1000, oldUrl: "/ai/intro", newUrl: "/docs/intro" },
		{ locale: "en", rel: "ai/08-cloud/02-b.md", file: "b", category: "cloud", sortOrder: 2001, oldUrl: "/ai/cloud/b", newUrl: "/docs/b" },
		{ locale: "en", rel: "ai/08-cloud/01-a.md", file: "a", category: "cloud", sortOrder: 2000, oldUrl: "/a", newUrl: "/docs/a" },
		{ locale: "zh-CN", rel: "ai/intro.md", file: "zh/ai/intro.md", category: "general", sortOrder: 1000, oldUrl: "/zh-CN/ai/intro", newUrl: "/zh-CN/docs/intro" },
	],
	categories: { cloud: { label: "Cloud" }, usecase: { label: "Use Case" } },
};

describe("legacyRedirects", () => {
	it("maps every en doc for both locales, the blog, category pages and /pages/home", () => {
		const tree = { ...fakeTree, docs: [...fakeTree.docs, { ...fakeTree.docs[1], rel: "x", category: "usecase", oldUrl: "/ai/usecase/x", newUrl: "/docs/x" }] };
		const map = Object.fromEntries(legacyRedirects(tree).map((r) => [r.source, r.destination]));
		expect(map).toMatchObject({
			"/ai/intro": "/docs/intro",
			"/zh-CN/ai/intro": "/zh-CN/docs/intro",
			"/zh-CN/a": "/zh-CN/docs/a",
			"/blog": "/posts",
			"/blog/archive": "/posts",
			"/zh-CN/blog/tags": "/posts",
			"/blog/[slug]": "/posts/[slug]",
			"/blog/tags/[tag]": "/tag/[tag]",
			"/category/cloud": "/docs/a",
			"/category/cloud-1": "/docs/a",
			"/category/use-case": "/docs/x",
			"/pages/home": "/",
		});
		expect(legacyRedirects(tree).every((r) => r.type === 301 && r.groupName === GROUP)).toBe(true);
	});
	it("refuses a zh-CN doc whose old URL is not /zh-CN + the en one", () => {
		const docs = fakeTree.docs.map((d) => (d.locale === "zh-CN" ? { ...d, oldUrl: "/zh-CN/other" } : d));
		expect(() => legacyRedirects({ ...fakeTree, docs, categories: { cloud: { label: "Cloud" } } })).toThrow(/not \/zh-CN \+ the en URL/);
	});
});

describe.skipIf(!existsSync("legacy/docs"))("legacyRedirects on legacy/", () => {
	const rules = legacyRedirects(readLegacyTree());
	const map = Object.fromEntries(rules.map((r) => [r.source, r.destination]));
	it("has 52 doc rules, 10 blog rules, 10 category rules and /pages/home", () => {
		expect(rules).toHaveLength(73);
		expect(map).toMatchObject({
			"/rundiffusion": "/docs/rundiffusion",
			"/ai/model/01_3d": "/docs/3d",
			"/zh-CN/ai/cloud/lambda": "/zh-CN/docs/lambda",
			"/ai/usecase/ai-tools-adhoc": "/docs/ai-tools-adhoc",
			"/dev/learn_ai_coding": "/docs/learn_ai_coding",
			"/category/use-case": "/docs/guide",
			"/category/prompt-engineering": "/docs/prompt-guides",
			"/category/articles": "/docs/ai-product-ideas",
			"/category/cloud": "/docs/rundiffusion",
		});
	});
});

/** Stand-in for the redirects REST API, two items per page, filtering by the `group` query like the real one. */
function fakeApi(initial = []) {
	const rows = initial.map((r, i) => ({ id: `r${i}`, enabled: true, ...r }));
	const calls = [];
	const request = async (method, path, body) => {
		calls.push(`${method} ${path.split("?")[0]}`);
		if (method === "GET") {
			const query = new URL(path, "http://x").searchParams;
			const start = Number(query.get("cursor") ?? 0);
			const matching = rows.filter((r) => r.groupName === query.get("group"));
			return { items: matching.slice(start, start + 2).map((r) => ({ ...r })), ...(start + 2 < matching.length ? { nextCursor: String(start + 2) } : {}) };
		}
		if (method === "POST") rows.push({ id: `r${rows.length}`, enabled: true, ...body });
		if (method === "PUT") Object.assign(rows.find((r) => path.endsWith(`/${r.id}`)), body);
		return {};
	};
	return { rows, calls, request, writes: () => calls.filter((c) => !c.startsWith("GET")) };
}

describe("syncRedirects", () => {
	const rule = (source, destination) => ({ source, destination, type: 301, groupName: GROUP });
	const wanted = [rule("/a", "/docs/a"), rule("/b", "/docs/b"), rule("/c", "/docs/c")];

	it("creates missing rules and reports extras without deleting them (across pages)", async () => {
		const api = fakeApi([rule("/a", "/docs/a"), rule("/b", "/docs/b"), rule("/gone", "/docs/x")]);
		const res = await syncRedirects(api.request, wanted);
		expect(res.map((r) => [r.name, r.action])).toEqual([
			["/a", "unchanged"],
			["/b", "unchanged"],
			["/c", "created"],
			["/gone", "extra"],
		]);
		expect(api.writes()).toEqual(["POST /_emdash/api/redirects"]);
		expect(api.rows.find((r) => r.source === "/gone")).toBeDefined();
		const again = await syncRedirects(api.request, wanted);
		expect(again.filter((r) => r.action !== "unchanged").map((r) => r.action)).toEqual(["extra"]);
	});

	describe("a rule that exists and differs (an admin changed it)", () => {
		const changed = () => fakeApi([rule("/a", "/docs/a"), rule("/b", "/docs/old"), rule("/gone", "/docs/x")]);
		it("stops with [WOULD_OVERWRITE] before writing anything, not even the missing rules", async () => {
			const api = changed();
			await expect(syncRedirects(api.request, wanted)).rejects.toThrow(/^\[WOULD_OVERWRITE\] redirect \/b: \/docs\/old -> \/docs\/b; .*--overwrite/);
			expect(api.writes()).toEqual([]);
			expect(api.rows.find((r) => r.source === "/b").destination).toBe("/docs/old");
		});
		it("replaces it with overwrite, then reports everything unchanged", async () => {
			const api = changed();
			const res = await syncRedirects(api.request, wanted, { overwrite: true });
			expect(res.map((r) => [r.name, r.action])).toEqual([
				["/a", "unchanged"],
				["/b", "updated"],
				["/c", "created"],
				["/gone", "extra"],
			]);
			expect(res[1].diff).toBe("/docs/old -> /docs/b");
			expect(api.writes()).toEqual(["PUT /_emdash/api/redirects/r1", "POST /_emdash/api/redirects"]);
			expect(api.rows.find((r) => r.source === "/b")).toMatchObject({ destination: "/docs/b", type: 301, enabled: true, groupName: GROUP });
			expect((await syncRedirects(api.request, wanted)).filter((r) => r.action !== "unchanged").map((r) => r.action)).toEqual(["extra"]);
		});
		it("reports it in a dry run without throwing or writing", async () => {
			const api = changed();
			const res = await syncRedirects(api.request, wanted, { dryRun: true });
			expect(res.map((r) => [r.name, r.action])).toEqual([
				["/a", "unchanged"],
				["/b", "updated"],
				["/c", "created"],
				["/gone", "extra"],
			]);
			expect(res[1].diff).toBe("/docs/old -> /docs/b");
			expect(api.writes()).toEqual([]);
		});
		it("treats a different type like a different destination", async () => {
			const api = fakeApi([{ ...rule("/a", "/docs/a"), type: 302 }]);
			await expect(syncRedirects(api.request, [rule("/a", "/docs/a")])).rejects.toThrow(/^\[WOULD_OVERWRITE\] redirect \/a: .*type 302 -> 301/);
			expect(api.writes()).toEqual([]);
		});
		it("treats a disabled rule like a changed one and enables it only with overwrite", async () => {
			const api = fakeApi([{ ...rule("/a", "/docs/a"), enabled: false }]);
			await expect(syncRedirects(api.request, [rule("/a", "/docs/a")])).rejects.toThrow(/^\[WOULD_OVERWRITE\] redirect \/a: disabled, \/docs\/a -> \/docs\/a/);
			expect(await syncRedirects(api.request, [rule("/a", "/docs/a")], { dryRun: true })).toEqual([{ name: "/a", action: "updated", diff: "disabled, /docs/a -> /docs/a" }]);
			expect(api.writes()).toEqual([]);
			expect(await syncRedirects(api.request, [rule("/a", "/docs/a")], { overwrite: true })).toEqual([{ name: "/a", action: "updated", diff: "disabled, /docs/a -> /docs/a" }]);
			expect(api.rows[0].enabled).toBe(true);
		});
	});

	it("never touches rules outside the group", async () => {
		const api = fakeApi([{ source: "/b", destination: "/elsewhere", type: 302, groupName: "manual" }, { source: "/z", destination: "/zz", type: 301, groupName: null }]);
		const before = JSON.stringify(api.rows);
		const res = await syncRedirects(api.request, [rule("/a", "/docs/a")], { overwrite: true });
		expect(res).toEqual([{ name: "/a", action: "created" }]);
		expect(JSON.stringify(api.rows.slice(0, 2))).toBe(before);
		expect(api.writes()).toEqual(["POST /_emdash/api/redirects"]);
		expect(api.calls[0]).toBe("GET /_emdash/api/redirects");
	});
});
