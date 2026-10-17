import { describe, expect, it } from "vitest";
import { logoSize } from "./tool-grid.mjs";

describe("logoSize", () => {
	it("keeps sizes in range and clamps the rest", () => {
		expect(logoSize(100)).toBe(100);
		expect(logoSize("48")).toBe(48);
		expect(logoSize(5)).toBe(16);
		expect(logoSize(99999)).toBe(300);
		expect(logoSize(72.6)).toBe(73);
	});
	it("uses the default for missing or invalid values", () => {
		for (const v of [undefined, null, 0, -10, "big", Number.NaN, Number.POSITIVE_INFINITY]) expect(logoSize(v)).toBe(72);
	});
});
