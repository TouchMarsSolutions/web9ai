import { describe, expect, it } from "vitest";
import { guardPortableText } from "./pt-guard.mjs";

const span = (text = "a", marks = []) => ({ _type: "span", _key: "s", text, marks });
const para = (children) => ({ _type: "block", _key: "b", style: "normal", markDefs: [], children });
// Keys are unique per cell and row: a table whose keys repeat is rejected (core's reserveKey is quadratic in repeats).
let keys = 0;
const cell = (content) => ({ _type: "tableCell", _key: `c${keys++}`, content, markDefs: [] });
const row = (cells) => ({ _type: "tableRow", _key: `r${keys++}`, cells });
const emptyRow = () => ({ _type: "tableRow", _key: `r${keys++}` });
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
	it("counts the spans of columns[].content and blockquoteGroup.blocks too", () => {
		const full = (n) => para(Array.from({ length: n }, () => span()));
		const columns = { _type: "columns", _key: "v", columns: [{ _key: "a", content: [full(1000)] }] };
		const quote = { _type: "blockquoteGroup", _key: "v", blocks: [full(1000)] };
		for (const container of [columns, quote]) {
			expect(guardPortableText([...Array.from({ length: 19 }, () => full(1000)), container])).toEqual([]);
			expect(guardPortableText([...Array.from({ length: 19 }, () => full(1000)), container, full(1)])).toEqual(["at most 20000 spans are allowed in total"]);
		}
	});
	it("reports a total after an earlier problem as a second entry, without the final entry", () => {
		const full = (n) => para(Array.from({ length: n }, () => span()));
		expect(guardPortableText([{ _type: "htmlBlock", _key: "h" }, ...Array.from({ length: 20 }, () => full(1000)), full(1)])).toEqual([
			"#0 htmlBlock: raw HTML blocks are not allowed; use Markdown or a Web9 block",
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

describe("guardPortableText: repeated keys in a table (core's reserveKey de-duplicates them in quadratic time)", () => {
	it("rejects two cells with the same _key", () => {
		expect(guardPortableText([table([row([{ ...cell([span("a")]), _key: "dup" }, { ...cell([]), _key: "dup" }])])])).toEqual(['#0 table rows[0].cells[1]._key: duplicate key "dup"']);
		expect(guardPortableText([table([row([{ ...cell([]), _key: "dup" }]), row([{ ...cell([]), _key: "dup" }])])])).toEqual(['#0 table rows[1].cells[0]._key: duplicate key "dup"']);
	});
	it("rejects a row, a cell or the table sharing a _key with another", () => {
		expect(guardPortableText([table([{ ...row([{ ...cell([]), _key: "x" }]), _key: "x" }])])).toEqual(['#0 table rows[0].cells[0]._key: duplicate key "x"']);
		expect(guardPortableText([table([row([]), { ...row([]), _key: "x" }, { ...row([]), _key: "x" }])])).toEqual(['#0 table rows[2]._key: duplicate key "x"']);
		expect(guardPortableText([{ ...table([row([{ ...cell([]), _key: "t" }])]), _key: "t" }])).toEqual(['#0 table rows[0].cells[0]._key: duplicate key "t"']);
	});
	it("ignores a missing, empty or non-string _key (core generates one)", () => {
		const bare = { _type: "tableCell", content: [] };
		expect(guardPortableText([table([row([bare, { ...bare, _key: "" }, { ...bare, _key: 5 }, { ...bare, _key: 5 }, { ...bare, _key: "" }, bare])])])).toEqual([]);
	});
	it("stops at 50 problems for 2000 cells with one key, before the normalizer runs", () => {
		const same = table([row(Array.from({ length: 2000 }, () => ({ ...cell([]), _key: "c" })))]);
		const problems = guardPortableText([same]);
		expect(problems).toHaveLength(51);
		expect(problems.slice(0, 2)).toEqual(['#0 table rows[0].cells[1]._key: duplicate key "c"', '#0 table rows[0].cells[2]._key: duplicate key "c"']);
		expect(problems[50]).toBe("…and more");
	});
});

describe("guardPortableText: tables on core's normalized grid (normalizePortableTextTable pads rows and fills empty cells)", () => {
	const grid = (rows, cols) => table(Array.from({ length: rows }, () => row(Array.from({ length: cols }, () => cell([])))));
	it("caps the grid core renders, not the cells written (a colspan of 100 and 199 empty rows)", () => {
		const wide = table([row([{ ...cell([]), colspan: 100 }]), ...Array.from({ length: 199 }, emptyRow)]);
		expect(guardPortableText([wide])).toEqual(["#0 table: at most 2000 cells are allowed (got 100×200 once core fills the grid)"]);
	});
	// 9 tables of 2000 slots and 2000 spans each leave 2000 spans of the total (and 2000 slots, which the blocks do not use).
	const spans = (n) => Array.from({ length: Math.ceil(n / 1000) }, (_, k) => para(Array.from({ length: Math.min(1000, n - k * 1000) }, () => span())));
	it("counts an empty cell as one span, as core renders it", () => {
		const nine = Array.from({ length: 9 }, () => grid(50, 40));
		expect(guardPortableText([...nine, ...spans(2000)])).toEqual([]);
		expect(guardPortableText([...nine, ...spans(2001)])).toEqual(["at most 20000 spans are allowed in total"]);
	});
	it("counts the cells core pads a short row with", () => {
		const ragged = () => table([row(Array.from({ length: 40 }, () => cell([]))), ...Array.from({ length: 49 }, () => row([cell([])]))]);
		const nine = Array.from({ length: 9 }, ragged);
		expect(guardPortableText([...nine, ...spans(2000)])).toEqual([]);
		expect(guardPortableText([...nine, ...spans(2001)])).toEqual(["at most 20000 spans are allowed in total"]);
	});
	it("rejects a table core cannot lay out", () => {
		const huge = table(Array.from({ length: 500 }, () => row([{ ...cell([]), colspan: 100 }])));
		expect(guardPortableText([huge])).toEqual(["#0 table: core cannot lay out this table (TABLE_TOO_LARGE)"]);
		expect(guardPortableText([table([row([cell([span("a", ["nope"])])])])])).toEqual(["#0 table: core cannot lay out this table (UNSUPPORTED_MARK_DEFINITION)"]);
	});
});

describe("guardPortableText: table grid slots over the whole value (core does work per slot, not per written cell)", () => {
	// One cell of colspan 100 and rowspan 20 over 20 rows: 2000 slots, one written cell, one rendered span.
	const slab = () => table([row([{ ...cell([]), colspan: 100, rowspan: 20 }]), ...Array.from({ length: 19 }, emptyRow)]);
	const MESSAGE = ["at most 20000 table cells are allowed in total (counting cells spanned by another)"];
	it("allows 20000 slots in total and stops at the table that passes it", () => {
		expect(guardPortableText(Array.from({ length: 10 }, slab))).toEqual([]);
		expect(guardPortableText(Array.from({ length: 11 }, slab))).toEqual(MESSAGE);
	});
	it("stops a value of 2000 such tables at the 11th, so the normalizer runs 11 times, not 2000", () => {
		expect(guardPortableText(Array.from({ length: 2000 }, slab))).toEqual(MESSAGE);
	});
});

describe("guardPortableText: markDefs over the whole value (the toolkit runs markDefs.find per mark)", () => {
	let id = 0;
	const defs = (n) => Array.from({ length: n }, () => ({ _type: "link", _key: `m${id++}`, href: "/x" }));
	const withDefs = (n) => ({ ...para([span()]), markDefs: defs(n) });
	const blocks = (n) => Array.from({ length: n }, () => withDefs(100));
	const both = (tableDefs, cellDefs) => ({ ...table([row([{ ...cell([]), markDefs: defs(cellDefs) }])]), markDefs: defs(tableDefs) });
	const MESSAGE = ["at most 5000 markDefs are allowed in total"];
	it("allows 5000 block markDefs in total", () => {
		expect(guardPortableText(blocks(50))).toEqual([]);
		expect(guardPortableText([...blocks(50), withDefs(1)])).toEqual(MESSAGE);
	});
	it("counts table and cell markDefs toward the same total", () => {
		expect(guardPortableText([...blocks(48), both(100, 100)])).toEqual([]);
		expect(guardPortableText([...blocks(48), both(100, 100), withDefs(1)])).toEqual(MESSAGE);
		expect(guardPortableText([...blocks(49), both(50, 51)])).toEqual(MESSAGE);
	});
	it("counts markDefs before it walks them, so a huge array is one problem", () => {
		expect(guardPortableText([withDefs(200000)])).toEqual(MESSAGE);
		expect(guardPortableText([{ ...table([row([cell([])])]), markDefs: defs(200000) }])).toEqual(MESSAGE);
		expect(guardPortableText([table([row([{ ...cell([]), markDefs: defs(200000) }])])])).toEqual(MESSAGE);
	});
});

describe("guardPortableText: markDefs per block, table and cell (the toolkit's find runs over one block's list)", () => {
	let id = 0;
	const defs = (n) => Array.from({ length: n }, () => ({ _type: "link", _key: `d${id++}`, href: "/x" }));
	const withDefs = (n) => ({ ...para([span()]), markDefs: defs(n) });
	it("allows at most 100 markDefs on a block, in a container too", () => {
		expect(guardPortableText([withDefs(100)])).toEqual([]);
		expect(guardPortableText([withDefs(1), withDefs(101)])).toEqual(["#1 block markDefs: at most 100 markDefs are allowed"]);
		expect(guardPortableText([{ _type: "cover", _key: "v", content: [withDefs(101)] }])).toEqual(["#0 cover content[0] block markDefs: at most 100 markDefs are allowed"]);
	});
	it("allows at most 100 markDefs on a table and on a cell", () => {
		const both = (tableDefs, cellDefs) => ({ ...table([row([{ ...cell([]), markDefs: defs(cellDefs) }])]), markDefs: defs(tableDefs) });
		expect(guardPortableText([both(100, 100)])).toEqual([]);
		expect(guardPortableText([both(101, 0)])).toEqual(["#0 table markDefs: at most 100 markDefs are allowed"]);
		expect(guardPortableText([both(0, 101)])).toEqual(["#0 table rows[0].cells[0] markDefs: at most 100 markDefs are allowed"]);
	});
	it("does not walk a list past the cap: one problem, however bad its entries", () => {
		const bad = Array.from({ length: 101 }, () => ({ _type: "constructor" }));
		expect(guardPortableText([{ ...para([span()]), markDefs: bad }])).toEqual(["#0 block markDefs: at most 100 markDefs are allowed"]);
	});
	it("reports the value-wide total first when a list passes both", () => {
		expect(guardPortableText([...Array.from({ length: 49 }, () => withDefs(100)), withDefs(101)])).toEqual(["at most 5000 markDefs are allowed in total"]);
	});
});

describe("guardPortableText: raw table rows (core maps every row before it falls back to a 1×1 grid)", () => {
	// 500 rows without cells: core lays out one empty cell, after it has keyed and copied all 500 rows.
	const hollow = () => table(Array.from({ length: 500 }, emptyRow));
	it("charges a table of cell-less rows one slot per row", () => {
		expect(guardPortableText(Array.from({ length: 40 }, hollow))).toEqual([]);
		expect(guardPortableText(Array.from({ length: 41 }, hollow))).toEqual(["at most 20000 table cells are allowed in total (counting cells spanned by another)"]);
	});
});

describe("guardPortableText: fields of table records (core's safeFields tests and copies every key)", () => {
	// Pads a record with x0, x1, ... (names core keeps) up to `n` own keys.
	const wide = (record, n) => {
		const out = { ...record };
		for (let i = 0; Object.keys(out).length < n; i++) out[`x${i}`] = 0;
		return out;
	};
	const link = () => ({ _type: "link", _key: `m${keys++}`, href: "/x" });
	it("allows at most 16 fields on a cell", () => {
		expect(guardPortableText([table([row([wide(cell([span()]), 16)])])])).toEqual([]);
		expect(guardPortableText([table([row([cell([]), wide(cell([span()]), 17)])])])).toEqual(["#0 table rows[0].cells[1]: at most 16 fields are allowed"]);
	});
	it("allows at most 16 fields on a row and on the table, rows or not", () => {
		expect(guardPortableText([table([wide(row([cell([])]), 16)])])).toEqual([]);
		expect(guardPortableText([table([row([cell([])]), wide(row([cell([])]), 17)])])).toEqual(["#0 table rows[1]: at most 16 fields are allowed"]);
		expect(guardPortableText([wide(table([row([cell([])])]), 16)])).toEqual([]);
		expect(guardPortableText([wide(table([row([cell([])])]), 17)])).toEqual(["#0 table: at most 16 fields are allowed"]);
		expect(guardPortableText([wide({ _type: "table", _key: "t" }, 17)])).toEqual(["#0 table: at most 16 fields are allowed"]);
	});
	it("allows at most 16 fields on a table or cell markDef", () => {
		const withCellDefs = (def) => table([row([{ ...cell([]), markDefs: [link(), def] }])]);
		expect(guardPortableText([withCellDefs(wide(link(), 16))])).toEqual([]);
		expect(guardPortableText([withCellDefs(wide(link(), 17))])).toEqual(["#0 table rows[0].cells[0] markDefs[1]: at most 16 fields are allowed"]);
		expect(guardPortableText([{ ...table([row([cell([])])]), markDefs: [wide(link(), 16)] }])).toEqual([]);
		expect(guardPortableText([{ ...table([row([cell([])])]), markDefs: [link(), wide(link(), 17)] }])).toEqual(["#0 table markDefs[1]: at most 16 fields are allowed"]);
	});
});

describe("guardPortableText: line breaks in span text (the toolkit splits and splices per newline)", () => {
	const lines = (n) => "x\n".repeat(n);
	// No `marks` key: the line check must not depend on it.
	const bare = (text) => ({ _type: "span", _key: `s${keys++}`, text });
	const TOTAL = ["at most 5000 line breaks are allowed in total"];
	it("allows at most 1000 line breaks in a span", () => {
		expect(guardPortableText([para([span(lines(1000))])])).toEqual([]);
		expect(guardPortableText([para([span("a"), span(lines(1001))])])).toEqual(["#0 block children[1].text: at most 1000 line breaks are allowed"]);
		expect(guardPortableText([para([bare(lines(1000))])])).toEqual([]);
		expect(guardPortableText([para([bare(lines(1001))])])).toEqual(["#0 block children[0].text: at most 1000 line breaks are allowed"]);
	});
	it("allows at most 5000 line breaks in total, across spans and blocks", () => {
		const five = Array.from({ length: 5 }, () => para([bare(lines(500)), span(lines(500))]));
		expect(guardPortableText(five)).toEqual([]);
		expect(guardPortableText([...five, para([span("a"), bare("\n")])])).toEqual(TOTAL);
		expect(guardPortableText([...five, { _type: "cover", _key: "v", content: [para([bare("\n")])] }])).toEqual(TOTAL);
	});
	it("counts line breaks in table cells the same way", () => {
		expect(guardPortableText([table([row([cell([span("a"), bare(lines(1001))])])])])).toEqual(["#0 table rows[0].cells[0] content[1].text: at most 1000 line breaks are allowed"]);
		const four = Array.from({ length: 4 }, () => para([span(lines(1000))]));
		expect(guardPortableText([...four, table([row([cell([bare(lines(999)), span("\n")])])])])).toEqual([]);
		expect(guardPortableText([...four, table([row([cell([bare(lines(1000)), span("\n")])])])])).toEqual(TOTAL);
	});
	it("leaves text that is not a string alone", () => {
		expect(guardPortableText([para([{ ...span(), text: 5 }, { ...span(), text: ["\n"] }])])).toEqual([]);
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
			for (const ok of [undefined, []]) expect(guardPortableText([{ _type: type, _key: "k", [field]: ok }])).toEqual([]);
		}
	});
	it("allows null tabs and tools, but not null buttons (core's Buttons.astro defaults only undefined)", () => {
		for (const [type, field] of [["tabs", "tabs"], ["tool_grid", "tools"]]) expect(guardPortableText([{ _type: type, _key: "k", [field]: null }])).toEqual([]);
		expect(guardPortableText([{ _type: "buttons", _key: "k", buttons: null }])).toEqual(["#0 buttons buttons: must be an array"]);
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

describe("guardPortableText: images over the whole value (core renders, and decodes a blurhash, per image)", () => {
	const image = (k) => ({ _type: "image", _key: `i${k}`, asset: { _ref: "x" } });
	const images = (n) => Array.from({ length: n }, (_, k) => image(k));
	const gallery = (n) => ({ _type: "gallery", _key: "g", images: Array.from({ length: n }, () => ({ asset: { _ref: "x" } })) });
	const MESSAGE = ["at most 500 images are allowed in total"];
	it("allows at most 500 images, counting image nodes and gallery images", () => {
		expect(guardPortableText(images(500))).toEqual([]);
		expect(guardPortableText(images(501))).toEqual(MESSAGE);
		expect(guardPortableText([gallery(500)])).toEqual([]);
		expect(guardPortableText([gallery(501)])).toEqual(MESSAGE);
		expect(guardPortableText([image(0), gallery(250), image(1), gallery(248)])).toEqual([]);
		expect(guardPortableText([image(0), gallery(250), image(1), gallery(249)])).toEqual(MESSAGE);
	});
	it("counts a gallery's images before it checks them, so a huge gallery is one problem", () => {
		expect(guardPortableText([gallery(1), { _type: "gallery", _key: "h", images: Array.from({ length: 200000 }, () => ({ blurhash: 1 })) }])).toEqual(MESSAGE);
	});
	it("leaves a gallery whose images are not an array to the other checks", () => {
		for (const bad of [null, "x", { length: 9999 }]) expect(guardPortableText([{ _type: "gallery", _key: "g", images: bad }])).toEqual([]);
	});
});
