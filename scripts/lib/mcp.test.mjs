import { afterEach, describe, expect, it, vi } from "vitest";
import { checkMarkers } from "./markers.mjs";
import { authMode, defaultToken, listOf, parseRpcBody, rpc, unwrapToolResult } from "./mcp.mjs";

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
	it("keeps the AI token out of the scripts that use defaultToken (REST, admin work)", () => {
		env({ EMDASH_AUTH: "ai", EMDASH_URL: "https://site.test" });
		expect(() => defaultToken()).toThrow(/covers MCP calls only/);
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
