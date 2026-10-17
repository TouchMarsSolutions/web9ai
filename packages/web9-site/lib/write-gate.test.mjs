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
