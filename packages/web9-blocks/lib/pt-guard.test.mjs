import { markdownToPortableText } from "emdash/client";
import { describe, expect, it } from "vitest";
import { convertMdx } from "../../../scripts/lib/mdx-to-pt.mjs";
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

const para = (over = {}) => ({ _type: "block", _key: "q", style: "normal", markDefs: [], children: [span()], ...over });
const notAllowed = (where, field, v) => `${where} ${field}: value ${JSON.stringify(v)} is not allowed`;
const blocksOnly = "only blocks are allowed in container content";

describe("guardPortableText: prototype keys and allow-lists on blocks", () => {
	it("rejects block.style outside normal, h1-h6 and blockquote (inherited keys crash the renderer)", () => {
		for (const style of ["constructor", "call", "__proto__", "toString", "h7", "lineBreak", 5]) {
			expect(guardPortableText([para({ style })])).toEqual([notAllowed("#0 block", "style", style)]);
		}
		for (const style of ["normal", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", undefined, null]) expect(guardPortableText([para({ style })])).toEqual([]);
	});
	it("rejects listItem outside bullet, number and menu", () => {
		for (const listItem of ["constructor", "toString", "roman"]) expect(guardPortableText([para({ listItem, level: 1 })])).toEqual([notAllowed("#0 block", "listItem", listItem)]);
		for (const listItem of ["bullet", "number", "menu", undefined]) expect(guardPortableText([para({ listItem, level: 1 })])).toEqual([]);
	});
	it("requires level to be a positive integer up to 20", () => {
		for (const level of [0, -1, 1.5, "1", 21, Number.NaN]) expect(guardPortableText([para({ listItem: "bullet", level })])).toEqual([notAllowed("#0 block", "level", level)]);
		for (const level of [1, 2, 20, undefined]) expect(guardPortableText([para({ listItem: "bullet", level })])).toEqual([]);
	});
	it("rejects span marks that are neither a decorator nor a markDef key of the same block", () => {
		const withMarks = (marks, markDefs = []) => para({ markDefs, children: [span("a", marks)] });
		for (const mark of ["constructor", "__proto__", "link", "bold", "k9"]) {
			expect(guardPortableText([withMarks([mark])])).toEqual([notAllowed("#0 block", "children[0].marks", mark)]);
		}
		expect(guardPortableText([withMarks(["strong", "em", "underline", "strike-through", "subscript", "superscript", "code"])])).toEqual([]);
		expect(guardPortableText([withMarks(["strong", "k1"], [{ _type: "link", _key: "k1", href: "https://example.com" }])])).toEqual([]);
		expect(guardPortableText([withMarks([5])])).toEqual([notAllowed("#0 block", "children[0].marks", 5)]);
		expect(guardPortableText([para({ children: [{ ...span(), marks: "strong" }] })])).toEqual(["#0 block children[0].marks: must be an array"]);
	});
	it("rejects a mark that points at a markDef of another block", () => {
		const defs = [{ _type: "link", _key: "k1", href: "https://example.com" }];
		expect(guardPortableText([para({ markDefs: defs, children: [span("a", ["k1"])] }), para({ children: [span("b", ["k1"])] })])).toEqual([
			notAllowed("#1 block", "children[0].marks", "k1"),
		]);
	});
	it("rejects markDefs that are not links with a plain string key", () => {
		const bad = (def) => guardPortableText([para({ markDefs: [def] })]);
		expect(bad({ _type: "constructor", _key: "k1" })).toEqual([notAllowed("#0 block", "markDefs[0]._type", "constructor")]);
		expect(bad({ _type: "annotation", _key: "k1" })).toEqual([notAllowed("#0 block", "markDefs[0]._type", "annotation")]);
		expect(bad({ _key: "k1" })).toEqual(["#0 block markDefs[0]._type: value undefined is not allowed"]);
		for (const key of ["__proto__", "constructor", "toString", "", 7, undefined]) {
			expect(bad({ _type: "link", _key: key, href: "https://example.com" })).toEqual([`#0 block markDefs[0]._key: value ${key === undefined ? "undefined" : JSON.stringify(key)} is not allowed`]);
		}
		expect(guardPortableText([para({ markDefs: "x" })])).toEqual(["#0 block markDefs: must be an array"]);
		expect(bad("x")).toEqual(['#0 block markDefs[0]._type: value undefined is not allowed', '#0 block markDefs[0]._key: value undefined is not allowed']);
	});
});

describe("guardPortableText: container content", () => {
	it("rejects non-block nodes in cover.content, columns[].content and blockquoteGroup.blocks", () => {
		expect(guardPortableText([{ _type: "cover", _key: "c", content: [{ _type: "constructor", _key: "x" }] }])).toEqual([`#0 cover content[0] constructor: ${blocksOnly}`]);
		expect(guardPortableText([{ _type: "columns", _key: "c", columns: [{ content: [para(), { _type: "constructor" }] }] }])).toEqual([
			`#0 columns columns[0].content[1] constructor: ${blocksOnly}`,
		]);
		expect(guardPortableText([{ _type: "blockquoteGroup", _key: "c", blocks: [{ _type: "constructor" }] }])).toEqual([`#0 blockquoteGroup blocks[0] constructor: ${blocksOnly}`]);
		expect(guardPortableText([{ _type: "cover", _key: "c", content: [{ _type: "htmlBlock", html: "<b>x</b>" }, "text", null] }])).toEqual([
			`#0 cover content[0] htmlBlock: ${blocksOnly}`,
			`#0 cover content[1] (no _type): ${blocksOnly}`,
			`#0 cover content[2] (no _type): ${blocksOnly}`,
		]);
	});
	it("applies the block rules to nested blocks", () => {
		expect(guardPortableText([{ _type: "cover", _key: "c", content: [para({ style: "constructor" })] }])).toEqual([notAllowed("#0 cover content[0] block", "style", "constructor")]);
		expect(guardPortableText([{ _type: "columns", _key: "c", columns: [{ content: [para({ listItem: "constructor", level: 1 })] }, { content: [para({ children: [span("a", ["constructor"])] })] }] }])).toEqual([
			notAllowed("#0 columns columns[0].content[0] block", "listItem", "constructor"),
			notAllowed("#0 columns columns[1].content[0] block", "children[0].marks", "constructor"),
		]);
		expect(guardPortableText([{ _type: "blockquoteGroup", _key: "c", blocks: [para({ markDefs: [{ _type: "constructor", _key: "k" }] })] }])).toEqual([
			notAllowed("#0 blockquoteGroup blocks[0] block", "markDefs[0]._type", "constructor"),
		]);
		expect(guardPortableText([{ _type: "cover", _key: "c", content: [para({ children: [span(), { _type: "iframe", _key: "f", src: "https://evil.example" }] })] }])).toEqual([
			`#0 cover content[0] block children[1] iframe: ${only}`,
		]);
	});
	it("rejects container content that is not an array", () => {
		expect(guardPortableText([{ _type: "cover", _key: "c", content: "text" }])).toEqual(["#0 cover content: must be an array"]);
		expect(guardPortableText([{ _type: "columns", _key: "c", columns: [{ content: {} }] }])).toEqual(["#0 columns columns[0].content: must be an array"]);
		expect(guardPortableText([{ _type: "blockquoteGroup", _key: "c", blocks: "x" }])).toEqual(["#0 blockquoteGroup blocks: must be an array"]);
	});
	it("rejects columns that are not an array of objects (Columns.astro maps them and reads column.width)", () => {
		expect(guardPortableText([{ _type: "columns", _key: "o", columns: "abc" }])).toEqual(["#0 columns columns: must be an array of columns"]);
		expect(guardPortableText([{ _type: "columns", _key: "o", columns: [null, "x", { content: [] }] }])).toEqual([
			"#0 columns columns[0]: must be an object",
			"#0 columns columns[1]: must be an object",
		]);
	});
	it("passes container content made of ordinary blocks, and absent content", () => {
		const quoted = para({ style: "blockquote", markDefs: [{ _type: "link", _key: "k1", href: "https://example.com" }], children: [span("a", ["strong", "k1"])] });
		expect(
			guardPortableText([
				{ _type: "cover", _key: "c", content: [quoted, para({ listItem: "bullet", level: 1 })] },
				{ _type: "columns", _key: "o", columns: [{ content: [quoted] }, { width: "50%" }, { content: [] }] },
				{ _type: "blockquoteGroup", _key: "g", blocks: [quoted, quoted] },
				{ _type: "cover", _key: "d" },
				{ _type: "blockquoteGroup", _key: "e" },
			]),
		).toEqual([]);
	});
});

describe("guardPortableText: converter output", () => {
	const MARKDOWN = [
		"# Title",
		"## Sub heading",
		"### Third",
		"Paragraph with **bold**, _italic_, `code`, ~~strike~~ and a [link](https://example.com).",
		"- bullet one",
		"- bullet **two**",
		"  - nested bullet",
		"1. first",
		"2. second",
		"> quoted text",
		"```js\nconst x = 1;\n```",
	].join("\n\n");
	it("passes core's Markdown to Portable Text output", () => {
		const blocks = markdownToPortableText(MARKDOWN);
		expect(blocks.map((b) => b.style ?? b._type)).toEqual(expect.arrayContaining(["h1", "h2", "h3", "normal", "blockquote", "code"]));
		expect(blocks.some((b) => b.listItem === "bullet" && b.level === 2)).toBe(true);
		expect(blocks.some((b) => b.listItem === "number")).toBe(true);
		expect(blocks.flatMap((b) => b.children ?? []).flatMap((c) => c.marks ?? [])).toEqual(expect.arrayContaining(["strong", "em", "code", "strike-through"]));
		expect(guardPortableText(blocks)).toEqual([]);
	});
	it("passes the migration converter output (scripts/lib/mdx-to-pt.mjs)", () => {
		const mdx = `---\ntitle: T\n---\n\n## Heading\n\n${MARKDOWN}\n\nTail with <b>x</b>\n`;
		const { data } = convertMdx(mdx, { path: "docs/a.mdx" });
		const blocks = data.body.filter((b) => b._type !== "htmlBlock");
		expect(blocks.some((b) => b.listItem === "bullet" && b.level === 2)).toBe(true);
		expect(guardPortableText(blocks)).toEqual([]);
	});
});

describe("guardPortableText: bounded output", () => {
	const MORE = "…and more";
	it("does not throw on a span with 125k bad marks and returns at most 50 problems plus a final entry", () => {
		const blocks = [para({ children: [span("a", Array(125000).fill(0))] })];
		let problems;
		expect(() => (problems = guardPortableText(blocks))).not.toThrow();
		expect(problems).toHaveLength(51);
		expect(problems[0]).toBe(notAllowed("#0 block", "children[0].marks", 0));
		expect(problems[50]).toBe(MORE);
	});
	it("does not throw on 200k bad children", () => {
		const blocks = [para({ children: Array.from({ length: 200000 }, () => ({ _type: "cover", _key: "c" })) })];
		let problems;
		expect(() => (problems = guardPortableText(blocks))).not.toThrow();
		expect(problems.length).toBeLessThanOrEqual(51);
		expect(problems.at(-1)).toBe(MORE);
	});
	it("does not throw on 200k bad top-level nodes, markDefs, container blocks or gallery images", () => {
		const bad = (n, make) => Array.from({ length: n }, make);
		for (const blocks of [
			bad(200000, () => ({ _type: "marquee" })),
			[para({ markDefs: bad(200000, () => ({ _type: "x" })) })],
			[{ _type: "cover", _key: "c", content: bad(200000, () => ({ _type: "iframe" })) }],
			[{ _type: "gallery", _key: "g", images: bad(200000, () => ({ blurhash: 1 })) }],
		]) {
			let problems;
			expect(() => (problems = guardPortableText(blocks))).not.toThrow();
			expect(problems.length).toBeLessThanOrEqual(51);
			expect(problems.at(-1)).toBe(MORE);
		}
	});
	it("adds the final entry only when problems were left out", () => {
		const nodes = (n) => Array.from({ length: n }, () => ({ _type: "marquee" }));
		expect(guardPortableText(nodes(50))).toHaveLength(50);
		expect(guardPortableText(nodes(50)).includes(MORE)).toBe(false);
		const fifty1 = guardPortableText(nodes(51));
		expect(fifty1).toHaveLength(51);
		expect(fifty1[50]).toBe(MORE);
	});
	it("bounds guardImageValue too", () => {
		expect(guardImageValue({ id: "x", meta: { dominantColor: "x y" } })).toHaveLength(1);
	});
});

describe("guardPortableText: string urls (sanitizeHref throws on non-strings)", () => {
	const one = (node) => guardPortableText([node]);
	it("requires a string href on a link markDef (marks/Link.astro:21)", () => {
		const link = (href) => para({ markDefs: [{ _type: "link", _key: "k1", href }], children: [span("a", ["k1"])] });
		expect(one(link(5))).toEqual([notAllowed("#0 block", "markDefs[0].href", 5)]);
		expect(one(link({}))).toEqual([notAllowed("#0 block", "markDefs[0].href", {})]);
		expect(one(link(undefined))).toEqual(["#0 block markDefs[0].href: value undefined is not allowed"]);
		expect(one(link(["https://example.com"]))).toEqual([notAllowed("#0 block", "markDefs[0].href", ["https://example.com"])]);
		expect(one(link("https://example.com"))).toEqual([]);
		expect(one(link(""))).toEqual([]);
	});
	it("requires url to be a string when present on button, buttons[], file and embed", () => {
		expect(one({ _type: "button", _key: "b", url: 5 })).toEqual(["#0 button url: value 5 is not allowed"]);
		expect(one({ _type: "buttons", _key: "b", buttons: [{ url: "https://example.com" }, { url: {} }] })).toEqual(["#0 buttons buttons[].url: value {} is not allowed"]);
		expect(one({ _type: "file", _key: "f", url: 5 })).toEqual(["#0 file url: value 5 is not allowed"]);
		expect(one({ _type: "embed", _key: "e", url: ["x"] })).toEqual(['#0 embed url: value ["x"] is not allowed']);
		for (const node of [{ _type: "button" }, { _type: "buttons", buttons: [{}] }, { _type: "file" }, { _type: "embed" }]) expect(one(node)).toEqual([]);
		for (const node of [{ _type: "button", url: "/a" }, { _type: "file", url: "https://example.com/a.pdf" }, { _type: "embed", url: "https://youtu.be/SKS-URw9a18" }]) expect(one(node)).toEqual([]);
	});
	it("requires tools[].url and tools[].logo to be strings when present on tool_grid (ToolGrid.astro:29, :34)", () => {
		expect(one({ _type: "tool_grid", _key: "g", tools: [{ name: "a", url: 5, logo: {} }, { name: "b", url: "https://example.com", logo: "/img/a.png" }, { name: "c" }] })).toEqual([
			"#0 tool_grid tools[].url: value 5 is not allowed",
			"#0 tool_grid tools[].logo: value {} is not allowed",
		]);
	});
});
