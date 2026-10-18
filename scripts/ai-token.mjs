#!/usr/bin/env node
// Usage: node scripts/ai-token.mjs status                    when the AI Editor account's access token expires (offline)
//        EMDASH_URL=<site> node scripts/ai-token.mjs refresh   renew it now
// Prints at most a 6-character token prefix. MCP calls renew the token themselves (EMDASH_AUTH=ai, lib/mcp.mjs).
import { statSync } from "node:fs";
import { join } from "node:path";
import { AI_TOKEN_DIR, readAccess, refreshAccess } from "./lib/ai-token.mjs";

const [command] = process.argv.slice(2);
const mode = (name) => {
	try {
		return `mode ${(statSync(join(AI_TOKEN_DIR, name)).mode & 0o777).toString(8)}`;
	} catch {
		return "missing";
	}
};
const minutes = (ms) => (Math.abs(ms) < 90 * 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 3_600_000)} h`);

function status() {
	const { token, expiresAt } = readAccess();
	const left = expiresAt === null ? null : expiresAt - Date.now();
	let when = "expiry unknown (the next use renews it)";
	if (left !== null && left > 0) when = `expires ${new Date(expiresAt).toISOString()} (in ${minutes(left)})`;
	else if (left !== null) when = `expired ${minutes(-left)} ago (the next use renews it)`;
	const access = token ? `${token.slice(0, 6)}…, ${mode("ai-access-token")}, ${when}` : "missing (the next use creates it)";
	console.log(`access token:  ${access}`);
	console.log(`refresh token: ${mode("ai-refresh-token")} (lasts 90 days from its device-code approval)`);
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
