import { describe, expect, it } from "vitest";
import { blockText, headingAnchors, idsByKey, isHeading, legacyIdsFor, tocEntries } from "./anchors.mjs";

const span = (text, marks = []) => ({ _type: "span", text, marks });
const h = (style, text, _key) => ({ _type: "block", _key, style, children: [span(text)] });

describe("blockText", () => {
	it("joins the text of the children, marked spans included, and ignores anything else", () => {
		expect(blockText({ children: [span("Why do we need "), span("class", ["code"]), span("?")] })).toBe("Why do we need class?");
		expect(blockText({ children: [span("a"), { _type: "image" }, null, span("b")] })).toBe("ab");
		expect(blockText({})).toBe("");
		expect(blockText(null)).toBe("");
	});
});

describe("isHeading", () => {
	it("is true for text blocks styled h2 to h6 only", () => {
		for (const style of ["h2", "h3", "h4", "h5", "h6"]) expect(isHeading(h(style, "x", "k")), style).toBe(true);
		for (const style of ["h1", "normal", "blockquote", "h7", undefined]) expect(isHeading(h(style, "x", "k")), String(style)).toBe(false);
		expect(isHeading({ _type: "code", style: "h2" })).toBe(false);
		expect(isHeading(null)).toBe(false);
	});
});

describe("headingAnchors", () => {
	it("slugs headings as the old site did (expected ids copied from its pages)", () => {
		const body = [
			h("h2", "Outline - 3 Modules", "a"),
			h("h2", "大纲 - 3大模块", "b"),
			h("h2", "目的 - Have Fun", "c"),
			h("h3", "LLM之5虎上将", "d"),
			h("h2", "Programming Code", "e"),
			h("h2", "bonus - package", "f"),
		];
		expect(headingAnchors(body).map((a) => a.id)).toEqual([
			"outline---3-modules",
			"大纲---3大模块",
			"目的---have-fun",
			"llm之5虎上将",
			"programming-code",
			"bonus---package",
		]);
	});
	it("slugs the text of every span, inline code included", () => {
		const body = [{ _type: "block", _key: "k", style: "h3", children: [span("Why do we need "), span("class", ["code"]), span("?")] }];
		expect(headingAnchors(body)).toEqual([{ key: "k", level: 3, text: "Why do we need class?", id: "why-do-we-need-class" }]);
	});
	it("de-duplicates repeated text across levels with -1, -2", () => {
		const body = [h("h2", "Breakdown", "a"), h("h3", "Breakdown", "b"), h("h4", "Breakdown", "c")];
		expect(headingAnchors(body).map((a) => a.id)).toEqual(["breakdown", "breakdown-1", "breakdown-2"]);
	});
	it("takes the old site's custom id first, once per text; like Docusaurus, a custom id does not reserve its slug", () => {
		const legacy = { "What NOT ?": "what-is-not", Function: "function" };
		const body = [h("h3", "What NOT ?", "a"), h("h2", "Function", "b"), h("h2", "function", "c"), h("h3", "What NOT ?", "d")];
		expect(headingAnchors(body, legacy).map((a) => a.id)).toEqual(["what-is-not", "function", "function", "what-not-"]);
	});
	it("gives a block without _key the plain slug of its text: not de-duplicated, no custom id", () => {
		const keyless = { _type: "block", style: "h2", children: [span("Same")] };
		expect(headingAnchors([keyless, keyless, h("h2", "Same", "k")], { Same: "custom" })).toEqual([
			{ key: null, level: 2, text: "Same", id: "same" },
			{ key: null, level: 2, text: "Same", id: "same" },
			{ key: "k", level: 2, text: "Same", id: "custom" },
		]);
	});
	it("gives an empty heading no id and skips everything that is not an h2-h6 text block", () => {
		const body = [h("h2", "  ", "a"), h("h1", "Title", "b"), h("normal", "Text", "c"), { _type: "code", _key: "d", code: "x" }, null, "x"];
		expect(headingAnchors(body)).toEqual([{ key: "a", level: 2, text: "  ", id: "" }]);
		expect(headingAnchors(undefined)).toEqual([]);
	});
});

describe("tocEntries", () => {
	it("keeps the h2 and h3 entries that have an id", () => {
		const anchors = headingAnchors([h("h2", "A", "a"), h("h3", "B", "b"), h("h4", "C", "c"), h("h2", " ", "d")]);
		expect(tocEntries(anchors).map((a) => a.id)).toEqual(["a", "b"]);
	});
});

describe("idsByKey", () => {
	it("maps each keyed heading that has an id to that id", () => {
		const keyless = { _type: "block", style: "h2", children: [span("B")] };
		expect(idsByKey(headingAnchors([h("h2", "A", "a"), keyless, h("h3", " ", "e")]))).toEqual({ a: "a" });
	});
});

describe("legacyIdsFor", () => {
	it("returns one doc's custom ids, or none", () => {
		expect(legacyIdsFor("en", "learn_ai_coding")["What NOT ?"]).toBe("what-is-not");
		expect(legacyIdsFor("zh-CN", "learn_ai_coding")["函数"]).toBe("function");
		expect(legacyIdsFor("en", "no-such-doc")).toEqual({});
	});
});
