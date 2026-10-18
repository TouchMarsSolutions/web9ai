// The AI Editor account's OAuth tokens (spec 2026-10-17-ai-pat-preconditions §3.5): an access token that lasts an hour
// and a refresh token that lasts 90 days, in .local/ai-access-token and .local/ai-refresh-token (mode 600, never
// committed). A refresh issues a new access token and revokes the previous one at once; the refresh token does not
// rotate. The access token's expiry is not in the token, so each refresh writes it to .local/ai-access-token.expires-at.
// Nothing here prints or throws a token.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const AI_TOKEN_DIR = fileURLToPath(new URL("../../.local/", import.meta.url));
const ACCESS = "ai-access-token";
const EXPIRES = "ai-access-token.expires-at";
const REFRESH = "ai-refresh-token";
/** Renew this long before the expiry, so a token never runs out in the middle of a run. */
const MARGIN_MS = 5 * 60_000;
const NEW_DEVICE_CODE = "approve a new device code as ai-agent@web9.ai (spec 2026-10-17-ai-pat-preconditions §3.5)";

function read(dir, name) {
	try {
		return readFileSync(join(dir, name), "utf8").trim() || null;
	} catch (e) {
		if (e.code === "ENOENT") return null;
		throw e;
	}
}

/** Private and atomic: a mode-600 temp file renamed over the old one, so a reader never sees half a token. */
function writePrivate(dir, name, text) {
	const tmp = join(dir, `.${name}.${process.pid}.tmp`);
	writeFileSync(tmp, `${text}\n`, { mode: 0o600 });
	renameSync(tmp, join(dir, name));
}

/** The tokens go only to an https site, or to this machine (the dev server). */
function assertSafeSite(url) {
	const { protocol, hostname } = new URL(url);
	if (protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
		throw new Error(`the AI token is sent only over https (or to localhost), not to ${protocol}//${hostname}`);
	}
}

/** The stored access token and its expiry (ms since the epoch; null when unknown). */
export function readAccess(dir = AI_TOKEN_DIR) {
	const expiresAt = Date.parse(read(dir, EXPIRES) ?? "");
	return { token: read(dir, ACCESS), expiresAt: Number.isNaN(expiresAt) ? null : expiresAt };
}

/** Exchanges the refresh token for a new access token, stores it with its expiry, and returns it. */
export async function refreshAccess(url, { dir = AI_TOKEN_DIR, fetch = globalThis.fetch, now = Date.now } = {}) {
	assertSafeSite(url);
	const refreshToken = read(dir, REFRESH);
	if (!refreshToken) throw new Error(`no AI refresh token in ${join(dir, REFRESH)}: ${NEW_DEVICE_CODE}`);
	const res = await fetch(`${url}/_emdash/api/oauth/token/refresh`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
	});
	const body = await res.json().catch(() => null);
	if (!res.ok) {
		const { code, message } = body?.error ?? {};
		const detail = code ? `${code}${message ? ` (${String(message).replaceAll(refreshToken, "…")})` : ""}` : `HTTP ${res.status}`;
		// INVALID_GRANT: the refresh token expired or was revoked, or the user was disabled or lost the scopes
		throw new Error(`AI token refresh failed: ${detail}${code === "INVALID_GRANT" ? `; ${NEW_DEVICE_CODE}` : ""}`);
	}
	const { access_token: token, expires_in: expiresIn } = body?.data ?? {};
	if (typeof token !== "string" || !/^\S+$/.test(token)) throw new Error("AI token refresh failed: the answer has no access token");
	// the token first: a crash between the two writes leaves an old expiry, which only makes the next run refresh again
	writePrivate(dir, ACCESS, token);
	const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
	writePrivate(dir, EXPIRES, new Date(now() + seconds * 1000).toISOString());
	return token;
}

/** A usable access token: the stored one while it has more than 5 minutes left, otherwise a refreshed one. */
export async function aiAccessToken(url, opts = {}) {
	assertSafeSite(url);
	const { token, expiresAt } = readAccess(opts.dir);
	if (token && expiresAt !== null && expiresAt - (opts.now ?? Date.now)() > MARGIN_MS) return token;
	return refreshAccess(url, opts);
}

/**
 * Calls `send(token)` with a usable access token. On a 401 it retries once: with the token another process stored
 * meanwhile (its refresh revoked ours), or else with a freshly refreshed one. A second 401 is returned as is.
 */
export async function withAiToken(url, send, opts = {}) {
	const token = await aiAccessToken(url, opts);
	const res = await send(token);
	if (res.status !== 401) return res;
	const stored = readAccess(opts.dir).token;
	return send(stored && stored !== token ? stored : await refreshAccess(url, opts));
}
