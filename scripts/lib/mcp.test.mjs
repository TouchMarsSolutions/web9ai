import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkMarkers } from "./markers.mjs";
import { authMode, callTool, defaultToken, listOf, parseRpcBody, rpc, unwrapToolResult } from "./mcp.mjs";

describe("parseRpcBody", () => {
	it("parses plain JSON", () => {
		expect(parseRpcBody('{"jsonrpc":"2.0","id":1,"result":{}}').id).toBe(1);
	});
	it("takes the last data: line of an SSE answer", () => {
		expect(parseRpcBody('event: message\ndata: {"id":1,"result":{"a":1}}\n\ndata: {"id":2,"result":{"a":2}}\n').result.a).toBe(2);
	});
	it("throws on anything else", () => {
		expect(() => parseRpcBody("<html>")).toThrow(/Unexpected MCP response/);
	});
});

describe("unwrapToolResult", () => {
	it("returns parsed JSON text content", () => {
		expect(unwrapToolResult("t", { result: { content: [{ type: "text", text: '{"id":"x"}' }] } })).toEqual({ id: "x" });
	});
	it("returns raw text when it is not JSON", () => {
		expect(unwrapToolResult("t", { result: { content: [{ type: "text", text: "ok" }] } })).toBe("ok");
	});
	it("throws on tool errors and JSON-RPC errors", () => {
		expect(() => unwrapToolResult("t", { result: { isError: true, content: [{ type: "text", text: "nope" }] } })).toThrow("t: nope");
		expect(() => unwrapToolResult("t", { error: { code: -32602, message: "bad args" } })).toThrow("t: bad args");
	});
	it("throws when the body is not a JSON-RPC result", () => {
		expect(() => unwrapToolResult("t", { message: "Unauthorized" })).toThrow(/^t: .*not a JSON-RPC result/);
	});
});

describe("listOf", () => {
	it("returns the array an answer holds, empty or not", () => {
		expect(listOf("t", { items: [1] })).toEqual([1]);
		expect(listOf("t", { taxonomies: [] }, "taxonomies")).toEqual([]);
		expect(listOf("t", [1, 2], null)).toEqual([1, 2]);
	});
	it("throws, naming the tool, instead of reading a wrong shape as empty", () => {
		for (const answer of ["not json", null, undefined, 7, [], { renamed_items: [] }, { items: {} }, { items: "x" }]) {
			expect(() => listOf("content_list", answer), JSON.stringify(answer)).toThrow("content_list: expected an items array");
		}
		expect(() => listOf("taxonomy_list", { items: [] }, "taxonomies")).toThrow("taxonomy_list: expected a taxonomies array");
		expect(() => listOf("menu_list", { items: [] }, null)).toThrow("menu_list: expected an array");
		expect(() => listOf("menu_list", null, null)).toThrow("menu_list: expected an array");
	});
});

describe("rpc", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});
	it("throws with the HTTP status on a non-OK response", async () => {
		vi.stubGlobal("fetch", async () => new Response('{"error":"nope"}', { status: 401 }));
		await expect(rpc("tools/list", {}, { token: "x" })).rejects.toThrow("MCP HTTP 401");
	});
});

