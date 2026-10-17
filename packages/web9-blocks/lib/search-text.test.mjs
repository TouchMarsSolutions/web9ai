import { describe, expect, it } from "vitest";
import { extractBlockText } from "./search-text.mjs";

const table = { _type: "table", _key: "tb", rows: [{ _type: "tableRow", _key: "r", cells: [{ _type: "tableCell", _key: "c", markDefs: [], content: [{ _type: "span", _key: "s", text: "cell", marks: ["strong"] }] }] }] };

describe("extractBlockText", () => {
	it("collects text from the listed block types and skips core nodes and non-text props", () => {
		const body = [
			{ _type: "block", _key: "p", children: [{ _type: "span", text: "core prose" }] },
			{ _type: "callout", _key: "c", tone: "tip", title: "Heads up", body: "callout **body**" },
			{ _type: "code", _key: "k", language: "bash", code: "npm i" },
			{ _type: "break", _key: "b", style: "line" },
			table,
			{ _type: "tabs", _key: "t", default_tab: 1, tabs: [{ label: "One", body: "tab body" }] },
			{ _type: "tool_grid", _key: "g", tools: [{ name: "Tool", tagline: "does things", url: "https://x", logo: "/img/x.png", featured: true }] },
		];
		expect(extractBlockText(body, new Set(["callout", "tabs", "tool_grid"]))).toBe("Heads up\ncallout **body**\nOne\ntab body\nTool\ndoes things");
	});
	it("skips block types that are not listed (core indexes table cells itself)", () => {
		expect(extractBlockText([table], new Set(["callout"]))).toBe("");
	});
	it("collects nothing when no types are given", () => {
		expect(extractBlockText([{ _type: "callout", _key: "c", title: "Heads up" }])).toBe("");
		expect(extractBlockText([{ _type: "callout", _key: "c", title: "Heads up" }], new Set())).toBe("");
	});
	it("skips code keys inside a walked block (core indexes them)", () => {
		expect(extractBlockText([{ _type: "mermaid", _key: "m", code: "graph TD; A-->B" }], new Set(["mermaid"]))).toBe("");
	});
	it("returns an empty string for a Markdown string body instead of copying ec:block JSON", () => {
		expect(extractBlockText('# Title\n\n<!--ec:block {"_type":"callout","title":"x"} -->', new Set(["callout"]))).toBe("");
	});
	it("walks a very deep value without recursing (a hook must not throw)", () => {
		let deep = "needle";
		for (let i = 0; i < 100000; i++) deep = [deep];
		expect(extractBlockText([{ _type: "callout", _key: "c", title: "T", body: deep }], new Set(["callout"]))).toBe("T\nneedle");
		let nested = "needle";
		for (let i = 0; i < 100000; i++) nested = { a: nested };
		expect(extractBlockText([{ _type: "callout", _key: "c", body: nested }], new Set(["callout"]))).toBe("needle");
	});
	it("keeps document order across nested arrays and objects", () => {
		const tabs = { _type: "tabs", _key: "t", title: "T", tabs: [{ label: "a", body: "b", more: [{ x: "c" }, "d"] }, { label: "e", body: "f" }], tail: "g" };
		expect(extractBlockText([tabs], new Set(["tabs"]))).toBe("T\na\nb\nc\nd\ne\nf\ng");
	});
	it("returns an empty string for missing bodies", () => {
		expect(extractBlockText(undefined, new Set(["callout"]))).toBe("");
	});
});
