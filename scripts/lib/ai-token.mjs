// The AI Editor account's OAuth tokens (spec 2026-10-17-ai-pat-preconditions §3.5): an access token that lasts an hour
// and a refresh token that lasts 90 days, in .local/ai-access-token and .local/ai-refresh-token (mode 600, never
// committed). A refresh issues a new access token and revokes every earlier one at once, so refreshes are serialized
// with a lock file and each caller re-reads the files under it: one refresh per expiry, however many processes run.
// The access token's expiry is not in the token, so each refresh writes it to .local/ai-access-token.expires-at. The
// issuing site is recorded in .local/ai-token-site by `scripts/ai-token.mjs refresh`, run once after a device flow; no
// token is sent to any other site, and until that file exists only that command sends one. Nothing here prints or
// throws a token.
import { randomBytes } from "node:crypto";
import { closeSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const AI_TOKEN_DIR = fileURLToPath(new URL("../../.local/", import.meta.url));
const ACCESS = "ai-access-token";
const EXPIRES = "ai-access-token.expires-at";
const REFRESH = "ai-refresh-token";
const SITE = "ai-token-site";
const LOCK = "ai-access-token.lock";
/** Renew this long before the expiry, so a token never runs out in the middle of a run. */
const MARGIN_MS = 5 * 60_000;
/** A refresh gives up after 15 s, so a lock older than 30 s was left by a process that died (say, Ctrl-C). */
const REFRESH_TIMEOUT_MS = 15_000;
const LOCK_STALE_MS = 30_000;
/** Longer than LOCK_STALE_MS, so a waiter outlives a dead holder's lock and takes it over. */
const LOCK_WAIT_MS = 45_000;
/** Printable ASCII only: anything else would make fetch throw an error that quotes the whole header. */
const TOKEN = /^[\x21-\x7e]+$/;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const NEW_DEVICE_CODE = "approve a new device code as ai-agent@web9.ai (spec 2026-10-17-ai-pat-preconditions §3.5)";

function read(dir, name) {
	try {
		return readFileSync(join(dir, name), "utf8").trim() || null;
	} catch (e) {
		if (e.code === "ENOENT") return null;
		throw e;
	}
}

/** Private and atomic: a new mode-600 temp file renamed over the old one, so a reader never sees half a token. */
function writePrivate(dir, name, text) {
	const tmp = join(dir, `.${name}.${randomBytes(6).toString("hex")}.tmp`);
	try {
		writeFileSync(tmp, `${text}\n`, { mode: 0o600, flag: "wx" });
		renameSync(tmp, join(dir, name));
	} catch (e) {
		rmSync(tmp, { force: true });
		throw e;
	}
}

function readRefresh(dir) {
	const token = read(dir, REFRESH);
	if (!token) throw new Error(`no AI refresh token in ${join(dir, REFRESH)}: ${NEW_DEVICE_CODE}`);
	if (!TOKEN.test(token)) throw new Error(`${join(dir, REFRESH)} is not a token: ${NEW_DEVICE_CODE}`);
	return token;
}

/**
 * The site's origin, once it is https (or this machine) and the one recorded as the issuer (only `pin` may go on
 * without a record, and the refresh then records it).
 */
function checkSite(dir, url, { pin = false } = {}) {
	const { protocol, hostname, origin } = new URL(url);
	if (protocol !== "https:" && !LOCAL_HOSTS.includes(hostname)) {
		throw new Error(`the AI token is sent only over https (or to localhost), not to ${protocol}//${hostname}`);
	}
	const issuer = read(dir, SITE);
	if (!issuer && !pin) {
		throw new Error(`no ${join(dir, SITE)}: after a device flow, run EMDASH_URL=<site> node scripts/ai-token.mjs refresh once`);
	}
	if (issuer && issuer !== origin) {
		throw new Error(`the AI token was issued by ${issuer}, not ${origin} (after a device flow on another site, delete ${join(dir, SITE)})`);
	}
	return origin;
}

/** Runs `fn` (a refresh) under the lock; the refresh token is checked first, so a missing .local gets its message. */
async function withLock(dir, fn) {
	readRefresh(dir);
	const lock = join(dir, LOCK);
	const start = Date.now();
	for (;;) {
		try {
			closeSync(openSync(lock, "wx", 0o600));
			break;
		} catch (e) {
			if (e.code !== "EEXIST") throw e;
		}
		let age = 0;
		try {
			age = Date.now() - statSync(lock).mtimeMs;
		} catch {} // released meanwhile: try again
		// two waiters can take over the same dead lock and both refresh; the 401 retry then settles on the newer token
		if (age > LOCK_STALE_MS) rmSync(lock, { force: true });
		else if (Date.now() - start > LOCK_WAIT_MS) throw new Error(`AI token: ${lock} is still held after ${LOCK_WAIT_MS / 1000} s`);
		await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
	}
	try {
		return await fn();
	} finally {
		rmSync(lock, { force: true });
	}
}

/** The origin recorded as the tokens' issuer, or null. */
export const readSite = (dir = AI_TOKEN_DIR) => read(dir, SITE);

/** The stored access token (null when missing or malformed) and its expiry (ms since the epoch; null when unknown). */
export function readAccess(dir = AI_TOKEN_DIR) {
	const expiresAt = Date.parse(read(dir, EXPIRES) ?? "");
	const token = read(dir, ACCESS);
	return { token: token && TOKEN.test(token) ? token : null, expiresAt: Number.isNaN(expiresAt) ? null : expiresAt };
}

const fresh = (dir, now) => {
	const { token, expiresAt } = readAccess(dir);
	return token && expiresAt !== null && expiresAt - now() > MARGIN_MS ? token : null;
};

// The caller holds the lock.
async function refresh(origin, { dir = AI_TOKEN_DIR, fetch = globalThis.fetch, now = Date.now } = {}) {
	const refreshToken = readRefresh(dir);
	const res = await fetch(new URL("/_emdash/api/oauth/token/refresh", origin), {
		method: "POST",
		// the header passes emdash's CSRF check on public routes whatever Origin the runtime sends
		headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
		body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
		// a redirect would re-post the refresh token to wherever Location points, past checkSite
		redirect: "error",
		signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
	});
	// a body that is not JSON reads as none; a timeout while reading it still throws
	const body = await res.json().catch((e) => {
		if (e instanceof SyntaxError) return null;
		throw e;
	});
	if (!res.ok) {
		const { code, message } = body?.error ?? {};
		const detail = code ? `${code}${message ? ` (${String(message).replaceAll(refreshToken, "…")})` : ""}` : `HTTP ${res.status}`;
		// INVALID_GRANT: the refresh token expired or was revoked, or the user was disabled or lost the scopes
		throw new Error(`AI token refresh failed: ${detail}${code === "INVALID_GRANT" ? `; ${NEW_DEVICE_CODE}` : ""}`);
	}
	const { access_token: token, refresh_token: rotated, expires_in: expiresIn } = body?.data ?? {};
	if (typeof token !== "string" || !TOKEN.test(token)) throw new Error("AI token refresh failed: the answer has no access token");
	const seconds = Number.isFinite(expiresIn) && expiresIn > 0 && expiresIn <= 86_400 ? expiresIn : 3600;
	const expires = new Date(now() + seconds * 1000).toISOString();
	// emdash does not rotate refresh tokens today; if it starts to, the old one is already revoked
	if (typeof rotated === "string" && TOKEN.test(rotated) && rotated !== refreshToken) writePrivate(dir, REFRESH, rotated);
	// the token first: a crash between the two writes leaves an old expiry, which only makes the next run refresh again
	writePrivate(dir, ACCESS, token);
	writePrivate(dir, EXPIRES, expires);
	if (!read(dir, SITE)) writePrivate(dir, SITE, origin);
	return token;
}

/**
 * Exchanges the refresh token for a new access token, stores it with its expiry, and returns it. This is
 * `scripts/ai-token.mjs refresh`, the one call that may record the issuing site.
 */
export async function refreshAccess(url, opts = {}) {
	const dir = opts.dir ?? AI_TOKEN_DIR;
	const origin = checkSite(dir, url, { pin: true });
	return withLock(dir, () => refresh(origin, opts));
}

/** A usable access token: the stored one while it has more than 5 minutes left, otherwise a refreshed one. */
export async function aiAccessToken(url, opts = {}) {
	const dir = opts.dir ?? AI_TOKEN_DIR;
	const now = opts.now ?? Date.now;
	const origin = checkSite(dir, url);
	return fresh(dir, now) ?? withLock(dir, async () => fresh(dir, now) ?? refresh(origin, opts));
}

/**
 * Calls `send(token)` with a usable access token. On a 401 it retries once, with the token stored since (another
 * process's refresh revoked ours) or else a freshly refreshed one; both under the lock. A second 401 is returned as is.
 */
export async function withAiToken(url, send, opts = {}) {
	const dir = opts.dir ?? AI_TOKEN_DIR;
	const token = await aiAccessToken(url, opts);
	const res = await send(token);
	if (res.status !== 401) return res;
	await res.body?.cancel();
	const origin = checkSite(dir, url);
	const retry = await withLock(dir, async () => {
		const stored = readAccess(dir).token;
		return stored && stored !== token ? stored : refresh(origin, opts);
	});
	return send(retry);
}
