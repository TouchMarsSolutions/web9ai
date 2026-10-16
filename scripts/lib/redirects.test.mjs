import { existsSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readLegacyTree } from "./legacy-tree.mjs";
import { GROUP, legacyRedirects, restRequest, syncRedirects } from "./redirects.mjs";

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
			"/zh-CN/category/cloud": "/zh-CN/docs/a",
			"/zh-CN/category/cloud-1": "/zh-CN/docs/a",
			"/zh-CN/category/use-case": "/zh-CN/docs/x",
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
	// beforeAll, not the describe body: a skipped suite's body still runs at collection (legacy/ goes away after cutover).
	let rules;
	let map;
	beforeAll(() => {
		rules = legacyRedirects(readLegacyTree());
		map = Object.fromEntries(rules.map((r) => [r.source, r.destination]));
	});
	it("has 52 doc rules, 10 blog rules, 20 category rules (en and zh-CN) and /pages/home", () => {
		expect(rules).toHaveLength(83);
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
			"/zh-CN/category/cloud": "/zh-CN/docs/rundiffusion",
			"/zh-CN/category/cloud-1": "/zh-CN/docs/rundiffusion",
			"/zh-CN/category/use-case": "/zh-CN/docs/guide",
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

describe("restRequest", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});
	const stub = (response) => {
		const fetch = vi.fn(async () => response);
		vi.stubGlobal("fetch", fetch);
		return fetch;
	};
	const json = (body, init = {}) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, ...init });

	it("sends the token and a JSON body to the site and returns the data of the answer", async () => {
		const fetch = stub(json({ success: true, data: { id: "r1" } }));
		expect(await restRequest("http://site.test", "tok")("POST", "/_emdash/api/redirects", { source: "/a" })).toEqual({ id: "r1" });
		const [url, init] = fetch.mock.calls[0];
		expect(String(url)).toBe("http://site.test/_emdash/api/redirects");
		expect(init).toMatchObject({ method: "POST", body: '{"source":"/a"}', headers: { Authorization: "Bearer tok", "Content-Type": "application/json" } });
	});
	it("throws a clear error when the answer is not JSON (an auth redirect to a login page)", async () => {
		stub(new Response("<html>Sign in</html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
		await expect(restRequest("http://site.test", "tok")("GET", "/_emdash/api/redirects")).rejects.toThrow("redirects API: HTTP 200, not JSON (text/html; charset=utf-8)");
	});
	it("names a missing content type", async () => {
		stub(new Response(null, { status: 204 }));
		await expect(restRequest("http://site.test", "tok")("GET", "/x")).rejects.toThrow("redirects API: HTTP 204, not JSON (no content-type)");
	});
	it("throws the API's error with the request on a failure", async () => {
		stub(json({ success: false, error: { code: "CONFLICT", message: 'A redirect from "/a" already exists' } }, { status: 409 }));
		await expect(restRequest("http://site.test", "tok")("POST", "/_emdash/api/redirects", {})).rejects.toThrow(/^redirects API: POST \/_emdash\/api\/redirects: HTTP 409 .*CONFLICT/);
	});
});

describe("syncRedirects on an unexpected answer", () => {
	it("says what came back instead of failing on a missing items list", async () => {
		await expect(syncRedirects(async () => ({}), [])).rejects.toThrow(/^redirects API: GET \/_emdash\/api\/redirects\?group=legacy-docusaurus.* returned no items list/);
	});
});
