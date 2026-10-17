import { describe, expect, it } from "vitest";
import { guardPortableText } from "./pt-guard.mjs";

const span = (text = "a", marks = []) => ({ _type: "span", _key: "s", text, marks });
const para = (children) => ({ _type: "block", _key: "b", style: "normal", markDefs: [], children });
const cell = (content) => ({ _type: "tableCell", _key: "c", content, markDefs: [] });
const row = (cells) => ({ _type: "tableRow", _key: "r", cells });
const table = (rows) => ({ _type: "table", _key: "t", rows });

describe("guardPortableText: totals over the whole value (spec 2026-10-17 §3.6)", () => {
	it("allows at most 2000 top-level nodes", () => {
		expect(guardPortableText(Array.from({ length: 2001 }, () => para([span()])))).toEqual(["at most 2000 top-level blocks are allowed (got 2001)"]);
		expect(guardPortableText(Array.from({ length: 2000 }, () => para([span()])))).toEqual([]);
	});
	it("allows at most 20000 spans in total, counting blocks, container blocks and table cells", () => {
		const full = (n) => para(Array.from({ length: n }, () => span()));
		expect(guardPortableText(Array.from({ length: 20 }, () => full(1000)))).toEqual([]);
		expect(guardPortableText([...Array.from({ length: 20 }, () => full(1000)), full(1)])).toEqual(["at most 20000 spans are allowed in total"]);
		expect(guardPortableText([...Array.from({ length: 19 }, () => full(1000)), { _type: "cover", _key: "v", content: [full(1000)] }, table([row([cell([span()])])])])).toEqual([
			"at most 20000 spans are allowed in total",
		]);
	});
	it("allows at most 5000 marks in total (render CPU grows with marks)", () => {
		const marked = (n) => para(Array.from({ length: n }, () => span("a", ["strong", "em"])));
		expect(guardPortableText([marked(1000), marked(1000), marked(500)])).toEqual([]);
		expect(guardPortableText([marked(1000), marked(1000), marked(500), table([row([cell([span("a", ["strong"])])])])])).toEqual(["at most 5000 marks are allowed in total"]);
	});
});

describe("guardPortableText: tables (spec 2026-10-17 §3.6)", () => {
	it("passes the shape the converter writes", () => {
		expect(guardPortableText([table([row([cell([span("h", ["strong"])]), cell([])]), row([cell([span("x")])])])])).toEqual([]);
		expect(guardPortableText([{ _type: "table", _key: "t" }])).toEqual([]);
	});
	it("requires arrays and objects where core maps", () => {
		expect(guardPortableText([table("rows")])).toEqual(["#0 table rows: must be an array"]);
		expect(guardPortableText([table([null, row("cells"), row([5, cell({})])])])).toEqual([
			"#0 table rows[0]: must be an object",
			"#0 table rows[1].cells: must be an array",
			"#0 table rows[2].cells[0]: must be an object",
			"#0 table rows[2].cells[1] content: must be an array of spans",
		]);
	});
	it("allows spans only in a cell, without children, with at most 20 marks", () => {
		expect(guardPortableText([table([row([cell([{ _type: "image", _key: "i" }, { ...span(), children: [] }, span("a", Array(21).fill("em")), span("a", "em")])])])])).toEqual([
			"#0 table rows[0].cells[0] content[0] image: only spans are allowed in a table cell",
			"#0 table rows[0].cells[0] content[1] span: a span must not have children",
			"#0 table rows[0].cells[0] content[2].marks: at most 20 marks are allowed",
			"#0 table rows[0].cells[0] content[3].marks: must be an array",
		]);
	});
	it("allows at most 500 rows, 2000 cells per table and 1000 spans per cell", () => {
		expect(guardPortableText([table(Array.from({ length: 501 }, () => row([])))])).toEqual(["#0 table rows: at most 500 rows are allowed"]);
		expect(guardPortableText([table(Array.from({ length: 500 }, () => row(Array.from({ length: 4 }, () => cell([])))))])).toEqual([]);
		expect(guardPortableText([table(Array.from({ length: 401 }, () => row(Array.from({ length: 5 }, () => cell([])))))])).toEqual(["#0 table: at most 2000 cells are allowed"]);
		expect(guardPortableText([table([row([cell(Array.from({ length: 1001 }, () => span()))])])])).toEqual(["#0 table rows[0].cells[0] content: at most 1000 spans are allowed"]);
	});
});

describe("guardPortableText: block shapes that crash their renderer (spec 2026-10-17 §3.6)", () => {
	it("requires buttons, tabs and tools to be arrays of objects", () => {
		for (const [type, field] of [["buttons", "buttons"], ["tabs", "tabs"], ["tool_grid", "tools"]]) {
			for (const bad of ["x", 5, {}, true]) expect(guardPortableText([{ _type: type, _key: "k", [field]: bad }])).toEqual([`#0 ${type} ${field}: must be an array`]);
			expect(guardPortableText([{ _type: type, _key: "k", [field]: [null, 5, []] }])).toEqual([
				`#0 ${type} ${field}[0]: must be an object`,
				`#0 ${type} ${field}[1]: must be an object`,
				`#0 ${type} ${field}[2]: must be an object`,
			]);
			for (const ok of [undefined, null, []]) expect(guardPortableText([{ _type: type, _key: "k", [field]: ok }])).toEqual([]);
		}
	});
	it("caps tabs at 20, tools at 100 and buttons at 10", () => {
		const n = (k) => Array.from({ length: k }, () => ({}));
		expect(guardPortableText([{ _type: "tabs", _key: "k", tabs: n(21) }])).toEqual(["#0 tabs tabs: at most 20 items are allowed"]);
		expect(guardPortableText([{ _type: "tool_grid", _key: "k", tools: n(101) }])).toEqual(["#0 tool_grid tools: at most 100 items are allowed"]);
		expect(guardPortableText([{ _type: "buttons", _key: "k", buttons: n(11) }])).toEqual(["#0 buttons buttons: at most 10 items are allowed"]);
		expect(guardPortableText([{ _type: "tabs", _key: "k", tabs: n(20) }, { _type: "tool_grid", _key: "g", tools: n(100) }, { _type: "buttons", _key: "b", buttons: n(10) }])).toEqual([]);
	});
	it("requires the text fields to be strings and featured a boolean when present", () => {
		expect(guardPortableText([{ _type: "tabs", _key: "k", tabs: [{ label: 5, body: {} }, { label: "a", body: "md" }, { label: null }] }])).toEqual([
			"#0 tabs tabs[0].label: value 5 is not allowed",
			"#0 tabs tabs[0].body: value {} is not allowed",
		]);
		expect(guardPortableText([{ _type: "tool_grid", _key: "k", tools: [{ name: ["n"], tagline: 5, featured: "yes" }, { name: "a", tagline: "t", featured: false }] }])).toEqual([
			'#0 tool_grid tools[0].name: value ["n"] is not allowed',
			"#0 tool_grid tools[0].tagline: value 5 is not allowed",
			'#0 tool_grid tools[0].featured: value "yes" is not allowed',
		]);
		expect(guardPortableText([{ _type: "buttons", _key: "k", buttons: [{ text: 5 }, { text: "ok" }] }])).toEqual(["#0 buttons buttons[0].text: value 5 is not allowed"]);
	});
});
