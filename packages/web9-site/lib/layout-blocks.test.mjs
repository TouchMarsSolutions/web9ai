import { describe, expect, it } from "vitest";
import { featureGridItems, heroText } from "./layout-blocks.mjs";

const BAD = [JSON.parse('{"toString":1}'), 5, true, null, undefined, {}, ["a"]];

describe("heroText", () => {
	it("gives title and tagline as strings, '' for anything else", () => {
		expect(heroText({ title: "Web9", tagline: "AI" })).toEqual({ title: "Web9", tagline: "AI", image: undefined, alt: "" });
		for (const bad of BAD) expect(heroText({ title: bad, tagline: bad })).toEqual({ title: "", tagline: "", image: undefined, alt: "" });
		for (const block of [null, undefined, "x"]) expect(heroText(block)).toEqual({ title: "", tagline: "", image: undefined, alt: "" });
	});
	it("gives the image only when it is an object, and its alt as a string ('' otherwise, as core's <Image> would)", () => {
		const image = { id: "m", src: "/img/a.svg", alt: "A" };
		expect(heroText({ title: "T", image })).toEqual({ title: "T", tagline: "", image, alt: "A" });
		for (const alt of BAD) expect(heroText({ image: { ...image, alt } }).alt).toBe("");
		for (const bad of ["img", 5, ["a"], null]) expect(heroText({ image: bad }).image).toBeUndefined();
	});
});

describe("featureGridItems", () => {
	const image = { id: "m", src: "/img/a.svg", alt: "A" };
	it("keeps object features, text as strings, the image only when it is an object, its alt falling back to the title", () => {
		expect(
			featureGridItems({
				title: "Features",
				features: [{ title: "One", description: "d", image }, null, "x", [], { title: 5, description: { toString: 1 }, image: "img" }, { title: "T", image: { id: "n" } }],
			}),
		).toEqual({
			title: "Features",
			features: [
				{ title: "One", description: "d", image, alt: "A" },
				{ title: "", description: "", image: undefined, alt: "" },
				{ title: "T", description: "", image: { id: "n" }, alt: "T" },
			],
		});
	});
	it("keeps an empty alt (a decorative image) and reads a non-string alt as missing", () => {
		expect(featureGridItems({ features: [{ title: "T", image: { alt: "" } }] }).features[0].alt).toBe("");
		expect(featureGridItems({ features: [{ title: "T", image: { alt: JSON.parse('{"toString":1}') } }] }).features[0].alt).toBe("T");
	});
	it("gives no features for a missing or non-array list, and '' for a bad title", () => {
		for (const block of [null, undefined, {}, { features: 5 }, { features: { 0: {} } }]) expect(featureGridItems(block)).toEqual({ title: "", features: [] });
		for (const bad of BAD) expect(featureGridItems({ title: bad }).title).toBe("");
	});
});
