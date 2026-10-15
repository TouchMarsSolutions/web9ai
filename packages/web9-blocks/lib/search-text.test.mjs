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
	it("passes Markdown bodies through (MCP accepts Markdown)", () => {
		expect(extractBlockText("# Title\n\ntext", new Set(["callout"]))).toBe("# Title\n\ntext");
	});
	it("returns an empty string for missing bodies", () => {
		expect(extractBlockText(undefined, new Set(["callout"]))).toBe("");
	});
});
