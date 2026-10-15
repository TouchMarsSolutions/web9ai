import { describe, expect, it } from "vitest";
import { checkMarkers } from "./markers.mjs";
import { parseRpcBody, unwrapToolResult } from "./mcp.mjs";

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
});

describe("checkMarkers", () => {
	it("reports missing and unexpected markers", () => {
		expect(checkMarkers("<p class=a>hi</p>", { present: ["hi", "bye"], absent: ["class=a", "zzz"] })).toEqual({
			missing: ["bye"],
			unexpected: ["class=a"],
		});
	});
});
