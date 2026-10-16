import { describe, expect, it } from "vitest";
import { guardImageValue, guardPortableText } from "./pt-guard.mjs";

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

const span = (text = "t", marks = []) => ({ _type: "span", _key: "s", text, marks });
const only = "only spans are allowed inside a block";
const HASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";

describe("guardPortableText: block children", () => {
	it("rejects inline objects in block.children (cover and iframe payload)", () => {
		const block = {
			_type: "block",
			_key: "p",
			style: "normal",
			markDefs: [],
			children: [
				{ _type: "cover", _key: "c", minHeight: "1px;position:fixed;inset:0;z-index:99999", content: [] },
				{ _type: "iframe", _key: "f", src: "https://evil.example/login", height: 10000 },
			],
		};
		expect(guardPortableText([block])).toEqual([`#0 block children[0] cover: ${only}`, `#0 block children[1] iframe: ${only}`]);
	});
	it("rejects inline htmlBlock, image and code, a nested block, and children without _type", () => {
		const inline = (child) => guardPortableText([p("a"), { _type: "block", _key: "q", children: [span(), child] }]);
		expect(inline({ _type: "htmlBlock", _key: "h", html: "<b>x</b>" })).toEqual([`#1 block children[1] htmlBlock: ${only}`]);
		expect(inline({ _type: "image", _key: "i", alignment: "x fixed" })).toEqual([`#1 block children[1] image: ${only}`]);
		expect(inline({ _type: "code", _key: "k", language: "js fixed" })).toEqual([`#1 block children[1] code: ${only}`]);
		expect(inline({ _type: "block", _key: "n", children: [span()] })).toEqual([`#1 block children[1] block: ${only}`]);
		expect(inline({ text: "no type" })).toEqual([`#1 block children[1] (no _type): ${only}`]);
		expect(inline("a string")).toEqual([`#1 block children[1] (no _type): ${only}`]);
	});
	it("rejects a span that has its own children, and a block whose children is not an array", () => {
		expect(guardPortableText([{ _type: "block", _key: "q", children: [{ ...span(), children: [{ _type: "span", _key: "x", text: "y" }] }] }])).toEqual([
			"#0 block children[0] span: a span must not have children",
		]);
		expect(guardPortableText([{ _type: "block", _key: "q", children: "x" }])).toEqual(["#0 block children: must be an array of spans"]);
	});
	it("rejects children on any non-block node", () => {
		expect(guardPortableText([{ _type: "table", _key: "t", children: [{ _type: "cover", _key: "c" }] }])).toEqual([
			"#0 table children: only a block may have children",
		]);
		expect(guardPortableText([{ _type: "callout", _key: "c", tone: "tip", children: [] }])).toEqual(["#0 callout children: only a block may have children"]);
	});
	it("still passes paragraphs with marks and markDefs, headings and list items", () => {
		expect(
			guardPortableText([
				{
					_type: "block",
					_key: "a",
					style: "normal",
					markDefs: [{ _type: "link", _key: "l1", href: "https://example.com" }],
					children: [span("a", ["strong", "l1"]), span("b", ["em", "code"])],
				},
				{ _type: "block", _key: "b", style: "h2", markDefs: [], children: [span("h")] },
				{ _type: "block", _key: "c", style: "normal", listItem: "bullet", level: 1, markDefs: [], children: [span("item")] },
				{ _type: "block", _key: "d", style: "normal", listItem: "number", level: 2, markDefs: [], children: [span("item")] },
				{ _type: "block", _key: "e", style: "normal", markDefs: [], children: [] },
			]),
		).toEqual([]);
	});
});

