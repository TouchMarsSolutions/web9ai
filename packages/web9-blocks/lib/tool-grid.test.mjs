import { describe, expect, it } from "vitest";
import { logoSize, toolItems } from "./tool-grid.mjs";

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

describe("toolItems", () => {
	it("keeps object tools, text fields as strings, featured only when true", () => {
		expect(
			toolItems({
				tools: [
					{ name: "Coze", tagline: "AI **Agent**", logo: "/img/c.png", url: "https://www.coze.com/", featured: true },
					null,
					"x",
					{ name: 5, tagline: 6, logo: {}, url: [], featured: "yes" },
				],
			}),
		).toEqual([
			{ name: "Coze", tagline: "AI **Agent**", logo: "/img/c.png", url: "https://www.coze.com/", featured: true },
			{ name: "", tagline: "", logo: "", url: "", featured: false },
		]);
	});
	it("gives no tools for a missing or non-array list", () => {
		for (const node of [undefined, null, {}, { tools: 5 }]) expect(toolItems(node)).toEqual([]);
	});
});
