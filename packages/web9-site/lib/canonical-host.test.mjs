import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { unstable_readConfig } from "wrangler";
import { CANONICAL_ORIGIN, canonicalRedirect, canonicalResponse } from "./canonical-host.mjs";

describe("canonicalRedirect", () => {
	it("leaves the canonical origin alone", () => {
		expect(canonicalRedirect("https://www.web9.ai/")).toBeNull();
		expect(canonicalRedirect("https://www.web9.ai/docs/intro?q=1")).toBeNull();
		expect(canonicalRedirect("https://Www.Web9.Ai/")).toBeNull();
	});
	it("sends the apex to www, keeping path and query", () => {
		expect(canonicalRedirect("https://web9.ai/")).toBe("https://www.web9.ai/");
		expect(canonicalRedirect("https://web9.ai/zh-CN/docs/intro?q=a%20b")).toBe("https://www.web9.ai/zh-CN/docs/intro?q=a%20b");
		expect(canonicalRedirect("https://WEB9.AI/Docs")).toBe("https://www.web9.ai/Docs");
	});
	it("sends plain http to https", () => {
		expect(canonicalRedirect("http://www.web9.ai/posts")).toBe("https://www.web9.ai/posts");
		expect(canonicalRedirect("http://web9.ai/")).toBe("https://www.web9.ai/");
	});
	it("leaves every other host alone: workers.dev, local dev, look-alikes, a trailing dot", () => {
		for (const url of [
			"https://site.example.workers.dev/_emdash/admin",
			"http://localhost:4321/",
			"https://web9.ai.example.com/",
			"https://xweb9.ai/",
			"https://web9.ai./",
		])
			expect(canonicalRedirect(url), url).toBeNull();
	});
	it("passes an unparsable URL through instead of throwing", () => {
		expect(canonicalRedirect("not a url")).toBeNull();
	});
	it("matches astro.config's site", () => {
		const config = readFileSync(new URL("../../../astro.config.mjs", import.meta.url), "utf8");
		expect(config).toContain(`site: "${CANONICAL_ORIGIN}"`);
	});
});

describe("canonicalResponse", () => {
	it("answers GET and HEAD with an empty 301", async () => {
		for (const method of ["GET", "HEAD"]) {
			const res = canonicalResponse(new Request("https://web9.ai/docs/intro?x=1", { method }));
			expect(res.status, method).toBe(301);
			expect(res.headers.get("Location")).toBe("https://www.web9.ai/docs/intro?x=1");
			expect(await res.text()).toBe("");
		}
	});
	it("answers other methods with 308, so a following client keeps the method and body", () => {
		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			const res = canonicalResponse(new Request("http://www.web9.ai/_emdash/api/mcp", { method }));
			expect(res.status, method).toBe(308);
			expect(res.headers.get("Location")).toBe("https://www.web9.ai/_emdash/api/mcp");
		}
	});
	it("is null on the canonical origin and on other hosts", () => {
		expect(canonicalResponse(new Request("https://www.web9.ai/"))).toBeNull();
		expect(canonicalResponse(new Request("https://site.example.workers.dev/", { method: "POST" }))).toBeNull();
	});
	it("runs as the first thing in src/worker.ts's fetch, before EmDash's handler", () => {
		const worker = readFileSync(new URL("../../../src/worker.ts", import.meta.url), "utf8");
		expect(worker).toMatch(/fetch\(request, env, ctx\) \{\s*return canonicalResponse\(request\) \?\? handler\.fetch!\(request, env, ctx\);\s*\}/);
	});
});

describe("wrangler.jsonc", () => {
	// Read the way the build reads it, so wrangler also validates the route shape (an unknown key throws)
	const config = unstable_readConfig({ config: fileURLToPath(new URL("../../../wrangler.jsonc", import.meta.url)) }, { hideWarnings: true });

	it("binds exactly the two production hosts, as Custom Domains (Cloudflare creates their DNS records and certificates)", () => {
		expect(config.routes).toEqual([
			{ pattern: "www.web9.ai", custom_domain: true },
			{ pattern: "web9.ai", custom_domain: true },
		]);
	});
	it("serves every bound host from the canonical origin or redirects it there", () => {
		for (const { pattern } of config.routes) {
			const target = canonicalRedirect(`https://${pattern}/`);
			expect(target ?? `https://${pattern}/`, pattern).toBe(`${CANONICAL_ORIGIN}/`);
		}
	});
	it("keeps workers.dev on, where the owner's passkey lives until Change domain", () => {
		expect(config.workers_dev).toBe(true);
		expect(config.preview_urls).toBe(false);
	});
});