describe("guardPortableText: rules and boundaries", () => {
	const one = (node) => guardPortableText([node]).map((x) => x.split(":")[0]);
	it("checks image colour and blurhash fields", () => {
		expect(one({ _type: "image", _key: "i", dominantColor: "red;position:fixed" })).toEqual(["#0 image dominantColor"]);
		expect(one({ _type: "image", _key: "i", dominantColor: "#abc", alignment: "wide", asset: { meta: { dominantColor: "rgba(1,2,3,.5)" } } })).toEqual([]);
		expect(one({ _type: "image", _key: "i", alignment: "full" })).toEqual([]);
		expect(one({ _type: "image", _key: "i", blurhash: "x" })).toEqual(["#0 image blurhash"]);
		expect(one({ _type: "image", _key: "i", asset: { meta: { blurhash: "x" } } })).toEqual(["#0 image asset.meta.blurhash"]);
		expect(one({ _type: "image", _key: "i", blurhash: HASH, asset: { meta: { blurhash: HASH } } })).toEqual([]);
	});
	it("checks gallery colour and blurhash fields", () => {
		expect(one({ _type: "gallery", _key: "g", images: [{ asset: { meta: { dominantColor: "url(//x)" } } }] })).toEqual(["#0 gallery images[].asset.meta.dominantColor"]);
		expect(one({ _type: "gallery", _key: "g", images: [{ blurhash: "x" }, { asset: { meta: { blurhash: "x" } } }] })).toEqual([
			"#0 gallery images[].blurhash",
			"#0 gallery images[].asset.meta.blurhash",
		]);
		expect(one({ _type: "gallery", _key: "g", images: [{ blurhash: HASH, dominantColor: "#fff" }] })).toEqual([]);
	});
	it("checks cover overlayColor, alignment, overlayOpacity and minHeight boundaries", () => {
		expect(one({ _type: "cover", _key: "c", overlayColor: "red" })).toEqual(["#0 cover overlayColor"]);
		expect(one({ _type: "cover", _key: "c", alignment: "justify" })).toEqual(["#0 cover alignment"]);
		for (const alignment of ["left", "center", "right"]) expect(one({ _type: "cover", _key: "c", alignment })).toEqual([]);
		for (const overlayOpacity of [0, 1]) expect(one({ _type: "cover", _key: "c", overlayOpacity })).toEqual([]);
		for (const overlayOpacity of [-0.01, 1.01, Number.NaN, "0.5"]) expect(one({ _type: "cover", _key: "c", overlayOpacity })).toEqual(["#0 cover overlayOpacity"]);
		for (const minHeight of ["100vh", "0vh", "300px", "20rem", "5em"]) expect(one({ _type: "cover", _key: "c", minHeight })).toEqual([]);
		for (const minHeight of ["101vh", "300", "10%", "calc(1px)", "1e3px"]) expect(one({ _type: "cover", _key: "c", minHeight })).toEqual(["#0 cover minHeight"]);
	});
	it("checks buttons layout and style, and button style", () => {
		expect(one({ _type: "buttons", _key: "b", layout: "grid" })).toEqual(["#0 buttons layout"]);
		expect(one({ _type: "buttons", _key: "b", buttons: [{ style: "ghost" }, { style: "fill" }, { style: "outline fixed" }] })).toEqual([
			"#0 buttons buttons[].style",
			"#0 buttons buttons[].style",
		]);
		for (const style of ["default", "outline", "fill"]) expect(one({ _type: "button", _key: "b", style })).toEqual([]);
		expect(one({ _type: "button", _key: "b", style: "ghost" })).toEqual(["#0 button style"]);
	});
	it("checks investment_warning.lang", () => {
		expect(one({ _type: "investment_warning", _key: "w", lang: "fr" })).toEqual(["#0 investment_warning lang"]);
		for (const lang of ["zh", "en"]) expect(one({ _type: "investment_warning", _key: "w", lang })).toEqual([]);
	});
	it("checks tool_grid.logo_size and gallery.columns boundaries", () => {
		for (const logo_size of [16, 300]) expect(one({ _type: "tool_grid", _key: "g", logo_size })).toEqual([]);
		for (const logo_size of [15, 301, "100"]) expect(one({ _type: "tool_grid", _key: "g", logo_size })).toEqual(["#0 tool_grid logo_size"]);
		for (const columns of [1, 6]) expect(one({ _type: "gallery", _key: "g", columns })).toEqual([]);
		for (const columns of [0, 7, 2.5]) expect(one({ _type: "gallery", _key: "g", columns })).toEqual(["#0 gallery columns"]);
	});
	it("reports the full message for a rejected value", () => {
		expect(guardPortableText([{ _type: "button", _key: "b", style: "default fixed" }])).toEqual(['#0 button style: value "default fixed" is not allowed']);
		expect(guardPortableText([{ _type: "embed", _key: "e", html: "<b>x</b>" }])).toEqual(['#0 embed html: value "<b>x</b>" is not allowed']);
	});
});

describe("guardImageValue", () => {
	it("passes absent values, plain values and valid placeholders", () => {
		expect(guardImageValue(undefined)).toEqual([]);
		expect(guardImageValue(null)).toEqual([]);
		expect(guardImageValue("https://example.com/a.png")).toEqual([]);
		expect(guardImageValue({ id: "x", provider: "external", src: "https://example.com/a.png" })).toEqual([]);
		expect(
			guardImageValue({
				id: "x",
				dominantColor: "#aabbcc",
				blurhash: HASH,
				meta: { dominantColor: "rgb(1,2,3)", blurhash: HASH },
				darkVariant: { id: "y", dominantColor: "#000", blurhash: HASH, meta: { dominantColor: "#111" } },
			}),
		).toEqual([]);
	});
	it("rejects a dominantColor that is pasted into style", () => {
		expect(guardImageValue({ id: "x", dominantColor: "red;position:fixed;inset:0;z-index:99999" })).toEqual([
			'dominantColor: value "red;position:fixed;inset:0;z-index:99999" is not allowed',
		]);
		expect(guardImageValue({ id: "x", meta: { dominantColor: "url(//x)" } })).toEqual(['meta.dominantColor: value "url(//x)" is not allowed']);
	});
	it("rejects the same fields on darkVariant", () => {
		expect(guardImageValue({ id: "x", darkVariant: { id: "y", dominantColor: "red;position:fixed" } })).toEqual([
			'darkVariant.dominantColor: value "red;position:fixed" is not allowed',
		]);
		expect(guardImageValue({ id: "x", darkVariant: { id: "y", meta: { dominantColor: "x y", blurhash: "x" } } })).toEqual([
			'darkVariant.meta.dominantColor: value "x y" is not allowed',
			'darkVariant.meta.blurhash: value "x" is not allowed',
		]);
	});
	it("rejects a blurhash that does not decode", () => {
		expect(guardImageValue({ id: "x", blurhash: "x" })).toEqual(['blurhash: value "x" is not allowed']);
		expect(guardImageValue({ id: "x", meta: { blurhash: "not a blurhash at all" } })).toEqual(['meta.blurhash: value "not a blurhash at all" is not allowed']);
		expect(guardImageValue({ id: "x", blurhash: 42 })).toEqual(["blurhash: value 42 is not allowed"]);
		expect(guardImageValue({ id: "x", darkVariant: { id: "y", blurhash: "x" } })).toEqual(['darkVariant.blurhash: value "x" is not allowed']);
	});
});
