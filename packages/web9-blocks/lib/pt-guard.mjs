// Write-time check of Portable Text values (spec §10). Returns a list of problems; empty means OK.
// Core renderers paste some block fields straight into class="" or style="" (cover.minHeight,
// image.dominantColor, columns[].width, button.style, code.language ...), core's htmlBlock/embed
// sanitizer keeps class/id/data-*, and MCP accepts any _type through a `<!--ec:block {json} -->` line.
// Top-level nodes are checked by _type. Children of a `block` are rendered inline through the same merged
// type map as top-level nodes (a cover or iframe in block.children renders as that core component), so a
// block may hold spans only.
// astro-portabletext looks components up as `map[name] || map` (components/PortableText.astro:120). The
// maps are plain objects (or, for `block`, a function), so a style, listItem, mark or _type such as
// "constructor" or "call" resolves to an inherited function and throws at render time, which takes the
// whole page down. So every name that reaches a lookup is checked against an allow-list: block.style,
// block.listItem, span marks and markDefs[]._type (checkBlock), and the _type of every top-level node.
// Container content (cover.content, columns[].content, blockquoteGroup.blocks) is rendered by
// astro-portabletext's own PortableText with only a `mark` map (cover/Columns/BlockquoteGroup.astro), whose
// `type` map is empty: a non-block node there is hidden at best, a prototype key crashes. It may hold
// blocks only, and each is checked like a top-level block (a fixed depth: container -> block -> span).
// Table cells (core: rows[] of { _type: "tableRow", cells[] }, a cell { _type: "tableCell", content: Span[], markDefs? })
// are walked for shape: rows and cells must be arrays of objects, a cell's content spans only, within the span and
// mark caps below, and a table holds at most MAX_ROWS rows and MAX_CELLS written cells. Core's Table.astro renders what
// normalizePortableTextTable returns, and that pads every row out to the grid width (a colspan counts for up to 100
// columns) and turns empty content into one empty span, so a few hundred bytes can render thousands of cells. So a table
// is also run through that normalizer (same module and specifier as Table.astro, which is a dependency of emdash and
// pinned with it): a table core cannot lay out is rejected (that covers mark names and markDefs in cells), the grid it
// fills (width × height) is capped at MAX_CELLS, and the spans it renders, padding included, are counted on that grid.
// The normalizer de-duplicates keys with a linear suffix scan per key (reserveKey), so repeated keys cost quadratic time
// at render: a table whose own, row or cell `_key`s repeat is rejected, and that check runs before the normalizer.
// Totals over the whole value (spec 2026-10-17 §3.6): render CPU grows with every span and, most, with every mark
// (plan 2 measured 0.3 s for one block of 1000 spans × 20 marks), so a value holds at most MAX_NODES top-level nodes,
// MAX_SPANS spans and MAX_TOTAL_MARKS marks, counting blocks, container blocks and table cells (on the normalized
// grid). Two more totals bound what a per-block or per-table cap cannot. Core's normalizer and Table.astro do work per
// grid slot of every table, however few cells are written (one cell of colspan 100 × rowspan 20 fills 2000 slots and is
// one span), so a value holds at most MAX_GRID_SLOTS slots. And @portabletext/toolkit builds marks with markDefs.find per
// mark (dist/index.js:65), so render cost is marks × markDefs per block: a value holds at most MAX_MARK_DEFS markDefs
// (blocks, tables and table cells), counted before they are walked or normalized. Past a total the walk stops with that
// one problem. Lists that a renderer maps (buttons.buttons, tabs.tabs,
// tool_grid.tools) must be arrays of objects within a size cap, and their text fields strings: a null item or a number
// tagline throws at render time, and so does `buttons: null` (core's Buttons.astro defaults only undefined).
// Output is bounded: collecting stops after MAX_PROBLEMS (plain pushes, never spreads of a long list, which
// throw RangeError past ~120k items) and ends with MORE, so a hostile value cannot make the guard throw.
// Messages print a value through show(): JSON.stringify overflows the stack on a value nested a few thousand levels
// deep (6154 in node), so show() catches that and prints [unprintable array|object]; a long string is cut first.
// sanitizeHref (emdash utils/url.ts) throws on a non-string, so every field a core or web9 renderer passes to
// it must be a string when present: link markDef href (marks/Link.astro:21), button.url (Button.astro:21),
// buttons[].url (Buttons.astro maps Button), file.url (File.astro:21), embed.url (astro/Embed.astro),
// tool_grid tools[].url and tools[].logo (astro/ToolGrid.astro:29, :34).
// Image values (an `image` field, `darkVariant`, PT image and gallery images) are checked for the colour and
// blurhash fields that core renderers paste into style or decode: a blurhash that does not decode throws.
// An `image` value also carries meta, a free-form record. EmDashImage.astro reads meta.dominantColor and
// meta.blurhash as fallbacks and builds the src from meta.storageKey in a template string (media/url.ts), which
// throws for an object without a callable toString; so meta.storageKey must be a string when present.
// Image values inside the blocks of a `blocks` field (pages.layout: hero.image, feature_grid.features[].image)
// are rendered by the same component and get the same checks (guardBlockImages). content:beforeSave runs before
// core's normalizeBlocksData (emdash-runtime.ts), so the walk sees the raw value and must survive any shape.
// Size caps, because the renderers are not linear in them: @portabletext/toolkit's buildMarksTree nests one
// component per mark (3000 marks on a span overflow the stack), and its sortMarksByOccurences is O(n²) in a
// block's children (20k spans = 12 s of CPU). So a span has at most MAX_MARKS marks and a block at most
// MAX_CHILDREN children. `_key` reaches template strings (`${_key}-group` in emdash
// portable-text-blockquote-group.ts:60), which throw for an object without a callable toString, so a `_key`
// must be a string when present on every node checked here.
// Ordered-list continuity (emdash content/portable-text-lists.ts): `listId` is only ever a Map key or part of a
// JSON string there (no plain-object lookup, so prototype names are harmless), and `listStart` becomes the
// `<ol start>` of OrderedList.astro. Both are bounded when present: listId a string of at most MAX_LIST_ID
// characters, listStart an integer from 1 to MAX_LIST_START.
import { normalizePortableTextTable } from "@emdash-cms/admin/portable-text-table";
import { blurhashToImageCssString } from "@unpic/placeholder";
import { LOGO_SIZE } from "./tool-grid.mjs";

