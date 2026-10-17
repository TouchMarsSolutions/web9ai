import { describe, expect, it } from "vitest";
import { GATED_PATTERNS, MAX_GATED_BODY_BYTES, gatedRequest, readGatedBody, writeGateResponse } from "./write-gate.mjs";

const long = (n) => "x".repeat(n);
const call = (name, args, id = 7) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

// The route patterns Astro matches (context.routePattern), as emdash astro/integration/routes.ts injects them
const CONTENT = "/_emdash/api/content/[collection]";
const CONTENT_ID = "/_emdash/api/content/[collection]/[id]";
const MENU_ITEMS = "/_emdash/api/menus/[name]/items";
const MENU_ITEM = "/_emdash/api/menus/[name]/items/[id]";
const TERMS = "/_emdash/api/taxonomies/[name]/terms";
const TERM = "/_emdash/api/taxonomies/[name]/terms/[slug]";
const TERM_TRANSLATIONS = "/_emdash/api/taxonomies/[name]/terms/[slug]/translations";
const BYLINES = "/_emdash/api/admin/bylines";
const BYLINE = "/_emdash/api/admin/bylines/[id]";
const BYLINE_TRANSLATIONS = "/_emdash/api/admin/bylines/[id]/translations";
const MCP = "/_emdash/api/mcp";

describe("gatedRequest", () => {
	it("reads the body of writes to the gated route patterns and the MCP endpoint only", () => {
		for (const [method, pattern] of [
			["POST", CONTENT],
			["PUT", CONTENT_ID],
			["PATCH", CONTENT_ID],
			["POST", MENU_ITEMS],
			["PUT", MENU_ITEM],
			["POST", TERMS],
			["PUT", TERM],
			["POST", TERM_TRANSLATIONS],
			["POST", BYLINES],
			["PUT", BYLINE],
			["POST", BYLINE_TRANSLATIONS],
			["POST", MCP],
		]) expect(gatedRequest(method, pattern), `${method} ${pattern}`).toBe(true);
	});
	it("leaves other methods and other route patterns alone", () => {
		for (const [method, pattern] of [
			["GET", CONTENT],
			["DELETE", CONTENT_ID],
			["HEAD", MCP],
			["POST", "/_emdash/api/content/[collection]/[id]/publish"],
			["POST", "/_emdash/api/content/[collection]/[id]/translations"],
			["POST", "/_emdash/api/menus/[name]"],
			["POST", "/_emdash/api/taxonomies/[name]/reorder"],
			["POST", "/_emdash/api/media"],
			["POST", "/_emdash/api/admin/byline-fields"],
			["POST", "/docs/[...slug]"],
			["POST", "/_emdash/api/mcp/[extra]"],
			["POST", ""],
			["POST", undefined],
		]) expect(gatedRequest(method, pattern), `${method} ${pattern}`).toBe(false);
	});
	it("takes a route pattern, not a path: a pathname never matches, however it is spelled", () => {
		for (const pathname of [
			"/_emdash/api/content/docs",
			"/_emdash/api/content/docs/01ABC",
			"/_emdash/api/taxonomies/tag/terms/ai",
			"/_emdash/api/taxonomies/tag/terms/a\\b",
			"/_emdash/api/taxonomies/tag/terms/%2E%2E",
			"/_emdash/api/admin/bylines/01ABC",
			"/_emdash/api/mcp/",
		]) expect(gatedRequest("POST", pathname), pathname).toBe(false);
	});
	it("names core's body limit", () => {
		expect(MAX_GATED_BODY_BYTES).toBe(10 * 1024 * 1024);
	});
	it("lists the patterns it gates", () => {
		expect([...GATED_PATTERNS].sort()).toEqual([CONTENT, CONTENT_ID, MENU_ITEMS, MENU_ITEM, TERMS, TERM, TERM_TRANSLATIONS, BYLINES, BYLINE, BYLINE_TRANSLATIONS, MCP].sort());
	});
});

