import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANONICAL_ORIGIN, canonicalRedirect } from "./canonical-host.mjs";

describe("canonicalRedirect", () => {
	it("leaves the canonical origin alone", () => {
		expect(canonicalRedirect("https://www.web9.ai/")).toBeNull();
		expect(canonicalRedirect("https://www.web9.ai/docs/intro?q=1")).toBeNull();
	});
	it("sends the apex to www, keeping path and query", () => {
		expect(canonicalRedirect("https://web9.ai/")).toBe("https://www.web9.ai/");
		expect(canonicalRedirect("https://web9.ai/zh-CN/docs/intro?q=a%20b")).toBe("https://www.web9.ai/zh-CN/docs/intro?q=a%20b");
	});
	it("sends plain http to https", () => {
		expect(canonicalRedirect("http://www.web9.ai/posts")).toBe("https://www.web9.ai/posts");
		expect(canonicalRedirect("http://web9.ai/")).toBe("https://www.web9.ai/");
	});
	it("leaves every other host alone: workers.dev, local dev, look-alikes", () => {
		for (const url of [
			"https://web9-ai.jhcao23.workers.dev/_emdash/admin",
			"http://localhost:4321/",
			"https://web9.ai.example.com/",
			"https://xweb9.ai/",
		])
			expect(canonicalRedirect(url), url).toBeNull();
	});
	it("matches astro.config's site", () => {
		const config = readFileSync(new URL("../../../astro.config.mjs", import.meta.url), "utf8");
		expect(config).toContain(`site: "${CANONICAL_ORIGIN}"`);
	});
	it("runs in src/worker.ts before EmDash's fetch handler", () => {
		const worker = readFileSync(new URL("../../../src/worker.ts", import.meta.url), "utf8");
		expect(worker).toMatch(/const location = canonicalRedirect\(request\.url\);[\s\S]*return handler\.fetch!\(request, env, ctx\);/);
	});
});
