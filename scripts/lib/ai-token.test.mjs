import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiAccessToken, readAccess, refreshAccess, withAiToken } from "./ai-token.mjs";

const URL_ = "https://site.test";
const NOW = Date.parse("2026-10-17T12:00:00Z");
const now = () => NOW;
const REFRESH = "ec_ort_refresh_secret_value";
let dir;

const put = (name, text, mode = 0o600) => writeFileSync(join(dir, name), `${text}\n`, { mode });
const file = (name) => readFileSync(join(dir, name), "utf8").trim();
const mode = (name) => statSync(join(dir, name)).mode & 0o777;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const granted = (token, expiresIn = 3600, refreshToken = REFRESH) =>
	json(200, { data: { access_token: token, refresh_token: refreshToken, token_type: "Bearer", expires_in: expiresIn, scope: "content:read" } });
const valid = (minutes) => {
	put("ai-access-token", "ec_oat_a");
	put("ai-access-token.expires-at", new Date(NOW + minutes * 60_000).toISOString());
};

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "ai-token-"));
	put("ai-refresh-token", REFRESH);
});

describe("aiAccessToken", () => {
	it("returns the stored token while it has more than 5 minutes left, without a request", async () => {
		valid(5 + 1 / 60);
		const fetch = vi.fn();
		expect(await aiAccessToken(URL_, { dir, fetch, now })).toBe("ec_oat_a");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("refreshes at exactly 5 minutes left, and when the expiry is unknown or past", async () => {
		for (const expires of [new Date(NOW + 5 * 60_000).toISOString(), null, "not a date", new Date(NOW - 1000).toISOString()]) {
			put("ai-access-token", "ec_oat_a");
			if (expires === null) writeFileSync(join(dir, "ai-access-token.expires-at"), "");
			else put("ai-access-token.expires-at", expires);
			const fetch = vi.fn(async () => granted("ec_oat_new"));
			expect(await aiAccessToken(URL_, { dir, fetch, now }), String(expires)).toBe("ec_oat_new");
			expect(fetch).toHaveBeenCalledOnce();
		}
	});

	it("refreshes when the access token file is missing or holds no single printable token", async () => {
		for (const stored of [null, "two words", "tab\there", "nul\u0000x"]) {
			if (stored !== null) put("ai-access-token", stored);
			put("ai-access-token.expires-at", new Date(NOW + 30 * 60_000).toISOString());
			const fetch = vi.fn(async () => granted("ec_oat_new"));
			expect(await aiAccessToken(URL_, { dir, fetch, now }), JSON.stringify(stored)).toBe("ec_oat_new");
		}
	});

	it("sends no token over plain http except to this machine", async () => {
		valid(30);
		const fetch = vi.fn(async () => granted("ec_oat_new"));
		const refused = ["http://www.web9.ai", "http://10.0.0.5:4321", "ftp://site.test", "http://localhost.evil.com", "http://localhost@evil.com", "http://127.0.0.1.nip.io"];
		for (const url of refused) {
			await expect(aiAccessToken(url, { dir, fetch, now }), url).rejects.toThrow(/only over https/);
			await expect(refreshAccess(url, { dir, fetch, now }), url).rejects.toThrow(/only over https/);
		}
		expect(fetch).not.toHaveBeenCalled();
		for (const url of ["http://localhost:4321", "http://127.0.0.1:4321", "http://[::1]:4321"]) {
			expect(await aiAccessToken(url, { dir, fetch, now }), url).toBe("ec_oat_a");
		}
	});

	it("records the issuing site on the first refresh and sends no token to any other", async () => {
		const fetch = vi.fn(async () => granted("ec_oat_new"));
		await aiAccessToken(`${URL_}/`, { dir, fetch, now });
		expect(file("ai-token-site")).toBe(URL_);
		expect(mode("ai-token-site")).toBe(0o600);
		fetch.mockClear();
		for (const url of ["https://site.tset", "https://www.site.test", "http://localhost:4321"]) {
			await expect(aiAccessToken(url, { dir, fetch, now }), url).rejects.toThrow(`issued by ${URL_}`);
			await expect(refreshAccess(url, { dir, fetch, now }), url).rejects.toThrow(`issued by ${URL_}`);
		}
		expect(fetch).not.toHaveBeenCalled();
		expect(await aiAccessToken(`${URL_}/any/path`, { dir, fetch, now })).toBe("ec_oat_new");
	});
});

describe("refreshAccess", () => {
	it("posts the refresh grant, without following redirects, and stores the new token and its expiry", async () => {
		put("ai-access-token", "ec_oat_old", 0o644); // only a rename over it, not an in-place write, makes it 600
		const fetch = vi.fn(async () => granted("ec_oat_new", 1800));
		expect(await refreshAccess(`${URL_}/`, { dir, fetch, now })).toBe("ec_oat_new");
		const [url, init] = fetch.mock.calls[0];
		expect(String(url)).toBe(`${URL_}/_emdash/api/oauth/token/refresh`);
		expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "X-EmDash-Request": "1" } });
		expect(init.signal).toBeInstanceOf(AbortSignal);
		expect(JSON.parse(init.body)).toEqual({ grant_type: "refresh_token", refresh_token: REFRESH });
		expect(file("ai-access-token")).toBe("ec_oat_new");
		expect(file("ai-access-token.expires-at")).toBe(new Date(NOW + 1800_000).toISOString());
		expect(mode("ai-access-token")).toBe(0o600);
		expect(mode("ai-access-token.expires-at")).toBe(0o600);
		expect(readAccess(dir)).toEqual({ token: "ec_oat_new", expiresAt: NOW + 1800_000 });
		expect(file("ai-refresh-token")).toBe(REFRESH);
		expect(readdirSync(dir).filter((f) => f.endsWith(".tmp") || f.endsWith(".lock"))).toEqual([]);
	});

	it("assumes one hour when expires_in is missing or not a sane number of seconds", async () => {
		for (const expiresIn of [undefined, 0, -5, "3600", 1e300]) {
			const fetch = vi.fn(async () => json(200, { data: { access_token: "ec_oat_new", expires_in: expiresIn } }));
			await refreshAccess(URL_, { dir, fetch, now });
			expect(file("ai-access-token.expires-at"), String(expiresIn)).toBe(new Date(NOW + 3600_000).toISOString());
		}
	});

	it("stores a rotated refresh token", async () => {
		const fetch = vi.fn(async () => granted("ec_oat_new", 3600, "ec_ort_rotated"));
		await refreshAccess(URL_, { dir, fetch, now });
		expect(file("ai-refresh-token")).toBe("ec_ort_rotated");
		expect(mode("ai-refresh-token")).toBe(0o600);
	});

	it("explains an expired or revoked refresh token and leaves the files alone", async () => {
		put("ai-access-token", "ec_oat_old");
		const fetch = vi.fn(async () => json(400, { error: { code: "INVALID_GRANT", message: "Refresh token expired" } }));
		const err = await refreshAccess(URL_, { dir, fetch, now }).catch((e) => e);
		expect(err.message).toMatch(/INVALID_GRANT \(Refresh token expired\).*device code/);
		expect(err.message).not.toContain(REFRESH);
		expect(file("ai-access-token")).toBe("ec_oat_old");
		expect(existsSync(join(dir, "ai-token-site"))).toBe(false);
		expect(existsSync(join(dir, "ai-access-token.lock"))).toBe(false);
	});

	it("never repeats a token the server echoes in its error message", async () => {
		const fetch = vi.fn(async () => json(400, { error: { code: "X", message: `bad ${REFRESH}` } }));
		const err = await refreshAccess(URL_, { dir, fetch, now }).catch((e) => e);
		expect(err.message).not.toContain(REFRESH);
	});

	it("reports the HTTP status when the answer is not JSON", async () => {
		const fetch = vi.fn(async () => new Response("<html>oops</html>", { status: 502 }));
		await expect(refreshAccess(URL_, { dir, fetch, now })).rejects.toThrow("AI token refresh failed: HTTP 502");
	});

	it("rejects a 200 without a usable access token and keeps the old one", async () => {
		put("ai-access-token", "ec_oat_old");
		for (const data of [{}, { access_token: "" }, { access_token: "two words" }, { access_token: "ctl\u0001x" }, { access_token: 7 }]) {
			const fetch = vi.fn(async () => json(200, { data }));
			await expect(refreshAccess(URL_, { dir, fetch, now }), JSON.stringify(data)).rejects.toThrow(/no access token/);
		}
		expect(file("ai-access-token")).toBe("ec_oat_old");
	});

	it("fails before any request when the refresh token file is missing, empty or not a token", async () => {
		const fetch = vi.fn();
		const missing = mkdtempSync(join(tmpdir(), "ai-token-"));
		await expect(refreshAccess(URL_, { dir: missing, fetch, now })).rejects.toThrow(/no AI refresh token.*device code/);
		put("ai-refresh-token", "");
		await expect(refreshAccess(URL_, { dir, fetch, now })).rejects.toThrow(/no AI refresh token/);
		put("ai-refresh-token", "ec_ort_a\nec_ort_b");
		const err = await refreshAccess(URL_, { dir, fetch, now }).catch((e) => e);
		expect(err.message).toMatch(/is not a token.*device code/);
		expect(err.message).not.toContain("ec_ort_a");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("takes over a lock left by a process that died", async () => {
		put("ai-access-token.lock", "");
		const old = Date.now() / 1000 - 120;
		utimesSync(join(dir, "ai-access-token.lock"), old, old);
		const fetch = vi.fn(async () => granted("ec_oat_new"));
		expect(await refreshAccess(URL_, { dir, fetch })).toBe("ec_oat_new");
		expect(existsSync(join(dir, "ai-access-token.lock"))).toBe(false);
	});
});

describe("withAiToken", () => {
	beforeEach(() => valid(30));

	it("sends once with the stored token when it is accepted", async () => {
		const send = vi.fn(async () => new Response("ok"));
		const fetch = vi.fn();
		expect((await withAiToken(URL_, send, { dir, fetch, now })).status).toBe(200);
		expect(send.mock.calls).toEqual([["ec_oat_a"]]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("on a 401, retries with a token another process stored meanwhile, without refreshing", async () => {
		const send = vi.fn(async (token) => {
			if (token === "ec_oat_a") {
				put("ai-access-token", "ec_oat_b"); // another process refreshed, which revoked ec_oat_a
				return new Response("", { status: 401 });
			}
			return new Response("ok");
		});
		const fetch = vi.fn();
		expect((await withAiToken(URL_, send, { dir, fetch, now })).status).toBe(200);
		expect(send.mock.calls).toEqual([["ec_oat_a"], ["ec_oat_b"]]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("on a 401 with the same stored token, refreshes once and retries", async () => {
		const send = vi.fn(async (token) => new Response("", { status: token === "ec_oat_new" ? 200 : 401 }));
		const fetch = vi.fn(async () => granted("ec_oat_new"));
		expect((await withAiToken(URL_, send, { dir, fetch, now })).status).toBe(200);
		expect(send.mock.calls).toEqual([["ec_oat_a"], ["ec_oat_new"]]);
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("returns the second 401 instead of looping", async () => {
		const send = vi.fn(async () => new Response("", { status: 401 }));
		const fetch = vi.fn(async () => granted("ec_oat_new"));
		expect((await withAiToken(URL_, send, { dir, fetch, now })).status).toBe(401);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it("refreshes once for many concurrent callers, against a server that revokes on refresh", async () => {
		valid(4); // inside the 5-minute window: every caller wants a refresh
		let valid_ = "ec_oat_a";
		let issued = 0;
		const fetch = vi.fn(async () => {
			await new Promise((r) => setTimeout(r, Math.random() * 20));
			valid_ = `ec_oat_${++issued}`; // a refresh revokes every earlier access token
			return granted(valid_);
		});
		const send = async (token) => {
			await new Promise((r) => setTimeout(r, Math.random() * 20));
			return new Response("", { status: token === valid_ ? 200 : 401 });
		};
		const results = await Promise.all(Array.from({ length: 6 }, () => withAiToken(URL_, send, { dir, fetch, now })));
		expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
		expect(fetch).toHaveBeenCalledOnce();
		expect(file("ai-access-token")).toBe("ec_oat_1");
	});
});