describe("writeGateResponse: REST", () => {
	it("rejects an over-long slug, menu label or URL, term label or slug with core's 400 shape", () => {
		expect(writeGateResponse("POST", CONTENT, { slug: long(101), data: {} })).toEqual({
			status: 400,
			body: { success: false, error: { code: "VALIDATION_ERROR", message: "Write rejected (spec §10): slug: at most 100 characters (got 101)" } },
		});
		expect(writeGateResponse("PUT", MENU_ITEM, { label: long(81), customUrl: long(2049) }).body.error.message).toBe(
			"Write rejected (spec §10): label: at most 80 characters (got 81); customUrl: at most 2048 characters (got 2049)",
		);
		expect(writeGateResponse("POST", TERM_TRANSLATIONS, { locale: "zh-CN", slug: long(101) }).status).toBe(400);
		expect(writeGateResponse("PUT", TERM, { label: long(81) }).status).toBe(400);
		expect(writeGateResponse("POST", TERMS, { label: long(81), slug: long(101) }).body.error.message).toBe(
			"Write rejected (spec §10): label: at most 80 characters (got 81); slug: at most 100 characters (got 101)",
		);
	});
	it("rejects an over-long menu item titleAttr or target (rendered on every page and in footer menu widgets)", () => {
		expect(writeGateResponse("POST", MENU_ITEMS, { type: "custom", label: "ok", customUrl: "/x", titleAttr: long(201) }).body.error.message).toBe(
			"Write rejected (spec §10): titleAttr: at most 200 characters (got 201)",
		);
		expect(writeGateResponse("POST", MENU_ITEMS, { type: "custom", label: "ok", customUrl: "/x", target: long(33) }).body.error.message).toBe(
			"Write rejected (spec §10): target: at most 32 characters (got 33)",
		);
		expect(writeGateResponse("POST", MENU_ITEMS, { label: "ok", titleAttr: long(200), target: long(32) })).toBeNull();
	});
	it("rejects an over-long content seo.image and byline roleLabel, naming the entry in the message", () => {
		expect(writeGateResponse("POST", CONTENT, { slug: "probe-x", data: { title: "P" }, seo: { image: long(2049) } }).body.error.message).toBe(
			"Write rejected (spec §10): seo.image: at most 2048 characters (got 2049)",
		);
		expect(
			writeGateResponse("PUT", CONTENT_ID, { bylines: [{ bylineId: "a", roleLabel: "ok" }, { bylineId: "b", roleLabel: long(81) }] }).body.error.message,
		).toBe("Write rejected (spec §10): bylines[1].roleLabel: at most 80 characters (got 81)");
		expect(
			writeGateResponse("PUT", CONTENT_ID, { slug: long(101), seo: { image: long(2049) }, bylines: [{ bylineId: "a", roleLabel: long(81) }] }).body.error.message,
		).toBe(
			"Write rejected (spec §10): slug: at most 100 characters (got 101); seo.image: at most 2048 characters (got 2049); bylines[0].roleLabel: at most 80 characters (got 81)",
		);
	});
	it("rejects an over-long byline displayName or slug on the admin byline routes", () => {
		expect(writeGateResponse("POST", BYLINES, { slug: "ok", displayName: long(81) }).body.error.message).toBe(
			"Write rejected (spec §10): displayName: at most 80 characters (got 81)",
		);
		expect(writeGateResponse("PUT", BYLINE, { slug: long(101) }).body.error.message).toBe("Write rejected (spec §10): slug: at most 100 characters (got 101)");
		expect(writeGateResponse("POST", BYLINE_TRANSLATIONS, { locale: "zh-CN", displayName: long(81), slug: long(101) }).status).toBe(400);
	});
	it("lets through values within the limits, other routes and bodies that are not objects", () => {
		expect(writeGateResponse("POST", CONTENT, { slug: long(100), data: { title: long(5000) }, seo: { image: long(2048) }, bylines: [{ bylineId: "a", roleLabel: long(80) }] })).toBeNull();
		expect(writeGateResponse("POST", "/_emdash/api/content/[collection]/[id]/publish", { slug: long(500) })).toBeNull();
		expect(writeGateResponse("POST", "/_emdash/api/content/docs", { slug: long(500) })).toBeNull();
		for (const body of [null, "x", 5, [{ slug: long(500) }]]) expect(writeGateResponse("POST", CONTENT, body)).toBeNull();
	});
	it("ignores seo and bylines that are not shaped as core expects (core validates them)", () => {
		for (const body of [
			{ seo: null },
			{ seo: "x" },
			{ seo: [{ image: long(5000) }] },
			{ seo: { image: 5 } },
			{ bylines: null },
			{ bylines: "x" },
			{ bylines: { 0: { roleLabel: long(500) } } },
			{ bylines: [null, 5, "x", [], { roleLabel: null }, { roleLabel: 5 }, {}] },
		]) expect(writeGateResponse("POST", CONTENT, body), JSON.stringify(body).slice(0, 40)).toBeNull();
	});
});

