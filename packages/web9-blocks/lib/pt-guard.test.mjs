import { markdownToPortableText } from "emdash/client";
import { describe, expect, it } from "vitest";
import { convertMdx } from "../../../scripts/lib/mdx-to-pt.mjs";
import { guardBlockImages, guardImageValue, guardPortableText } from "./pt-guard.mjs";

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
	it("ignores absent fields and empty values", () => {
		expect(guardPortableText([{ _type: "image", _key: "a", asset: { _ref: "x" } }, { _type: "cover", _key: "b" }])).toEqual([]);
		// an empty body: absent, null (stored), [] (the editor) or a blank string (core stores it as null)
		for (const empty of [undefined, null, [], "", " \n\t"]) expect(guardPortableText(empty)).toEqual([]);
	});
	it("rejects any other value that is not an array, without throwing", () => {
		const must = "a Portable Text field must be an array of blocks";
		expect(guardPortableText("# markdown")).toEqual([`value "# markdown" is not allowed: ${must}`]);
		expect(guardPortableText(5)).toEqual([`value 5 is not allowed: ${must}`]);
		expect(guardPortableText(false)).toEqual([`value false is not allowed: ${must}`]);
		expect(guardPortableText({ _type: "block" })).toEqual([`value {"_type":"block"} is not allowed: ${must}`]);
		expect(guardPortableText({ toString: 0 })).toEqual([`value {"toString":0} is not allowed: ${must}`]);
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
	// EmDashImage.astro builds the src from meta.storageKey with a template string (media/url.ts:buildRenderMediaUrl):
	// an object without a callable toString throws there, which cuts the page off after the headers.
	it("requires meta.storageKey to be a string when present", () => {
		expect(guardImageValue({ id: "x", meta: { storageKey: "01ABC.png" }, darkVariant: { id: "y", meta: { storageKey: "01DEF.png" } } })).toEqual([]);
		expect(guardImageValue({ id: "x", meta: {} })).toEqual([]);
		expect(guardImageValue({ id: "x", meta: { storageKey: { toString: 1 } } })).toEqual(['meta.storageKey: value {"toString":1} is not allowed']);
		expect(guardImageValue({ id: "x", darkVariant: { id: "y", meta: { storageKey: ["a"] } } })).toEqual(['darkVariant.meta.storageKey: value ["a"] is not allowed']);
	});
});

