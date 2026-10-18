#!/usr/bin/env node
// Usage: node scripts/ai-token.mjs status                    when the AI Editor account's tokens expire (offline)
//        EMDASH_URL=<site> node scripts/ai-token.mjs refresh   renew the access token now
// Shows a token only as an 8-character SHA-256 fingerprint. MCP calls renew it themselves (EMDASH_AUTH=ai, lib/mcp.mjs).
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";
import { AI_TOKEN_DIR, readAccess, readSite, refreshAccess } from "./lib/ai-token.mjs";

const [command] = process.argv.slice(2);
const file = (name) => {
	try {
		return statSync(join(AI_TOKEN_DIR, name));
	} catch {
		return null;
	}
};
const mode = (st) => `mode ${(st.mode & 0o777).toString(8)}`;
const span = (ms) => (Math.abs(ms) < 90 * 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 86_400_000 * 10) / 10} days`);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

function status() {
	const { token, expiresAt } = readAccess();
	const left = expiresAt === null ? null : expiresAt - Date.now();
	let when = "expiry unknown, the next use renews it";
	if (left !== null && left > 5 * 60_000) when = `expires ${new Date(expiresAt).toISOString()} (in ${span(left)})`;
	else if (left !== null && left > 0) when = `expires in ${span(left)}, the next use renews it`;
	else if (left !== null) when = `expired ${span(-left)} ago, the next use renews it`;
	const fingerprint = token && createHash("sha256").update(token).digest("hex").slice(0, 8);
	const access = token ? `${fingerprint}, ${mode(file("ai-access-token"))}, ${when}` : "missing or malformed, the next use renews it";
	console.log(`access token:  ${access}`);
	// the device flow writes the refresh token, and it lasts 90 days from then (were emdash to rotate it, each rotation
	// would rewrite the file; a copy or an edit resets the date too)
	const saved = file("ai-refresh-token");
	console.log(`refresh token: ${saved ? `${mode(saved)}, saved ${day(saved.mtimeMs)}, lasts until about ${day(saved.mtimeMs + 90 * 86_400_000)}` : "missing"}`);
	const site = readSite();
	console.log(`site:          ${site ?? "not recorded: run EMDASH_URL=<site> node scripts/ai-token.mjs refresh once"}`);
}

if (command === "status") status();
else if (command === "refresh") {
	if (!process.env.EMDASH_URL) {
		console.error("refresh needs EMDASH_URL, the site that issued the AI token");
		process.exit(2);
	}
	await refreshAccess(process.env.EMDASH_URL);
	status();
} else {
	console.error("usage: ai-token.mjs status | refresh (with EMDASH_URL)");
	process.exit(2);
}
