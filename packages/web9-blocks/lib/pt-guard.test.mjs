import { describe, expect, it } from "vitest";
import { guardPortableText } from "./pt-guard.mjs";

const p = (text) => ({ _type: "block", _key: "b", style: "normal", markDefs: [], children: [{ _type: "span", _key: "s", text, marks: [] }] });

describe("guardPortableText", () => {
	it("passes prose, web9 blocks and safe core blocks", () => {
		expect(
			guardPortableText([
				p("hello"),
				{ _type: "callout", _key: "c", tone: "tip", title: "t", body: "md" },
				{ _type: "tool_grid", _key: "g", logo_size: 100, tools: [] },
				{ _type: "image", _key: "i", asset: { _ref: "x", url: "/img/a.png", meta: { dominantColor: "rgb(10,20,30)" } }, alignment: "center" },
				{ _type: "embed", _key: "e", url: "https://www.youtube.com/watch?v=SKS-URw9a18" },
				{ _type: "code", _key: "k", language: "c#", code: "x" },
				{ _type: "cover", _key: "v", minHeight: "60vh", overlayColor: "#000", overlayOpacity: 0.4, alignment: "left" },
				{ _type: "columns", _key: "o", columns: [{ width: "33.33%", content: [] }] },
				{ _type: "buttons", _key: "u", layout: "vertical", buttons: [{ text: "a", style: "outline" }] },
			]),
		).toEqual([]);
	});
	it("rejects htmlBlock, iframe and unknown types", () => {
		const problems = guardPortableText([
			{ _type: "htmlBlock", _key: "h", html: "<b>x</b>" },
			{ _type: "iframe", _key: "f", src: "https://example.com" },
			{ _type: "marquee", _key: "m" },
		]);
		expect(problems).toHaveLength(3);
		expect(problems[0]).toMatch(/#0 htmlBlock/);
		expect(problems[1]).toMatch(/#1 iframe/);
		expect(problems[2]).toMatch(/#2 marquee: unknown block type/);
	});
	it("rejects values that core renderers paste into style or class", () => {
		const problems = guardPortableText([
			{ _type: "cover", _key: "a", minHeight: "300px;position:fixed;inset:0;z-index:99999" },
			{ _type: "image", _key: "b", asset: { meta: { dominantColor: "red;position:fixed" } } },
			{ _type: "image", _key: "c", alignment: "x fixed inset-0" },
			{ _type: "columns", _key: "d", columns: [{ width: "50%;position:fixed" }] },
			{ _type: "button", _key: "e", style: "default fixed" },
			{ _type: "code", _key: "f", language: "js fixed inset-0" },
			{ _type: "gallery", _key: "g", columns: "3;position:fixed", images: [{ dominantColor: "url(//x)" }] },
			{ _type: "cover", _key: "h", overlayOpacity: "0.5;position:fixed" },
			{ _type: "embed", _key: "i", url: "https://x.example", html: '<div class="fixed">x</div>' },
			{ _type: "tool_grid", _key: "j", logo_size: 5000 },
			{ _type: "cover", _key: "k", minHeight: "500vh" },
		]);
		expect(problems.map((x) => x.split(":")[0])).toEqual([
			"#0 cover minHeight",
			"#1 image asset.meta.dominantColor",
			"#2 image alignment",
			"#3 columns columns[].width",
			"#4 button style",
			"#5 code language",
			"#6 gallery columns",
			"#6 gallery images[].dominantColor",
			"#7 cover overlayOpacity",
			"#8 embed html",
			"#9 tool_grid logo_size",
			"#10 cover minHeight",
		]);
	});
	it("ignores absent fields and non-array values", () => {
		expect(guardPortableText([{ _type: "image", _key: "a", asset: { _ref: "x" } }, { _type: "cover", _key: "b" }])).toEqual([]);
		expect(guardPortableText("# markdown")).toEqual([]);
		expect(guardPortableText(undefined)).toEqual([]);
	});
});