// pages.layout is a `blocks` field: its hero.image and feature_grid.features[].image are `image` values that
// <Image image={...}> renders (dominantColor into style, blurhash into a decoder). content:beforeSave sees the
// raw value, before core's normalizeBlocksData, so the walk must survive any shape.
describe("guardBlockImages", () => {
	const PATHS = { hero: ["image"], feature_grid: ["features[].image"] };
	const MORE = "…and more";
	const img = (over = {}) => ({ id: "", provider: "external", src: "/img/ai.svg", mimeType: "image/svg+xml", alt: "AI", ...over });
	const hero = (image) => ({ _type: "hero", _version: 1, _key: "h", title: "T", image });
	const grid = (...images) => ({ _type: "feature_grid", _version: 1, _key: "g", features: images.map((image, k) => ({ title: `F${k}`, image })) });
	const guard = (value) => guardBlockImages(value, PATHS);

	it("passes the home page layout, valid placeholders and blocks without images", () => {
		expect(guard([hero(img()), grid(img(), img(), img())])).toEqual([]);
		expect(guard([hero(img({ dominantColor: "#aabbcc", blurhash: HASH, meta: { storageKey: "01ABC.svg" }, darkVariant: img({ dominantColor: "rgb(1,2,3)" }) }))])).toEqual([]);
		expect(guard([hero(undefined), hero(null), { _type: "feature_grid", features: [{ title: "x" }, { title: "y", image: null }] }])).toEqual([]);
		expect(guard([])).toEqual([]);
	});
	it("rejects a dominantColor pasted into style, on hero.image and on a feature image", () => {
		const evil = "red;position:fixed;inset:0;z-index:99999";
		expect(guard([hero(img({ dominantColor: evil }))])).toEqual([`#0 hero image.dominantColor: value "${evil}" is not allowed`]);
		expect(guard([hero(img()), grid(img(), img({ dominantColor: evil }), img())])).toEqual([
			`#1 feature_grid features[1].image.dominantColor: value "${evil}" is not allowed`,
		]);
	});
	it("rejects the same fields on darkVariant and in meta", () => {
		expect(guard([hero(img({ darkVariant: img({ dominantColor: "red;position:fixed" }) }))])).toEqual([
			'#0 hero image.darkVariant.dominantColor: value "red;position:fixed" is not allowed',
		]);
		expect(guard([grid(img({ meta: { dominantColor: "url(//x)", blurhash: 5 } }))])).toEqual([
			'#0 feature_grid features[0].image.meta.dominantColor: value "url(//x)" is not allowed',
			"#0 feature_grid features[0].image.meta.blurhash: value 5 is not allowed",
		]);
	});
	it("rejects a blurhash that does not decode and a meta.storageKey that is not a string", () => {
		expect(guard([hero(img({ blurhash: "x" }))])).toEqual(['#0 hero image.blurhash: value "x" is not allowed']);
		expect(guard([grid(img(), img(), img({ meta: { storageKey: { toString: 1 } } }))])).toEqual([
			'#0 feature_grid features[2].image.meta.storageKey: value {"toString":1} is not allowed',
		]);
	});
	it("reports every bad block, in order", () => {
		expect(guard([hero(img({ blurhash: "x" })), grid(img({ dominantColor: "a b" }), img({ blurhash: "y" }))])).toEqual([
			'#0 hero image.blurhash: value "x" is not allowed',
			'#1 feature_grid features[0].image.dominantColor: value "a b" is not allowed',
			'#1 feature_grid features[1].image.blurhash: value "y" is not allowed',
		]);
	});
	it("never throws on a shape core would reject afterwards, and ignores types it has no paths for", () => {
		for (const value of [undefined, null, "x", 5, true, {}, { length: 1 }, [null], [undefined], ["hero"], [5], [[]], [{}], [{ _type: 5 }], [{ _type: null }]]) {
			expect(guard(value)).toEqual([]);
		}
		// prototype names are not types: the lookup is an own-property check
		for (const _type of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "block", "unknown"]) {
			expect(guard([{ _type, image: img({ dominantColor: "a b" }), features: [{ image: img({ dominantColor: "a b" }) }] }])).toEqual([]);
		}
		expect(guardBlockImages([hero(img({ dominantColor: "a b" }))], {})).toEqual([]);
		for (const features of [undefined, null, "x", 5, {}, [null], [5], ["x"], [[]], [{ image: "https://example.com/a.png" }], [{ image: [] }], [{ image: 5 }]]) {
			expect(guard([{ _type: "feature_grid", _key: "g", features }])).toEqual([]);
		}
		for (const image of ["https://example.com/a.png", 5, true, [], [img({ dominantColor: "a b" })]]) {
			expect(guard([{ _type: "hero", _key: "h", image }])).toEqual([]);
		}
	});
	it("is bounded: 200k bad features end in …and more and do not throw", () => {
		const features = Array.from({ length: 200000 }, () => ({ title: "f", image: img({ dominantColor: "a b" }) }));
		let problems;
		expect(() => (problems = guard([{ _type: "feature_grid", _key: "g", features }]))).not.toThrow();
		expect(problems).toHaveLength(51);
		expect(problems[50]).toBe(MORE);
		const blocks = Array.from({ length: 200000 }, () => hero(img({ blurhash: "x" })));
		expect(guard(blocks)).toHaveLength(51);
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
	it("requires listStart to be an integer from 1 to 100000 when present (OrderedList.astro renders it as <ol start>)", () => {
		const item = (listStart) => para({ listItem: "number", level: 1, listId: "doc:list-0", listStart });
		for (const listStart of ["5", -1, 1.5, 0, 100001, Number.NaN, Number.POSITIVE_INFINITY, [1]]) {
			expect(guardPortableText([item(listStart)])).toEqual([notAllowed("#0 block", "listStart", listStart)]);
		}
		for (const listStart of [1, 2, 100000, undefined, null]) expect(guardPortableText([item(listStart)])).toEqual([]);
	});
	it("requires listId to be a string of at most 128 characters when present (emdash normalizeListId ignores longer ones)", () => {
		const item = (listId) => para({ listItem: "number", level: 1, listId, listStart: 1 });
		for (const listId of [5, ["l"], { toString: 0 }, true]) expect(guardPortableText([item(listId)])).toEqual([notAllowed("#0 block", "listId", listId)]);
		const long = "x".repeat(129);
		expect(guardPortableText([item(long)])).toEqual([`#0 block listId: value ${JSON.stringify(long).slice(0, 60)} is not allowed`]);
		for (const listId of ["doc:list-0", "x".repeat(128), "", undefined, null]) expect(guardPortableText([item(listId)])).toEqual([]);
	});
	it("accepts prototype names as listId: emdash keys lists by Map and JSON strings, never by a plain object", () => {
		// portable-text-lists.ts (activeLists, bases, counts) and numbered-list.ts use Map/Set; OrderedList.astro renders only start
		for (const listId of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
			expect(guardPortableText([para({ listItem: "number", level: 1, listId, listStart: 1 })])).toEqual([]);
		}
	});
	it("checks listId and listStart on blocks inside containers too", () => {
		expect(guardPortableText([{ _type: "cover", _key: "c", content: [para({ listItem: "number", level: 1, listId: 7, listStart: "5" })] }])).toEqual([
			notAllowed("#0 cover content[0] block", "listId", 7),
			notAllowed("#0 cover content[0] block", "listStart", "5"),
		]);
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
		const mdx = `---\ntitle: T\n---\n\n## Heading\n\n${MARKDOWN}\n\nTail with a<br>break and ![x](/img/x.png)\n\n1. one\n    \`\`\`bash\n    echo 1\n    \`\`\`\n2. two\n`;
		const { data: { body: blocks } } = convertMdx(mdx, { path: "docs/a.mdx" });
		expect(blocks.some((b) => b.listItem === "bullet" && b.level === 2)).toBe(true);
		expect(blocks.filter((b) => b.listStart).map((b) => [b.listStart, typeof b.listId])).toEqual(expect.arrayContaining([[1, "string"], [2, "string"]]));
		expect(blocks.map((b) => b._type)).toEqual(expect.arrayContaining(["image", "code"]));
		expect(guardPortableText(blocks)).toEqual([]);
	});
});

describe("guardPortableText: bounded output", () => {
	const MORE = "…and more";
	it("does not throw on a span with 125k bad marks and reports the marks cap only", () => {
		const blocks = [para({ children: [span("a", Array(125000).fill(0))] })];
		let problems;
		expect(() => (problems = guardPortableText(blocks))).not.toThrow();
		expect(problems).toEqual(["#0 block children[0].marks: at most 20 marks are allowed"]);
	});
	it("does not throw on 200k bad children and reports the children cap only", () => {
		const blocks = [para({ children: Array.from({ length: 200000 }, () => ({ _type: "cover", _key: "c" })) })];
		let problems;
		expect(() => (problems = guardPortableText(blocks))).not.toThrow();
		expect(problems).toEqual(["#0 block children: at most 1000 spans are allowed"]);
	});
	it("returns at most 50 problems plus a final entry for bad marks and children within the caps", () => {
		const marks = [para({ children: Array.from({ length: 1000 }, () => span("a", Array(20).fill(0))) })];
		const children = [para({ children: Array.from({ length: 1000 }, () => ({ _type: "cover", _key: "c" })) })];
		for (const blocks of [marks, children]) {
			const problems = guardPortableText(blocks);
			expect(problems).toHaveLength(51);
			expect(problems[50]).toBe(MORE);
		}
		expect(guardPortableText(marks)[0]).toBe(notAllowed("#0 block", "children[0].marks", 0));
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

describe("guardPortableText: size caps and _key (core renderers throw or stall past them)", () => {
	const spans = (n, marks = ["strong"]) => Array.from({ length: n }, (_, k) => ({ _type: "span", _key: `s${k}`, text: "a", marks }));
	it("allows at most 20 marks per span (astro-portabletext nests one component per mark)", () => {
		expect(guardPortableText([para({ children: [span("a", Array(3000).fill("strong"))] })])).toEqual(["#0 block children[0].marks: at most 20 marks are allowed"]);
		expect(guardPortableText([para({ children: [span("a"), span("b", Array(21).fill("em"))] })])).toEqual(["#0 block children[1].marks: at most 20 marks are allowed"]);
		const defs = Array.from({ length: 20 }, (_, k) => ({ _type: "link", _key: `k${k}`, href: "https://example.com" }));
		expect(guardPortableText([para({ markDefs: defs, children: [span("a", defs.map((d) => d._key))] })])).toEqual([]);
	});
	it("allows at most 1000 children per block (core sorts marks in O(n²) over a block's children)", () => {
		expect(guardPortableText([para({ children: spans(1001) })])).toEqual(["#0 block children: at most 1000 spans are allowed"]);
		expect(guardPortableText([para({ children: spans(1000) })])).toEqual([]);
		expect(guardPortableText([{ _type: "cover", _key: "c", content: [para({ children: spans(1001) })] }])).toEqual([
			"#0 cover content[0] block children: at most 1000 spans are allowed",
		]);
	});
	it("requires _key to be a string when present on a block (groupBlockquoteRuns builds `${_key}-group`)", () => {
		const bad = { toString: 0 };
		expect(guardPortableText([para({ _key: bad, style: "blockquote" }), para({ _key: "q2", style: "blockquote" })])).toEqual(['#0 block _key: value {"toString":0} is not allowed']);
		for (const key of [5, ["k"], true]) expect(guardPortableText([para({ _key: key })])).toEqual([notAllowed("#0 block", "_key", key)]);
		for (const key of ["k", "", undefined, null]) expect(guardPortableText([para({ _key: key })])).toEqual([]);
	});
	it("requires _key to be a string when present on spans, markDefs, container blocks and other top-level nodes", () => {
		expect(guardPortableText([para({ children: [span(), { ...span(), _key: 5 }] })])).toEqual([notAllowed("#0 block", "children[1]._key", 5)]);
		expect(guardPortableText([para({ children: [{ ...span(), _key: null }, { _type: "span", text: "a" }] })])).toEqual([]);
		expect(guardPortableText([para({ markDefs: [{ _type: "link", _key: { toString: 0 }, href: "/a" }] })])).toEqual([notAllowed("#0 block", "markDefs[0]._key", { toString: 0 })]);
		expect(guardPortableText([{ _type: "blockquoteGroup", _key: "g", blocks: [para({ _key: { toString: 0 } })] }])).toEqual([
			notAllowed("#0 blockquoteGroup blocks[0] block", "_key", { toString: 0 }),
		]);
		expect(guardPortableText([{ _type: "columns", _key: "o", columns: [{ content: [para({ _key: 7 })] }] }])).toEqual([notAllowed("#0 columns columns[0].content[0] block", "_key", 7)]);
		expect(guardPortableText([p("a"), { _type: "callout", _key: 5, tone: "tip", body: "x" }])).toEqual([notAllowed("#1 callout", "_key", 5)]);
		expect(guardPortableText([{ _type: "cover", _key: { toString: 0 } }])).toEqual([notAllowed("#0 cover", "_key", { toString: 0 })]);
		expect(guardPortableText([{ _type: "callout", tone: "tip", body: "x" }, { _type: "break", _key: null }])).toEqual([]);
	});
});

// The guard runs in content:beforeSave on raw request data: it must answer with problems, never throw.
// JSON.stringify overflows the stack on a value nested a few thousand levels deep (6154 in node), and the
// guard used to stringify every failing value for its message.
describe("guards never throw on deeply nested values", () => {
	const deepArray = (n) => {
		let v = "x";
		for (let i = 0; i < n; i++) v = [v];
		return v;
	};
	const deepObject = (n) => {
		let v = "x";
		for (let i = 0; i < n; i++) v = { a: v };
		return v;
	};
	const img = (over = {}) => ({ id: "", provider: "external", src: "/img/ai.svg", ...over });
	it("is a real overflow for JSON.stringify", () => {
		expect(() => JSON.stringify(deepArray(20000))).toThrow(RangeError);
		expect(() => JSON.stringify(deepObject(20000))).toThrow(RangeError);
	});
	it("guardImageValue reports a deep meta.storageKey, dominantColor or blurhash", () => {
		expect(guardImageValue({ id: "x", meta: { storageKey: deepArray(20000) } })).toEqual(["meta.storageKey: value [unprintable array] is not allowed"]);
		expect(guardImageValue({ id: "x", dominantColor: deepObject(20000) })).toEqual(["dominantColor: value [unprintable object] is not allowed"]);
		expect(guardImageValue({ id: "x", darkVariant: { id: "y", blurhash: deepArray(20000) } })).toEqual(["darkVariant.blurhash: value [unprintable array] is not allowed"]);
	});
	it("guardBlockImages reports a deep value in a hero or feature image", () => {
		const hero = { _type: "hero", _key: "h", title: "T", image: img({ meta: { storageKey: deepArray(20000) } }) };
		const grid = { _type: "feature_grid", _key: "g", features: [{ title: "a", image: img({ dominantColor: deepObject(20000) }) }] };
		expect(guardBlockImages([hero, grid], { hero: ["image"], feature_grid: ["features[].image"] })).toEqual([
			"#0 hero image.meta.storageKey: value [unprintable array] is not allowed",
			"#1 feature_grid features[0].image.dominantColor: value [unprintable object] is not allowed",
		]);
	});
	it("guardPortableText reports a deep url, _key or href", () => {
		expect(guardPortableText([{ _type: "button", _key: "k", url: deepArray(20000) }])).toEqual(["#0 button url: value [unprintable array] is not allowed"]);
		expect(guardPortableText([{ _type: "callout", _key: deepObject(20000) }])).toEqual(["#0 callout _key: value [unprintable object] is not allowed"]);
		expect(guardPortableText([para({ _key: deepArray(20000) })])).toEqual(["#0 block _key: value [unprintable array] is not allowed"]);
		const link = para({ markDefs: [{ _type: "link", _key: "k1", href: deepArray(20000) }], children: [span("a", ["k1"])] });
		expect(guardPortableText([link])).toEqual(["#0 block markDefs[0].href: value [unprintable array] is not allowed"]);
	});
	it("keeps a message short for a huge string and still prints a short value as before", () => {
		const [problem] = guardImageValue({ id: "x", dominantColor: "a b".repeat(2_000_000) });
		expect(problem.length).toBeLessThan(100);
		expect(guardImageValue({ id: "x", dominantColor: "a b" })).toEqual(['dominantColor: value "a b" is not allowed']);
		expect(guardImageValue({ id: "x", meta: { storageKey: { toString: 1 } } })).toEqual(['meta.storageKey: value {"toString":1} is not allowed']);
	});
});
