// Minimal client for the EmDash MCP endpoint (JSON-RPC over Streamable HTTP; stateless, no initialize needed).
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: contents of .local/dev-token).
import { readFileSync } from "node:fs";

/** Streamable HTTP may answer with SSE; the JSON-RPC response is the last `data:` line. */
export function parseRpcBody(raw) {
	if (raw.trimStart().startsWith("{")) return JSON.parse(raw);
	const data = raw
		.split("\n")
		.filter((l) => l.startsWith("data:"))
		.map((l) => l.slice(5).trim());
	if (!data.length) throw new Error(`Unexpected MCP response: ${raw.slice(0, 200)}`);
	return JSON.parse(data.at(-1));
}

/** Unwrap a tools/call answer: JSON-parse its text content when possible; throw on errors. */
export function unwrapToolResult(name, res) {
	if (res.error) throw new Error(`${name}: ${res.error.message ?? JSON.stringify(res.error)}`);
	if (!res.result) throw new Error(`${name}: not a JSON-RPC result: ${JSON.stringify(res).slice(0, 200)}`);
	const text = (res.result?.content ?? [])
		.filter((c) => c.type === "text")
		.map((c) => c.text)
		.join("\n");
	if (res.result?.isError) throw new Error(`${name}: ${text}`);
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export function defaultToken() {
	if (process.env.EMDASH_TOKEN) return process.env.EMDASH_TOKEN;
	return readFileSync(new URL("../../.local/dev-token", import.meta.url), "utf8").trim();
}

let nextId = 1;

export async function rpc(method, params = {}, { url = process.env.EMDASH_URL ?? "http://localhost:4321", token = defaultToken() } = {}) {
	const res = await fetch(`${url}/_emdash/api/mcp`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
	});
	const body = await res.text();
	if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${body.slice(0, 200)}`);
	return parseRpcBody(body);
}

export async function callTool(name, args = {}, opts) {
	return unwrapToolResult(name, await rpc("tools/call", { name, arguments: args }, opts));
}
