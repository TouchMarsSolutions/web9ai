import { describe, expect, it } from "vitest";
import { DATA_LIMITS, LIMITS, clampText, lengthProblem } from "./limits.mjs";

describe("LIMITS", () => {
	it("holds the limits of spec 2026-10-17 §3.1", () => {
		expect(LIMITS).toEqual({ title: 200, description: 1000, excerpt: 1000, slug: 100, label: 80, url: 2048, menuItems: 50, titleAttr: 200, target: 32 });
		expect(DATA_LIMITS).toEqual({ title: 200, description: 1000, excerpt: 1000 });
		expect(Object.isFrozen(LIMITS)).toBe(true);
		expect(Object.isFrozen(DATA_LIMITS)).toBe(true);
	});
});

describe("lengthProblem", () => {
	it("reports a string over the limit, with its length", () => {
		expect(lengthProblem("slug", "a".repeat(101), 100)).toBe("slug: at most 100 characters (got 101)");
		expect(lengthProblem("slug", "a".repeat(100), 100)).toBeNull();
	});
	it("ignores anything but a string (core validates types)", () => {
		for (const v of [undefined, null, 5, ["a".repeat(200)], { length: 999 }]) expect(lengthProblem("slug", v, 100)).toBeNull();
	});
});

describe("clampText", () => {
	it("cuts a long string to max units, ending in …", () => {
		expect(clampText("abcdef", 4)).toBe("abc…");
		expect(clampText("abcd", 4)).toBe("abcd");
		expect(clampText("a".repeat(100), 80)).toHaveLength(80);
	});
	it("never splits a surrogate pair", () => {
		const s = "ab😀cd"; // 😀 is two UTF-16 units, at 2 and 3
		expect(clampText(s, 4)).toBe("ab…");
		expect(clampText(s, 5)).toBe("ab😀…");
	});
	it("returns anything but a string unchanged", () => {
		for (const v of [undefined, null, 5, { a: 1 }]) expect(clampText(v, 3)).toBe(v);
	});
});
