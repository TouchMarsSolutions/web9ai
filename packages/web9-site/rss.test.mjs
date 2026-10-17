// src/pages/rss.xml.ts with emdash mocked: a failed read answers 503 that no shared cache keeps (spec §8),
// never a cacheable 200 with an empty channel.
import { beforeEach, describe, expect, it, vi } from "vitest";

const emdash = vi.hoisted(() => ({ getEmDashCollection: vi.fn(), getSiteSettings: vi.fn() }));
vi.mock("emdash", () => emdash);

const { GET } = await import("../../src/pages/rss.xml.ts");

const context = (search = "") => ({
	site: new URL("https://www.web9.ai/"),
	url: new URL(`https://www.web9.ai/rss.xml${search}`),
	locals: {},
	cookies: { get: () => undefined },
});
const post = { id: "hello", data: { title: "Hello", excerpt: "Hi", publishedAt: new Date("2025-03-08T00:00:00Z") } };

beforeEach(() => {
	emdash.getSiteSettings.mockResolvedValue({});
});

describe("GET /rss.xml", () => {
	it("lists published posts, public for five minutes", async () => {
		emdash.getEmDashCollection.mockResolvedValue({ entries: [post] });
		const res = await GET(context());
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("public, max-age=300");
		expect(await res.text()).toContain("<link>https://www.web9.ai/posts/hello</link>");
	});
	it("answers a failed read with 503 no-store", async () => {
		emdash.getEmDashCollection.mockResolvedValue({ entries: [], error: new Error("D1 unavailable") });
		const res = await GET(context());
		expect(res.status).toBe(503);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(await res.text()).not.toContain("<rss");
	});
	it("keeps a failed read private for an editor or preview request", async () => {
		emdash.getEmDashCollection.mockResolvedValue({ entries: [], error: new Error("D1 unavailable") });
		const res = await GET(context("?_preview=x"));
		expect(res.status).toBe(503);
		expect(res.headers.get("cache-control")).toBe("private, no-store");
	});
});
