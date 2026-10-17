// How often the guard runs core's table normalizer on one value: the value-wide totals bound it, not the table count.
// Its own file because vi.mock wraps the normalizer for every test in the file.
import { normalizePortableTextTable } from "@emdash-cms/admin/portable-text-table";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardPortableText } from "./pt-guard.mjs";

vi.mock("@emdash-cms/admin/portable-text-table", async (importOriginal) => {
	const real = await importOriginal();
	return { ...real, normalizePortableTextTable: vi.fn(real.normalizePortableTextTable) };
});

let keys = 0;
const cell = (extra) => ({ _type: "tableCell", _key: `c${keys++}`, content: [], ...extra });
const row = (cells) => ({ _type: "tableRow", _key: `r${keys++}`, cells });
const emptyRow = () => ({ _type: "tableRow", _key: `r${keys++}` });
const table = (rows) => ({ _type: "table", _key: "t", rows });
const SLOTS = ["at most 20000 table cells are allowed in total (counting cells spanned by another)"];

describe("guardPortableText: runs of core's table normalizer per value", () => {
	beforeEach(() => {
		normalizePortableTextTable.mockClear();
	});
	it("stops 2000 tables of 2000 slots after 11 runs", () => {
		const slab = () => table([row([cell({ colspan: 100, rowspan: 20 })]), ...Array.from({ length: 19 }, emptyRow)]);
		expect(guardPortableText(Array.from({ length: 2000 }, slab))).toEqual(SLOTS);
		expect(normalizePortableTextTable).toHaveBeenCalledTimes(11);
	});
	it("stops tables of 500 cell-less rows after 41 runs (each raw row is charged as a slot)", () => {
		const hollow = () => table(Array.from({ length: 500 }, emptyRow));
		expect(guardPortableText(Array.from({ length: 100 }, hollow))).toEqual(SLOTS);
		expect(normalizePortableTextTable).toHaveBeenCalledTimes(41);
	});
	it("does not run it on a table that already has a problem", () => {
		const wide = cell();
		for (let i = 0; i < 40; i++) wide[`x${i}`] = 0;
		expect(guardPortableText([table([row([wide])])])).toEqual(["#0 table rows[0].cells[0]: at most 32 fields are allowed"]);
		expect(normalizePortableTextTable).not.toHaveBeenCalled();
	});
});