const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i;
const LENGTH = /^\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%)$/;
const MIN_HEIGHT = /^(?:\d{1,4}(?:\.\d{1,2})?(?:px|rem|em)|(?:100|\d{1,2})(?:\.\d{1,2})?vh)$/;
const LANGUAGE = /^[\w+#.-]{1,32}$/;

const oneOf = (...values) => (v) => values.includes(v);
const matches = (re) => (v) => typeof v === "string" && re.test(v);
const numberIn = (min, max) => (v) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integerIn = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const BUTTON_STYLE = oneOf("default", "outline", "fill");
/** Same check core makes (blurhashToImageCssString in Image.astro / EmDashImage.astro); a throw there is a 500. */
const validBlurhash = (v) => {
	if (typeof v !== "string") return false;
	try {
		blurhashToImageCssString(v);
		return true;
	} catch {
		return false;
	}
};
const COLOR_OK = matches(COLOR);
const STRING = (v) => typeof v === "string";

const MAX_PROBLEMS = 50;
const MORE = "…and more";

/** Keeps the first MAX_PROBLEMS problems. `full` turns true once one was left out or the walk was stopped, so loops end. */
function collector() {
	const list = [];
	let dropped = false;
	return {
		full: false,
		spans: 0,
		marks: 0,
		slots: 0,
		markDefs: 0,
		added: 0,
		add(problem) {
			this.added++;
			if (list.length < MAX_PROBLEMS) list.push(problem);
			else dropped = this.full = true;
		},
		/** Adds `problem` and ends the walk (a total cap is past). */
		stop(problem) {
			this.add(problem);
			this.full = true;
		},
		done() {
			return dropped ? [...list, MORE] : list;
		},
	};
}

/** Adds spans, marks, table grid slots and markDefs to the value's totals; past one, stops the walk with its problem. */
function count(out, { spans = 0, marks = 0, slots = 0, markDefs = 0 }) {
	if (out.full) return;
	out.spans += spans;
	out.marks += marks;
	out.slots += slots;
	out.markDefs += markDefs;
	if (out.spans > MAX_SPANS) out.stop(`at most ${MAX_SPANS} spans are allowed in total`);
	else if (out.marks > MAX_TOTAL_MARKS) out.stop(`at most ${MAX_TOTAL_MARKS} marks are allowed in total`);
	else if (out.slots > MAX_GRID_SLOTS) out.stop(`at most ${MAX_GRID_SLOTS} table cells are allowed in total (counting cells spanned by another)`);
	else if (out.markDefs > MAX_MARK_DEFS) out.stop(`at most ${MAX_MARK_DEFS} markDefs are allowed in total`);
}

/** Field checks per allowed _type. Paths use `a.b` for nesting and `list[].field` for arrays. */
const RULES = {
	block: {},
	blockquoteGroup: {},
	break: {},
	table: {},
	file: { url: STRING },
	pullquote: {},
	video: {},
	image: {
		alignment: oneOf("left", "center", "right", "wide", "full"),
		dominantColor: COLOR_OK,
		"asset.meta.dominantColor": COLOR_OK,
		blurhash: validBlurhash,
		"asset.meta.blurhash": validBlurhash,
	},
	gallery: {
		columns: integerIn(1, 6),
		"images[].dominantColor": COLOR_OK,
		"images[].asset.meta.dominantColor": COLOR_OK,
		"images[].blurhash": validBlurhash,
		"images[].asset.meta.blurhash": validBlurhash,
	},
	columns: { "columns[].width": matches(LENGTH) },
	cover: { minHeight: matches(MIN_HEIGHT), overlayColor: matches(COLOR), overlayOpacity: numberIn(0, 1), alignment: oneOf("left", "center", "right") },
	button: { style: BUTTON_STYLE, url: STRING },
	buttons: { layout: oneOf("horizontal", "vertical"), "buttons[].style": BUTTON_STYLE, "buttons[].url": STRING },
	code: { language: matches(LANGUAGE) },
	embed: { html: (v) => v === "", url: STRING }, // web9's Embed renders from url only
	callout: {},
	tabs: {},
	details: {},
	mermaid: {},
	tool_grid: { logo_size: numberIn(LOGO_SIZE.min, LOGO_SIZE.max), "tools[].url": STRING, "tools[].logo": STRING },
	investment_warning: { lang: oneOf("zh", "en") },
};

const FORBIDDEN = {
	htmlBlock: "raw HTML blocks are not allowed; use Markdown or a Web9 block",
	iframe: "iframes are not allowed; use an embed block with a YouTube or Vimeo url",
};

/** Every value at `path` (absent ones skipped). */
function valuesAt(node, path) {
	let current = [node];
	for (const part of path.split(".")) {
		const list = part.endsWith("[]");
		const key = list ? part.slice(0, -2) : part;
		current = current.flatMap((v) => {
			const next = v && typeof v === "object" ? v[key] : undefined;
			if (list) return Array.isArray(next) ? next : [];
			return [next];
		});
	}
	return current.filter((v) => v !== undefined && v !== null);
}

const MAX_SHOWN = 60;

/**
 * A value as it appears in a problem: its JSON, cut to MAX_SHOWN characters. Never throws: JSON.stringify
 * overflows the stack on a value nested a few thousand levels deep (the guard sees raw request data), so
 * that one prints as [unprintable array] or [unprintable object]. A string is cut before it is serialised.
 */
function show(v) {
	try {
		const json = JSON.stringify(typeof v === "string" ? v.slice(0, MAX_SHOWN) : v);
		return json === undefined ? String(v) : json.slice(0, MAX_SHOWN);
	} catch {
		return `[unprintable ${Array.isArray(v) ? "array" : typeof v}]`;
	}
}

/** Adds `path: value ... is not allowed` to `out` per failing value of one node. */
function checkRules(node, rules, prefix, out) {
	for (const [path, ok] of Object.entries(rules)) {
		for (const v of valuesAt(node, path)) {
			if (out.full) return;
			if (!ok(v)) out.add(`${prefix}${path}: value ${show(v)} is not allowed`);
		}
	}
}

const notAllowed = (where, field, v) => `${where} ${field}: value ${show(v)} is not allowed`;

// Names core renders. Sets, so a lookup never reaches Object.prototype.
// style: components/Block.astro and the default block map; listItem: astro-portabletext's default list maps.
const BLOCK_STYLES = new Set(["normal", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]);
const LIST_ITEMS = new Set(["bullet", "number", "menu"]);
// Decorators the editor emits (emdash content/converters/mark-safety.ts) and renders (components/marks.ts).
const DECORATORS = new Set(["strong", "em", "underline", "strike-through", "subscript", "superscript", "code"]);
const MAX_LIST_LEVEL = 20;
const MAX_LIST_ID = 128; // emdash normalizeListId (content/converters/numbered-list.ts) ignores longer ones
const MAX_LIST_START = 100000;
const MAX_MARKS = 20;
const MAX_CHILDREN = 1000;
const MAX_NODES = 2000;
const MAX_SPANS = 20000;
const MAX_TOTAL_MARKS = 5000;
const MAX_GRID_SLOTS = 20000;
const MAX_MARK_DEFS = 5000;
const MAX_ROWS = 500;
const MAX_CELLS = 2000;
/**
 * Lists a renderer maps: [field, max items, string fields of an item, boolean fields of an item, null allowed].
 * url/logo are in RULES. Core's Buttons.astro defaults the list only for undefined (`const { buttons = [] } = node`),
 * so `buttons: null` throws there; web9's Tabs and ToolGrid tolerate null.
 */
const LISTS = {
	buttons: ["buttons", 10, ["text"], [], false],
	tabs: ["tabs", 20, ["label", "body"], [], true],
	tool_grid: ["tools", 100, ["name", "tagline"], ["featured"], true],
};

/** `_key` may be absent (undefined or null); when present it must be a string. */
function checkKey(node, where, field, out) {
	if (node._key != null && typeof node._key !== "string") out.add(notAllowed(where, field, node._key));
}

/** Block children are rendered as custom types, so anything but a plain span is a way past the type check. */
function checkBlock(node, where, out) {
	checkKey(node, where, "_key", out);
	if (node.style != null && !BLOCK_STYLES.has(node.style)) out.add(notAllowed(where, "style", node.style));
	if (node.listItem != null && !LIST_ITEMS.has(node.listItem)) out.add(notAllowed(where, "listItem", node.listItem));
	if (node.level != null && !integerIn(1, MAX_LIST_LEVEL)(node.level)) out.add(notAllowed(where, "level", node.level));
	if (node.listId != null && !(typeof node.listId === "string" && node.listId.length <= MAX_LIST_ID)) out.add(notAllowed(where, "listId", node.listId));
	if (node.listStart != null && !integerIn(1, MAX_LIST_START)(node.listStart)) out.add(notAllowed(where, "listStart", node.listStart));

	// The only annotation core renders is link. Keys are what span marks point at: no inherited names.
	const keys = new Set();
	if (node.markDefs != null && !Array.isArray(node.markDefs)) out.add(`${where} markDefs: must be an array`);
	else {
		const defs = node.markDefs ?? [];
		count(out, { markDefs: defs.length });
		for (let k = 0; k < defs.length && !out.full; k++) {
			const def = defs[k];
			if (def?._type !== "link") out.add(notAllowed(where, `markDefs[${k}]._type`, def?._type));
			else if (typeof def.href !== "string") out.add(notAllowed(where, `markDefs[${k}].href`, def.href));
			const key = def?._key;
			if (typeof key !== "string" || !key || key in Object.prototype) out.add(notAllowed(where, `markDefs[${k}]._key`, key));
			else keys.add(key);
		}
	}

	if (out.full) return;
	if (node.children === undefined) return;
	if (!Array.isArray(node.children)) return out.add(`${where} children: must be an array of spans`);
	if (node.children.length > MAX_CHILDREN) return out.add(`${where} children: at most ${MAX_CHILDREN} spans are allowed`);
	count(out, { spans: node.children.length });
	for (let j = 0; j < node.children.length && !out.full; j++) {
		const child = node.children[j];
		const type = typeof child?._type === "string" ? child._type : "(no _type)";
		if (type !== "span") {
			out.add(`${where} children[${j}] ${type}: only spans are allowed inside a block`);
			continue;
		}
		checkKey(child, where, `children[${j}]._key`, out);
		if (child.children !== undefined && child.children !== null) out.add(`${where} children[${j}] span: a span must not have children`);
		if (child.marks == null) continue;
		if (!Array.isArray(child.marks)) {
			out.add(`${where} children[${j}].marks: must be an array`);
			continue;
		}
		if (child.marks.length > MAX_MARKS) {
			out.add(`${where} children[${j}].marks: at most ${MAX_MARKS} marks are allowed`);
			continue;
		}
		count(out, { marks: child.marks.length });
		for (let m = 0; m < child.marks.length && !out.full; m++) {
			const mark = child.marks[m];
			if (typeof mark !== "string" || !(DECORATORS.has(mark) || keys.has(mark))) out.add(notAllowed(where, `children[${j}].marks`, mark));
		}
	}
}

/** Portable Text arrays inside containers: [path, value] pairs, e.g. ["columns[1].content", [...]]. */
function containerLists(node, type) {
	if (type === "cover") return [["content", node.content]];
	if (type === "blockquoteGroup") return [["blocks", node.blocks]];
	if (type === "columns") return Array.isArray(node.columns) ? node.columns.map((column, k) => [`columns[${k}].content`, column?.content]) : [];
	return [];
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Columns.astro maps `columns` and reads column.width, so a non-array or a null column throws. */
function checkColumns(node, i, out) {
	if (node.columns == null) return;
	if (!Array.isArray(node.columns)) return out.add(`#${i} columns columns: must be an array of columns`);
	for (let k = 0; k < node.columns.length && !out.full; k++) {
		const column = node.columns[k];
		if (!isObject(column)) out.add(`#${i} columns columns[${k}]: must be an object`);
	}
}

/** A table cell's content: spans only (core renders them inline), within the span and mark caps. Spans are counted by checkTable. */
function checkCell(cell, at, out) {
	if (Array.isArray(cell.markDefs)) count(out, { markDefs: cell.markDefs.length });
	if (out.full || cell.content == null) return;
	if (!Array.isArray(cell.content)) return out.add(`${at} content: must be an array of spans`);
	if (cell.content.length > MAX_CHILDREN) return out.add(`${at} content: at most ${MAX_CHILDREN} spans are allowed`);
	for (let j = 0; j < cell.content.length && !out.full; j++) {
		const span = cell.content[j];
		const type = typeof span?._type === "string" ? span._type : "(no _type)";
		if (type !== "span") {
			out.add(`${at} content[${j}] ${type}: only spans are allowed in a table cell`);
			continue;
		}
		if (span.children != null) out.add(`${at} content[${j}] span: a span must not have children`);
		if (span.marks == null) continue;
		if (!Array.isArray(span.marks)) out.add(`${at} content[${j}].marks: must be an array`);
		else if (span.marks.length > MAX_MARKS) out.add(`${at} content[${j}].marks: at most ${MAX_MARKS} marks are allowed`);
		else count(out, { marks: span.marks.length });
	}
}

/**
 * core's Table.astro maps rows[].cells[]: arrays of objects, within MAX_ROWS rows and MAX_CELLS written cells, with no
 * `_key` repeated among the table, its rows and its cells (the normalizer de-duplicates keys with a linear suffix scan
 * per key, `reserveKey`, so repeats cost quadratic time at render). These bound one normalizer run, not the sum over a
 * value. Then core's own normalizer lays the table out: one it cannot lay out is rejected, the grid it fills (work per
 * slot, however few cells are written) is capped at MAX_CELLS and counted toward MAX_GRID_SLOTS for the value, and the
 * spans it renders (empty and padded cells are one span each) count toward MAX_SPANS. The markDefs of the table and of
 * each cell count toward MAX_MARK_DEFS as they are met, before any normalizer run.
 */
function checkTable(node, i, out) {
	const where = `#${i} table`;
	if (Array.isArray(node.markDefs)) count(out, { markDefs: node.markDefs.length });
	if (out.full || node.rows == null) return;
	if (!Array.isArray(node.rows)) return out.add(`${where} rows: must be an array`);
	if (node.rows.length > MAX_ROWS) return out.add(`${where} rows: at most ${MAX_ROWS} rows are allowed`);
	let cells = 0;
	const added = out.added;
	// The keys core's reserveKey puts in one set; a missing, empty or non-string key is replaced by a generated one.
	const seen = new Set();
	const checkUnique = (key, at) => {
		if (typeof key !== "string" || !key) return;
		if (seen.has(key)) out.add(`${at}._key: duplicate key ${show(key)}`);
		else seen.add(key);
	};
	checkUnique(node._key, where);
	for (let r = 0; r < node.rows.length && !out.full; r++) {
		const row = node.rows[r];
		if (!isObject(row)) {
			out.add(`${where} rows[${r}]: must be an object`);
			continue;
		}
		checkUnique(row._key, `${where} rows[${r}]`);
		if (row.cells == null) continue;
		if (!Array.isArray(row.cells)) {
			out.add(`${where} rows[${r}].cells: must be an array`);
			continue;
		}
		cells += row.cells.length;
		if (cells > MAX_CELLS) return out.add(`${where}: at most ${MAX_CELLS} cells are allowed`);
		for (let c = 0; c < row.cells.length && !out.full; c++) {
			const at = `${where} rows[${r}].cells[${c}]`;
			if (!isObject(row.cells[c])) out.add(`${at}: must be an object`);
			else {
				checkUnique(row.cells[c]._key, at);
				checkCell(row.cells[c], at, out);
			}
		}
	}
	// A table that already has a problem is rejected anyway; the normalizer would only repeat it as a failure.
	if (out.full || out.added !== added) return;
	let key = 0;
	const normalized = normalizePortableTextTable(node, { path: "guard:table", createKey: () => `guard-${key++}` });
	if (!normalized.ok) return out.stop(`${where}: core cannot lay out this table (${normalized.reason})`);
	const { width, height } = normalized;
	if (width * height > MAX_CELLS) return out.stop(`${where}: at most ${MAX_CELLS} cells are allowed (got ${width}×${height} once core fills the grid)`);
	count(out, { slots: width * height });
	if (out.full) return;
	let spans = 0;
	for (const row of normalized.table.rows) for (const cell of row.cells) spans += Math.max(1, cell.content?.length ?? 0);
	count(out, { spans });
}

/** A list a renderer maps (LISTS): an array of objects within its cap (null only where allowed), text fields strings, flags booleans. */
function checkList(node, type, i, out) {
	const [field, max, strings, booleans, nullable] = LISTS[type];
	const list = node[field];
	const where = `#${i} ${type} ${field}`;
	if (list === undefined || (list === null && nullable)) return;
	if (!Array.isArray(list)) return out.add(`${where}: must be an array`);
	if (list.length > max) return out.add(`${where}: at most ${max} items are allowed`);
	for (let k = 0; k < list.length && !out.full; k++) {
		const item = list[k];
		if (!isObject(item)) {
			out.add(`${where}[${k}]: must be an object`);
			continue;
		}
		for (const key of strings) if (item[key] != null && typeof item[key] !== "string") out.add(notAllowed(`#${i} ${type}`, `${field}[${k}].${key}`, item[key]));
		for (const key of booleans) if (item[key] != null && typeof item[key] !== "boolean") out.add(notAllowed(`#${i} ${type}`, `${field}[${k}].${key}`, item[key]));
	}
}

function checkContainers(node, type, i, out) {
	for (const [path, list] of containerLists(node, type)) {
		if (list == null) continue;
		if (!Array.isArray(list)) {
			out.add(`#${i} ${type} ${path}: must be an array`);
			continue;
		}
		for (let k = 0; k < list.length && !out.full; k++) {
			const child = list[k];
			const childType = typeof child?._type === "string" ? child._type : "(no _type)";
			if (childType !== "block") out.add(`#${i} ${type} ${path}[${k}] ${childType}: only blocks are allowed in container content`);
			else checkBlock(child, `#${i} ${type} ${path}[${k}] block`, out);
		}
	}
}

/**
 * An empty body is absent, null, [] or a blank string (core stores that as null after the hook). Any other
 * non-array is rejected here rather than left to core's own check, which runs after the hook.
 */
export function guardPortableText(value) {
	if (value == null || (typeof value === "string" && !value.trim())) return [];
	if (!Array.isArray(value)) return [`value ${show(value)} is not allowed: a Portable Text field must be an array of blocks`];
	if (value.length > MAX_NODES) return [`at most ${MAX_NODES} top-level blocks are allowed (got ${value.length})`];
	const out = collector();
	for (let i = 0; i < value.length && !out.full; i++) {
		const node = value[i];
		const type = typeof node?._type === "string" ? node._type : "(no _type)";
		if (Object.hasOwn(FORBIDDEN, type)) {
			out.add(`#${i} ${type}: ${FORBIDDEN[type]}`);
			continue;
		}
		if (!Object.hasOwn(RULES, type)) {
			out.add(`#${i} ${type}: unknown block type`);
			continue;
		}
		// astro-portabletext treats any node with a children array as a block and renders those children inline
		if (type === "block") checkBlock(node, `#${i} block`, out);
		else {
			checkKey(node, `#${i} ${type}`, "_key", out);
			if (node.children !== undefined && node.children !== null) out.add(`#${i} ${type} children: only a block may have children`);
		}
		if (type === "columns") checkColumns(node, i, out);
		if (type === "table") checkTable(node, i, out);
		if (Object.hasOwn(LISTS, type)) checkList(node, type, i, out);
		checkContainers(node, type, i, out);
		checkRules(node, RULES[type], `#${i} ${type} `, out);
	}
	return out.done();
}

/** Colour and placeholder fields of a media value (the `image` field, which also carries `darkVariant`). */
const MEDIA_RULES = {
	dominantColor: COLOR_OK,
	blurhash: validBlurhash,
	"meta.dominantColor": COLOR_OK,
	"meta.blurhash": validBlurhash,
	"meta.storageKey": STRING,
};
const IMAGE_VALUE_RULES = {
	...MEDIA_RULES,
	...Object.fromEntries(Object.entries(MEDIA_RULES).map(([path, ok]) => [`darkVariant.${path}`, ok])),
};

/** @param {unknown} value an `image` field value; returns problems, empty means OK */
export function guardImageValue(value) {
	const out = collector();
	checkRules(value, IMAGE_VALUE_RULES, "", out);
	return out.done();
}

/** [label, value] of every non-null value at `path` ("image", "features[].image"); arrays add their index to the label. */
function labelledValuesAt(node, path) {
	let current = [["", node]];
	for (const part of path.split(".")) {
		const list = part.endsWith("[]");
		const key = list ? part.slice(0, -2) : part;
		current = current.flatMap(([label, v]) => {
			const next = v && typeof v === "object" ? v[key] : undefined;
			const at = label ? `${label}.${key}` : key;
			if (list) return Array.isArray(next) ? next.map((item, k) => [`${at}[${k}]`, item]) : [];
			return next === undefined || next === null ? [] : [[at, next]];
		});
	}
	return current;
}

/**
 * Image values inside the blocks of a `blocks` field.
 * @param {unknown} value the field value, e.g. pages.layout
 * @param {Record<string, string[]>} imagePaths per block `_type`, the paths of its image values ("image", "features[].image")
 * @returns problems like `#1 feature_grid features[0].image.dominantColor: value "..." is not allowed`; empty means OK.
 * A block whose `_type` has no entry is left to core (normalizeBlocksData allows only the field's types).
 */
export function guardBlockImages(value, imagePaths) {
	const out = collector();
	if (!Array.isArray(value)) return out.done();
	for (let i = 0; i < value.length && !out.full; i++) {
		const block = value[i];
		const type = block !== null && typeof block === "object" ? block._type : undefined;
		if (typeof type !== "string" || !Object.hasOwn(imagePaths, type)) continue;
		for (const path of imagePaths[type]) {
			for (const [label, image] of labelledValuesAt(block, path)) {
				if (out.full) break;
				checkRules(image, IMAGE_VALUE_RULES, `#${i} ${type} ${label}.`, out);
			}
		}
	}
	return out.done();
}
