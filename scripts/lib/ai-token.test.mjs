import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiAccessToken, readAccess, refreshAccess, withAiToken } from "./ai-token.mjs";

const URL_ = "https://site.test";
const NOW = Date.parse("2026-10-17T12:00:00Z");
const now = () => NOW;
const REFRESH = "ec_ort_refresh_secret_value";
let dir;

const put = (name, text) => writeFileSync(join(dir, name), `${text}\n`, { mode: 0o600 });
const file = (name) => readFileSync(join(dir, name), "utf8").trim();
const mode = (name) => statSync(join(dir, name)).mode & 0o777;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const granted = (token, expiresIn = 3600) =>
	json(200, { data: { access_token: token, refresh_token: REFRESH, token_type: "Bearer", expires_in: expiresIn, scope: "content:read" } });

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "ai-token-"));
	put("ai-refresh-token", REFRESH);
});

describe("aiAccessToken", () => {
	it("returns the stored token while it has more than 5 minutes left, without a request", async () => {
		put("ai-access-token", "ec_oat_old");
		put("ai-access-token.expires-at", new Date(NOW + 6 * 60_000).toISOString());
		const fetch = vi.fn();
		expect(await aiAccessToken(URL_, { dir, fetch, now })).toBe("ec_oat_old");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("refreshes when the expiry is unknown, close or past", async () => {
		for (const expires of [null, "not a date", new Date(NOW + 4 * 60_000).toISOString(), new Date(NOW - 1000).toISOString()]) {
			put("ai-access-token", "ec_oat_old");
			if (expires === null) writeFileSync(join(dir, "ai-access-token.expires-at"), "");
			else put("ai-access-token.expires-at", expires);
			const fetch = vi.fn(async () => granted("ec_oat_new"));
			expect(await aiAccessToken(URL_, { dir, fetch, now }), String(expires)).toBe("ec_oat_new");
			expect(fetch).toHaveBeenCalledOnce();
		}
	});

	it("sends no token over plain http except to this machine", async () => {
		put("ai-access-token", "ec_oat_old");
		put("ai-access-token.expires-at", new Date(NOW + 30 * 60_000).toISOString());
		const fetch = vi.fn(async () => granted("ec_oat_new"));
		for (const url of ["http://www.web9.ai", "http://10.0.0.5:4321", "ftp://site.test"]) {
			await expect(aiAccessToken(url, { dir, fetch, now }), url).rejects.toThrow(/only over https/);
			await expect(refreshAccess(url, { dir, fetch, now }), url).rejects.toThrow(/only over https/);
		}
		expect(fetch).not.toHaveBeenCalled();
		for (const url of ["http://localhost:4321", "http://127.0.0.1:4321", "http://[::1]:4321"]) {
			expect(await aiAccessToken(url, { dir, fetch, now }), url).toBe("ec_oat_old");
		}
	});

	it("refreshes when there is no access token file yet", async () => {
		const fetch = vi.fn(async () => granted("ec_oat_new"));
		expect(await aiAccessToken(URL_, { dir, fetch, now })).toBe("ec_oat_new");
	});
});

describe("refreshAccess", () => {
	it("posts the refresh grant and stores the new token and its expiry, both mode 600", async () => {
		put("ai-access-token", "ec_oat_old");
		const fetch = vi.fn(async () => granted("ec_oat_new", 1800));
		expect(await refreshAccess(URL_, { dir, fetch, now })).toBe("ec_oat_new");
		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe(`${URL_}/_emdash/api/oauth/token/refresh`);
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body)).toEqual({ grant_type: "refresh_token", refresh_token: REFRESH });
		expect(file("ai-access-token")).toBe("ec_oat_new");
		expect(file("ai-access-token.expires-at")).toBe(new Date(NOW + 1800_000).toISOString());
		expect(mode("ai-access-token")).toBe(0o600);
		expect(mode("ai-access-token.expires-at")).toBe(0o600);
		expect(readAccess(dir)).toEqual({ token: "ec_oat_new", expiresAt: NOW + 1800_000 });
		expect(file("ai-refresh-token")).toBe(REFRESH);
	});

	it("assumes one hour when the answer has no usable expires_in", async () => {
		const fetch = vi.fn(async () => json(200, { data: { access_token: "ec_oat_new" } }));
		await refreshAccess(URL_, { dir, fetch, now });
		expect(file("ai-access-token.expires-at")).toBe(new Date(NOW + 3600_000).toISOString());
	});

	it("explains an expired or revoked refresh token and leaves the files alone", async () => {
		put("ai-access-token", "ec_oat_old");
		const fetch = vi.fn(async () => json(401, { error: { code: "INVALID_GRANT", message: "Refresh token expired" } }));
		const err = await refreshAccess(URL_, { dir, fetch, now }).catch((e) => e);
		expect(err.message).toMatch(/INVALID_GRANT \(Refresh token expired\).*device code/);
		expect(err.message).not.toContain(REFRESH);
		expect(file("ai-access-token")).toBe("ec_oat_old");
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
		for (const data of [{}, { access_token: "" }, { access_token: "two words" }, { access_token: 7 }]) {
			const fetch = vi.fn(async () => json(200, { data }));
			await expect(refreshAccess(URL_, { dir, fetch, now }), JSON.stringify(data)).rejects.toThrow(/no access token/);
		}
		expect(file("ai-access-token")).toBe("ec_oat_old");
	});

	it("fails before any request when the refresh token file is missing or empty", async () => {
		const empty = mkdtempSync(join(tmpdir(), "ai-token-"));
		writeFileSync(join(empty, "ai-refresh-token"), "\n");
		const fetch = vi.fn();
		for (const d of [mkdtempSync(join(tmpdir(), "ai-token-")), empty]) {
			await expect(refreshAccess(URL_, { dir: d, fetch, now })).rejects.toThrow(/no AI refresh token.*device code/);
		}
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("withAiToken", () => {
	beforeEach(() => {
		put("ai-access-token", "ec_oat_a");
		put("ai-access-token.expires-at", new Date(NOW + 30 * 60_000).toISOString());
	});

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
});
