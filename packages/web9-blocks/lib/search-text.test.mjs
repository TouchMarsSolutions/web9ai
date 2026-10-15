import { describe, expect, it } from "vitest";
import { extractBlockText } from "./search-text.mjs";

describe("extractBlockText", () => {
	it("collects text from non-core blocks and skips core blocks and non-text props", () => {
		const body = [
			{ _type: "block", _key: "p", children: [{ _type: "span", text: "core prose" }] },
			{ _type: "callout", _key: "c", tone: "tip", title: "Heads up", body: "callout **body**" },
			{ _type: "tabs", _key: "t", default_tab: 1, tabs: [{ label: "One", body: "tab body" }] },
			{ _type: "tool_grid", _key: "g", tools: [{ name: "Tool", tagline: "does things", url: "https://x", logo: "/img/x.png", featured: true }] },
		];
		expect(extractBlockText(body)).toBe("Heads up\ncallout **body**\nOne\ntab body\nTool\ndoes things");
	});
	it("reads table cell spans but not their marks", () => {
		const table = { _type: "table", _key: "tb", rows: [{ _type: "tableRow", _key: "r", cells: [{ _type: "tableCell", _key: "c", markDefs: [], content: [{ _type: "span", _key: "s", text: "cell", marks: ["strong"] }] }] }] };
		expect(extractBlockText([table])).toBe("cell");
	});
	it("passes Markdown bodies through (MCP accepts Markdown)", () => {
		expect(extractBlockText("# Title\n\ntext")).toBe("# Title\n\ntext");
	});
	it("returns an empty string for missing bodies", () => {
		expect(extractBlockText(undefined)).toBe("");
	});
});
