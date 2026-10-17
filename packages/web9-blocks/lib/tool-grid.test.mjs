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
	it("drops every item that is not a plain object, arrays included", () => {
		const ok = { name: "ok" };
		expect(toolItems({ tools: [null, undefined, "x", 5, true, [], [ok], ok] })).toEqual([{ name: "ok", tagline: "", url: "", logo: "", featured: false }]);
	});
	it("turns each text field that is not a string into an empty string, one field at a time", () => {
		for (const field of ["name", "tagline", "url", "logo"]) {
			for (const bad of [5, 0, null, undefined, true, {}, [], ["a"], { toString: () => "x" }]) {
				const [tool] = toolItems({ tools: [{ name: "n", tagline: "t", url: "/u", logo: "/l.png", [field]: bad }] });
				expect(tool[field], `${field}: ${String(bad)}`).toBe("");
				for (const other of ["name", "tagline", "url", "logo"].filter((f) => f !== field)) expect(tool[other]).not.toBe("");
			}
		}
	});
	it("marks a tool featured only for the boolean true, never for a truthy value", () => {
		const featured = (value) => toolItems({ tools: [{ featured: value }] })[0].featured;
		expect(featured(true)).toBe(true);
		for (const value of [1, "true", "yes", "1", {}, [], [true], false, 0, "", null, undefined]) expect(featured(value), JSON.stringify(value)).toBe(false);
	});
});
