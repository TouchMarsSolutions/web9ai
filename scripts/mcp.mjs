#!/usr/bin/env node
// Usage: node scripts/mcp.mjs <tool> ['<json>' | @file.json]   prints the tool result as JSON
//        node scripts/mcp.mjs --list                          lists tool names
// Env: EMDASH_URL, EMDASH_TOKEN, or EMDASH_AUTH=ai for the AI Editor account (lib/mcp.mjs)
import { readFileSync } from "node:fs";
import { authMode, callTool, rpc } from "./lib/mcp.mjs";

const [tool, arg = "{}"] = process.argv.slice(2);
const opts = authMode() === "ai" ? { ai: {} } : {};
if (!tool) {
	console.error("usage: mcp.mjs <tool> ['<json>' | @file.json] | --list");
	process.exit(2);
}
if (tool === "--list") {
	const res = await rpc("tools/list", {}, opts);
	for (const t of res.result.tools) console.log(t.name);
} else {
	const args = JSON.parse(arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg);
	const out = await callTool(tool, args, opts);
	console.log(typeof out === "string" ? out : JSON.stringify(out, null, 1));
}
