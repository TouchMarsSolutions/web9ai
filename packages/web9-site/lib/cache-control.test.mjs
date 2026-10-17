import { describe, expect, it } from "vitest";
import { cacheControl, cacheControlFor, isUnshared, SHARED_CACHE_CONTROL, UNSHARED_CACHE_CONTROL } from "./cache-control.mjs";

const ctx = ({ user, editCookie, search = "" } = {}) => ({
	locals: user === undefined ? {} : { user },
	cookies: { get: (name) => (name === "emdash-edit-mode" && editCookie !== undefined ? { value: editCookie } : undefined) },
	url: new URL(`https://www.web9.ai/llms.txt${search}`),
});

describe("isUnshared", () => {
	it("is false for an anonymous request", () => {
		expect(isUnshared(ctx())).toBe(false);
	});
	it("is true for a signed-in user (core sets locals.user on public routes)", () => {
		expect(isUnshared(ctx({ user: { id: "u1" } }))).toBe(true);
		expect(isUnshared(ctx({ user: undefined }))).toBe(false);
		expect(isUnshared(ctx({ user: null }))).toBe(false);
	});
	it("is true when the edit-mode cookie is exactly true", () => {
		expect(isUnshared(ctx({ editCookie: "true" }))).toBe(true);
		expect(isUnshared(ctx({ editCookie: "false" }))).toBe(false);
		expect(isUnshared(ctx({ editCookie: "" }))).toBe(false);
	});
	it("is true whenever a _preview param is present, valid or not", () => {
		expect(isUnshared(ctx({ search: "?_preview=abc.def" }))).toBe(true);
		expect(isUnshared(ctx({ search: "?_preview=" }))).toBe(true);
		expect(isUnshared(ctx({ search: "?_preview" }))).toBe(true);
		expect(isUnshared(ctx({ search: "?preview=1&x=_preview" }))).toBe(false);
	});
	it("treats a context without locals, cookies or url as anonymous", () => {
		expect(isUnshared({})).toBe(false);
	});
});

describe("cacheControl", () => {
	it("is public for five minutes when shared and private, no-store otherwise", () => {
		expect(SHARED_CACHE_CONTROL).toBe("public, max-age=300");
		expect(UNSHARED_CACHE_CONTROL).toBe("private, no-store");
		expect(cacheControl(ctx())).toBe("public, max-age=300");
		expect(cacheControl(ctx({ editCookie: "true" }))).toBe("private, no-store");
		expect(cacheControl(ctx({ user: { id: "u1" } }))).toBe("private, no-store");
		expect(cacheControl(ctx({ search: "?_preview=x" }))).toBe("private, no-store");
	});
});

describe("cacheControlFor", () => {
	it("marks a shared 200 public and leaves a shared 404 unmarked", () => {
		expect(cacheControlFor(ctx(), 200)).toBe("public, max-age=300");
		expect(cacheControlFor(ctx(), 404)).toBeUndefined();
	});
	it("never lets a shared cache keep an error", () => {
		for (const status of [500, 502, 503]) expect(cacheControlFor(ctx(), status)).toBe("no-store");
	});
	it("answers an editor, edit mode or preview request privately, whatever the status", () => {
		for (const c of [ctx({ user: { id: "u" } }), ctx({ editCookie: "true" }), ctx({ search: "?_preview=x" })]) {
			for (const status of [200, 404, 503]) expect(cacheControlFor(c, status)).toBe("private, no-store");
		}
	});
	it("defaults to a 200", () => {
		expect(cacheControlFor(ctx())).toBe("public, max-age=300");
		expect(cacheControlFor(ctx({ editCookie: "true" }))).toBe("private, no-store");
	});
});
