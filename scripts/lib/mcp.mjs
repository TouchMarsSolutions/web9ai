// Minimal client for the EmDash MCP endpoint (JSON-RPC over Streamable HTTP; stateless, no initialize needed).
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: contents of .local/dev-token).
// EMDASH_AUTH=ai is for scripts/mcp.mjs only: it passes the `ai` option, which uses the AI Editor account's token
// (lib/ai-token.mjs: renewed before it expires and on a 401); every other caller then refuses to run (defaultToken).
import { readFileSync } from "node:fs";
import { withAiToken } from "./ai-token.mjs";

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

/**
 * The array an answer should hold: `answer[key]`, or the answer itself when `key` is null. Anything else throws, so a
 * script never reads a wrong-shaped answer (an error text, a renamed key) as an empty list.
 */
export function listOf(tool, answer, key = "items") {
	const list = key === null ? answer : answer?.[key];
	if (Array.isArray(list)) return list;
	const what = key === null ? "an array" : `${/^[aeiou]/.test(key) ? "an" : "a"} ${key} array`;
	throw new Error(`${tool}: expected ${what}`);
}

/** "ai" (EMDASH_AUTH=ai) or "token" (EMDASH_TOKEN, else .local/dev-token); a half-set or contradictory env throws. */
export function authMode() {
	const mode = process.env.EMDASH_AUTH;
	if (!mode) return "token";
	if (mode !== "ai") throw new Error(`EMDASH_AUTH must be "ai" or unset, not ${JSON.stringify(mode)}`);
	if (process.env.EMDASH_TOKEN) throw new Error("EMDASH_AUTH=ai and EMDASH_TOKEN are both set: unset one");
	if (!process.env.EMDASH_URL) throw new Error("EMDASH_AUTH=ai needs EMDASH_URL, the site that issued the AI token");
	return "ai";
}

export function defaultToken() {
	// migrate and guard-scan read this: admin work, which the AI account has no scopes for
	if (authMode() === "ai") throw new Error("EMDASH_AUTH=ai works with scripts/mcp.mjs only; this script needs EMDASH_TOKEN");
	if (process.env.EMDASH_TOKEN) return process.env.EMDASH_TOKEN;
	return readFileSync(new URL("../../.local/dev-token", import.meta.url), "utf8").trim();
}

let nextId = 1;

/** `ai`: call as the AI Editor account; the object holds lib/ai-token.mjs options (`{}` for the defaults). */
export async function rpc(method, params = {}, { url = process.env.EMDASH_URL ?? "http://localhost:4321", token, ai } = {}) {
	const payload = JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params });
	const send = (bearer) =>
		fetch(new URL("/_emdash/api/mcp", url), {
			method: "POST",
			headers: {
				Authorization: `Bearer ${bearer}`,
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: payload,
		});
	const res = ai ? await withAiToken(url, send, ai) : await send(token ?? defaultToken());
	const body = await res.text();
	if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${body.slice(0, 200)}`);
	return parseRpcBody(body);
}

export async function callTool(name, args = {}, opts) {
	return unwrapToolResult(name, await rpc("tools/call", { name, arguments: args }, opts));
}