describe("writeGateResponse: MCP", () => {
	it("rejects a gated tool call with a JSON-RPC error carrying the request id", () => {
		expect(writeGateResponse("POST", MCP, call("content_create", { collection: "docs", slug: long(101), data: {} }))).toEqual({
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
		]) expect(writeGateResponse("POST", MCP, call(name, args)).body.error.message, name).toContain(problem);
	});
	it("checks the seo.image and byline roleLabel of content_create and content_update", () => {
		expect(
			writeGateResponse("POST", MCP, call("content_create", { collection: "posts", data: {}, seo: { image: long(2049) }, bylines: [{ bylineId: "x", roleLabel: long(81) }] })).body.error.message,
		).toBe(
			"Write rejected (spec §10): content_create seo.image: at most 2048 characters (got 2049); content_create bylines[0].roleLabel: at most 80 characters (got 81)",
		);
		expect(writeGateResponse("POST", MCP, call("content_update", { id: "x", bylines: [{ bylineId: "x" }, { bylineId: "y", roleLabel: long(81) }] })).body.error.message).toBe(
			"Write rejected (spec §10): content_update bylines[1].roleLabel: at most 80 characters (got 81)",
		);
	});
	it("checks the titleAttr and target of every menu_set_items item", () => {
		expect(
			writeGateResponse("POST", MCP, call("menu_set_items", { name: "primary", items: [{ label: "a", type: "custom" }, { label: "b", type: "custom", titleAttr: long(201), target: long(33) }] })).body.error.message,
		).toBe(
			"Write rejected (spec §10): menu_set_items items[1].titleAttr: at most 200 characters (got 201); menu_set_items items[1].target: at most 32 characters (got 33)",
		);
	});
	it("checks every message of a batch and answers a batch with HTTP 400 and id null", () => {
		const verdict = writeGateResponse("POST", MCP, [call("content_list", {}, 1), call("content_create", { slug: long(101) }, 2)]);
		expect(verdict.status).toBe(400);
		expect(verdict.body).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32602 } });
	});
	it("lets through other methods, other tools, values within limits and malformed messages", () => {
		for (const body of [
			call("content_create", { slug: long(100), seo: { image: long(2048) }, bylines: [{ bylineId: "x", roleLabel: long(80) }] }),
			call("content_list", { slug: long(500) }),
			call("menu_set_items", { items: "x" }),
			call("menu_set_items", { items: [null, 5, { label: 5 }] }),
			call("menu_set_items", { items: [{ label: "a", titleAttr: long(200), target: long(32) }] }),
			{ jsonrpc: "2.0", id: 1, method: "tools/list" },
			{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: 5, arguments: { slug: long(500) } } },
			{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "content_create", arguments: "x" } },
			null,
			"x",
			[],
		]) expect(writeGateResponse("POST", MCP, body)).toBeNull();
	});
	it("keeps the message short when a batch has many problems", () => {
		const batch = Array.from({ length: 100 }, (_, k) => call("content_create", { slug: long(101) }, k));
		const message = writeGateResponse("POST", MCP, batch).body.error.message;
		expect(message.split("; ")).toHaveLength(21);
		expect(message.endsWith("; …")).toBe(true);
	});
});

describe("readGatedBody", () => {
	const streamOf = (...chunks) =>
		new ReadableStream({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
				controller.close();
			},
		});
	it("reads the text of a body, across chunks and across a split multi-byte character", async () => {
		expect(await readGatedBody(streamOf('{"a":', '"b"}'))).toBe('{"a":"b"}');
		const bytes = new TextEncoder().encode("é中");
		expect(await readGatedBody(streamOf(bytes.slice(0, 1), bytes.slice(1, 3), bytes.slice(3)))).toBe("é中");
	});
	it("reads a missing or empty body as an empty string", async () => {
		expect(await readGatedBody(null)).toBe("");
		expect(await readGatedBody(streamOf())).toBe("");
	});
	it("strips a leading byte order mark, so JSON.parse does not fail open", async () => {
		const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
		const text = await readGatedBody(streamOf(bom, '{"slug":"a"}'));
		expect(JSON.parse(text)).toEqual({ slug: "a" });
		expect(JSON.parse(await readGatedBody(streamOf("﻿{}")))).toEqual({});
	});
	it("gives null as soon as more than MAX_GATED_BODY_BYTES have arrived, without reading on", async () => {
		const chunk = new Uint8Array(1024 * 1024);
		let pulled = 0;
		const body = new ReadableStream({
			pull(controller) {
				pulled++;
				controller.enqueue(chunk);
				if (pulled > 100) controller.close();
			},
		});
		expect(await readGatedBody(body)).toBeNull();
		expect(pulled).toBeLessThan(20);
		expect(await readGatedBody(streamOf(new Uint8Array(MAX_GATED_BODY_BYTES)))).toHaveLength(MAX_GATED_BODY_BYTES);
		expect(await readGatedBody(streamOf(new Uint8Array(MAX_GATED_BODY_BYTES + 1)))).toBeNull();
	});
});
