// The text fields a block renderer prints (spec 2026-10-17 §3.6): each must be a string when present, and the Markdown
// and code fields are capped in length and, for Markdown, in total over the value. A value that is not a string reaches
// String() or a template string at render (renderMarkdown, Astro's text and attribute escaping), which throws for an
// object without a callable toString or overflows on a deeply nested array, and takes the page down.
import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.mjs";
import { guardPortableText } from "./pt-guard.mjs";

/** A ~3000-deep array: about 6 KB of JSON, which JSON.parse accepts. */
const deep = () => {
	let v = [];
	for (let i = 0; i < 3000; i++) v = [v];
	return v;
};
const BAD = [
	["{toString:1}", () => JSON.parse('{"toString":1}')],
	["3000-deep array", deep],
	["number", () => 5],
	["boolean", () => true],
	["object", () => ({ a: "b" })],
];

// Every printed text field of a top-level node: [type, field, sink]
const FIELDS = [
	["image", "title", "core Image.astro title attribute"],
	["image", "caption", "core Image.astro figcaption"],
	["code", "code", "core Code.astro <code>"],
	["code", "filename", "core Code.astro filename"],
	["pullquote", "text", "core Pullquote.astro blockquote"],
	["pullquote", "citation", "core Pullquote.astro figcaption"],
	["file", "filename", "core File.astro download attribute and name"],
	["video", "caption", "core Video.astro figcaption"],
	["button", "text", "core Button.astro"],
	["cover", "backgroundImage", "core Cover.astro img src"],
	["cover", "backgroundVideo", "core Cover.astro source src"],
	["embed", "caption", "web9 Embed.astro figcaption"],
	["callout", "title", "web9 Callout.astro renderInlineMarkdown"],
	["callout", "body", "web9 Callout.astro renderMarkdown"],
	["details", "summary", "web9 Details.astro renderInlineMarkdown"],
	["details", "body", "web9 Details.astro renderMarkdown"],
	["mermaid", "code", "web9 Mermaid.astro <pre>"],
	["tool_grid", "title", "web9 ToolGrid.astro <h4>"],
];
// Printed text fields of list items (LISTS): [type, list, field]
const ITEM_FIELDS = [
	["buttons", "buttons", "text"],
	["tabs", "tabs", "label"],
	["tabs", "tabs", "body"],
	["tool_grid", "tools", "name"],
	["tool_grid", "tools", "tagline"],
];