describe("authMode", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});
	const env = (vars) => {
		for (const [k, v] of Object.entries({ EMDASH_AUTH: undefined, EMDASH_TOKEN: undefined, EMDASH_URL: undefined, ...vars })) {
			vi.stubEnv(k, v);
		}
	};
	it('is "token" when EMDASH_AUTH is unset or empty', () => {
		env({});
		expect(authMode()).toBe("token");
		env({ EMDASH_AUTH: "" });
		expect(authMode()).toBe("token");
	});
	it('is "ai" with EMDASH_AUTH=ai and an EMDASH_URL', () => {
		env({ EMDASH_AUTH: "ai", EMDASH_URL: "https://site.test" });
		expect(authMode()).toBe("ai");
	});
	it("rejects an unknown mode, a second token, and a missing site", () => {
		env({ EMDASH_AUTH: "admin" });
		expect(() => authMode()).toThrow('EMDASH_AUTH must be "ai" or unset');
		env({ EMDASH_AUTH: "ai", EMDASH_URL: "https://site.test", EMDASH_TOKEN: "x" });
		expect(() => authMode()).toThrow(/both set/);
		env({ EMDASH_AUTH: "ai" });
		expect(() => authMode()).toThrow(/needs EMDASH_URL/);
	});
	it("makes every caller but scripts/mcp.mjs refuse the AI mode before any request", async () => {
		env({ EMDASH_AUTH: "ai", EMDASH_URL: "https://site.test" });
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		expect(() => defaultToken()).toThrow(/works with scripts\/mcp\.mjs only/);
		await expect(callTool("content_list", {})).rejects.toThrow(/works with scripts\/mcp\.mjs only/);
		expect(fetch).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});

describe("rpc as the AI Editor (ai option)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});
	const NOW = Date.parse("2026-10-17T12:00:00Z");
	const setup = () => {
		const dir = mkdtempSync(join(tmpdir(), "mcp-ai-"));
		for (const [name, text] of [
			["ai-refresh-token", "ec_ort_r"],
			["ai-access-token", "ec_oat_old"],
			["ai-access-token.expires-at", new Date(NOW + 30 * 60_000).toISOString()],
		]) {
			writeFileSync(join(dir, name), `${text}\n`, { mode: 0o600 });
		}
		const refresh = vi.fn(async () => Response.json({ data: { access_token: "ec_oat_new", expires_in: 3600 } }));
		return { dir, refresh, ai: { dir, fetch: refresh, now: () => NOW } };
	};
	const answer = () => Response.json({ jsonrpc: "2.0", id: 1, result: { tools: [] } });

	it("sends the stored token to the site's MCP endpoint", async () => {
		const { ai, refresh } = setup();
		const mcp = vi.fn(async () => answer());
		vi.stubGlobal("fetch", mcp);
		expect((await rpc("tools/list", {}, { url: "https://site.test/", ai })).result).toEqual({ tools: [] });
		expect(String(mcp.mock.calls[0][0])).toBe("https://site.test/_emdash/api/mcp");
		expect(mcp.mock.calls[0][1].headers.Authorization).toBe("Bearer ec_oat_old");
		expect(refresh).not.toHaveBeenCalled();
	});

	it("on a 401 refreshes and resends the same request with the new token", async () => {
		const { ai, refresh } = setup();
		const mcp = vi.fn(async (_url, init) => (init.headers.Authorization === "Bearer ec_oat_new" ? answer() : new Response("", { status: 401 })));
		vi.stubGlobal("fetch", mcp);
		expect((await rpc("tools/list", {}, { url: "https://site.test", ai })).result).toEqual({ tools: [] });
		expect(mcp.mock.calls.map(([, init]) => init.headers.Authorization)).toEqual(["Bearer ec_oat_old", "Bearer ec_oat_new"]);
		expect(mcp.mock.calls[1][1].body).toBe(mcp.mock.calls[0][1].body);
		expect(refresh).toHaveBeenCalledOnce();
	});

	it("without the ai option, an explicit token is sent as is", async () => {
		const mcp = vi.fn(async () => answer());
		vi.stubGlobal("fetch", mcp);
		await rpc("tools/list", {}, { url: "https://site.test", token: "x" });
		expect(mcp.mock.calls[0][1].headers.Authorization).toBe("Bearer x");
	});
});

describe("checkMarkers", () => {
	it("reports missing and unexpected markers", () => {
		expect(checkMarkers("<p class=a>hi</p>", { present: ["hi", "bye"], absent: ["class=a", "zzz"] })).toEqual({
			missing: ["bye"],
			unexpected: ["class=a"],
		});
	});
});