describe("printed text fields of a block", () => {
	it("must be strings: one problem per bad value, never a throw", () => {
		for (const [type, field] of FIELDS) {
			for (const [name, bad] of BAD) {
				const problems = guardPortableText([{ _type: type, _key: "a", [field]: bad() }]);
				expect(problems, `${type}.${field} ${name}`).toHaveLength(1);
				expect(problems[0], `${type}.${field} ${name}`).toMatch(new RegExp(`^#0 ${type} ${field}: value .+ is not allowed$`));
			}
		}
	});
	it("must be strings in list items too", () => {
		for (const [type, list, field] of ITEM_FIELDS) {
			for (const [name, bad] of BAD) {
				const problems = guardPortableText([{ _type: type, _key: "a", [list]: [{ [field]: bad() }] }]);
				expect(problems, `${type}.${list}[].${field} ${name}`).toEqual([expect.stringMatching(new RegExp(`^#0 ${type} ${list}\\[0\\]\\.${field}: value .+ is not allowed$`))]);
			}
		}
	});
	it("names the value it rejects, and the deep array without overflowing", () => {
		expect(guardPortableText([{ _type: "callout", _key: "a", body: JSON.parse('{"toString":1}') }])).toEqual(['#0 callout body: value {"toString":1} is not allowed']);
		expect(guardPortableText([{ _type: "mermaid", _key: "a", code: deep() }])[0]).toMatch(/^#0 mermaid code: value (\[{60}|\[unprintable array\]) is not allowed$/);
	});
	it("stay optional: absent, null and any string pass", () => {
		for (const [type, field] of FIELDS) {
			for (const value of [undefined, null, "", "text"]) expect(guardPortableText([{ _type: type, _key: "a", [field]: value }]), `${type}.${field} ${value}`).toEqual([]);
		}
		for (const [type, list, field] of ITEM_FIELDS) {
			for (const value of [undefined, null, "", "text"]) expect(guardPortableText([{ _type: type, _key: "a", [list]: [{ [field]: value }] }]), `${type}.${list}[].${field}`).toEqual([]);
		}
	});
	it("include a text block's textAlign, which core's Block.astro looks up with Object.hasOwn (a throw for {toString:1})", () => {
		for (const [name, bad] of BAD) {
			expect(guardPortableText([{ _type: "block", _key: "a", textAlign: bad() }]), name).toEqual([expect.stringMatching(/^#0 block textAlign: value .+ is not allowed$/)]);
			expect(guardPortableText([{ _type: "cover", _key: "c", content: [{ _type: "block", _key: "b", textAlign: bad() }] }]), `cover ${name}`).toEqual([
				expect.stringMatching(/^#0 cover content\[0\] block textAlign: value .+ is not allowed$/),
			]);
		}
		for (const textAlign of [undefined, null, "center", "right", "justify", "toString", "anything"]) expect(guardPortableText([{ _type: "block", _key: "a", textAlign }])).toEqual([]);
	});
	it("are checked inside the containers' blocks only as blocks: a callout in a cover is still rejected by type", () => {
		expect(guardPortableText([{ _type: "cover", _key: "c", content: [{ _type: "callout", body: 5 }] }])).toEqual(["#0 cover content[0] callout: only blocks are allowed in container content"]);
	});
});

describe("Markdown and code lengths", () => {
	const s = (n) => "a".repeat(n);
	// [type, field, cap]
	const CAPPED = [
		["callout", "title", LIMITS.inlineMarkdown],
		["callout", "body", LIMITS.markdown],
		["details", "summary", LIMITS.inlineMarkdown],
		["details", "body", LIMITS.markdown],
		["mermaid", "code", LIMITS.code],
		["code", "code", LIMITS.code],
		["cover", "backgroundImage", LIMITS.url],
		["cover", "backgroundVideo", LIMITS.url],
	];
	it("caps each Markdown, code and URL field", () => {
		expect([LIMITS.markdown, LIMITS.inlineMarkdown, LIMITS.code]).toEqual([25000, 300, 20000]);
		for (const [type, field, cap] of CAPPED) {
			expect(guardPortableText([{ _type: type, _key: "a", [field]: s(cap) }]), `${type}.${field}`).toEqual([]);
			expect(guardPortableText([{ _type: type, _key: "a", [field]: s(cap + 1) }]), `${type}.${field}`).toEqual([`#0 ${type} ${field}: at most ${cap} characters (got ${cap + 1})`]);
		}
	});
	it("caps the Markdown of tab bodies and tool taglines", () => {
		expect(guardPortableText([{ _type: "tabs", _key: "a", tabs: [{ label: "l", body: s(LIMITS.markdown) }] }])).toEqual([]);
		expect(guardPortableText([{ _type: "tabs", _key: "a", tabs: [{ label: "l", body: s(LIMITS.markdown + 1) }] }])).toEqual([
			`#0 tabs tabs[0].body: at most ${LIMITS.markdown} characters (got ${LIMITS.markdown + 1})`,
		]);
		expect(guardPortableText([{ _type: "tool_grid", _key: "a", tools: [{ name: "n", tagline: s(LIMITS.inlineMarkdown + 1) }] }])).toEqual([
			`#0 tool_grid tools[0].tagline: at most ${LIMITS.inlineMarkdown} characters (got ${LIMITS.inlineMarkdown + 1})`,
		]);
	});
	it("leaves plain-text fields uncapped (Astro escapes them in linear time)", () => {
		expect(guardPortableText([{ _type: "pullquote", _key: "a", text: s(100000) }, { _type: "image", _key: "i", caption: s(100000) }])).toEqual([]);
	});
});

describe("Markdown characters over the whole value", () => {
	const callout = (n) => ({ _type: "callout", _key: "a", body: "a".repeat(n) });
	it("allows at most 52000, counting callout, details, tab and tagline Markdown", () => {
		expect(guardPortableText([callout(25000), callout(25000), callout(2000)])).toEqual([]);
		expect(guardPortableText([callout(25000), callout(25000), callout(2001)])).toEqual(["at most 52000 Markdown characters are allowed in total"]);
		const mixed = [
			{ _type: "callout", _key: "c", title: "a".repeat(300), body: "a".repeat(20000) },
			{ _type: "details", _key: "d", summary: "a".repeat(300), body: "a".repeat(20000) },
			{ _type: "tabs", _key: "t", tabs: [{ label: "l", body: "a".repeat(10000) }, { label: "l", body: "a".repeat(1000) }] },
			{ _type: "tool_grid", _key: "g", tools: Array.from({ length: 4 }, () => ({ name: "n", tagline: "a".repeat(100) })) },
		];
		// 20300 + 20300 + 11000 + 400 = 52000
		expect(guardPortableText(mixed)).toEqual([]);
		mixed[3].tools.push({ name: "n", tagline: "a" });
		expect(guardPortableText(mixed)).toEqual(["at most 52000 Markdown characters are allowed in total"]);
	});
	it("counts before the per-node checks, so many large fields are one problem and the walk stops there", () => {
		expect(guardPortableText(Array.from({ length: 2000 }, () => callout(20000)))).toEqual(["at most 52000 Markdown characters are allowed in total"]);
		expect(guardPortableText(Array.from({ length: 2000 }, () => callout(30000)))).toEqual([
			"#0 callout body: at most 25000 characters (got 30000)",
			"#1 callout body: at most 25000 characters (got 30000)",
			"at most 52000 Markdown characters are allowed in total",
		]);
	});
	it("counts a field over its own cap only up to the cap, so its own problem names it", () => {
		expect(guardPortableText([callout(40000)])).toEqual(["#0 callout body: at most 25000 characters (got 40000)"]);
	});
	it("counts only strings, and no list past its item cap", () => {
		expect(guardPortableText([callout(25000), callout(25000), { _type: "callout", _key: "x", body: 5 }])).toEqual(["#2 callout body: value 5 is not allowed"]);
		const tabs = { _type: "tabs", _key: "t", tabs: Array.from({ length: 21 }, () => ({ label: "l", body: "a".repeat(25000) })) };
		expect(guardPortableText([tabs])).toEqual(["#0 tabs tabs: at most 20 items are allowed"]);
	});
});
