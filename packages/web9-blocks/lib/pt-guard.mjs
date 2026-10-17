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
// The normalizer also copies the table, each row, each cell and each table or cell markDef through safeFields, which runs
// a regex over every own key, so each of those records holds at most MAX_RECORD_KEYS fields: checked in the walk, and a
// table with any problem, a wide table node or markDef included, is never passed to the normalizer.
// Totals over the whole value (spec 2026-10-17 §3.6): render CPU grows with every span and, most, with every mark
// (plan 2 measured 0.3 s for one block of 1000 spans × 20 marks), so a value holds at most MAX_NODES top-level nodes,
// MAX_SPANS spans and MAX_TOTAL_MARKS marks, counting blocks, container blocks and table cells (on the normalized
// grid). Three more totals bound what a per-block or per-table cap cannot. Core's normalizer and Table.astro do work per
// grid slot of every table, however few cells are written (one cell of colspan 100 × rowspan 20 fills 2000 slots and is
// one span), so a value holds at most MAX_GRID_SLOTS slots; a table whose rows hold no cells is laid out as one cell, but
// only after every raw row is keyed and copied, so a table is charged max(grid slots, raw rows). And
// @portabletext/toolkit builds marks with markDefs.find per mark (astro-portabletext's copy, 3.0.3, dist/index.js:81),
// so render cost is marks × markDefs per block: a value holds at most MAX_MARK_DEFS markDefs (blocks, tables and table
// cells), counted before they are walked or normalized, and one block, table or cell at most MAX_BLOCK_MARK_DEFS, checked
// after the total (the find runs over one block's list; Table.astro resolves a cell's through a Map, but its lists get
// the same cap). Core renders every image node and gallery image, and decodes its blurhash (133 µs for 9×9 components),
// so a value holds at most MAX_IMAGES images, counted before they are checked. Past a total the walk stops with that one
// problem. Lists that a renderer maps (buttons.buttons, tabs.tabs, tool_grid.tools) must be arrays of objects within a
// size cap, and their text fields strings: a null item or a number tagline throws at render time, and so does
// `buttons: null` (core's Buttons.astro defaults only undefined). tabs.default_tab must name one of the tabs.
// Output is bounded: collecting stops after MAX_PROBLEMS (plain pushes, never spreads of a long list, which
// throw RangeError past ~120k items) and ends with MORE, so a hostile value cannot make the guard throw.
// Messages print a value through show(): JSON.stringify overflows the stack on a value nested a few thousand levels
// deep (6154 in node), so show() catches that and prints [unprintable array|object]; a long string is cut first.
// sanitizeHref (emdash utils/url.ts) throws on a non-string, so every field a core or web9 renderer passes to
// it must be a string when present: link markDef href (marks/Link.astro:21), button.url (Button.astro:21),
// buttons[].url (Buttons.astro maps Button), file.url (File.astro:21), embed.url (astro/Embed.astro),
// tool_grid tools[].url and tools[].logo (astro/ToolGrid.astro: the link's href and the logo img's src).
// Image values (an `image` field, `darkVariant`, PT image and gallery images) are checked for the colour and
// blurhash fields that core renderers paste into style or decode: a blurhash the decoder rejects throws (validBlurhash).
// An `image` value also carries meta, a free-form record. EmDashImage.astro reads meta.dominantColor and
// meta.blurhash as fallbacks and builds the src from meta.storageKey in a template string (media/url.ts), which
// throws for an object without a callable toString; so meta.storageKey must be a string when present.
// The same holds for every block text field a renderer prints (TEXT, and the item fields of LISTS): Astro's text and
// attribute escaping and renderMarkdown call String() on it, which throws for {"toString":1} and overflows on an array
// nested a few thousand deep, so each must be a string when present. Markdown fields (callout, details, tab bodies, tool
// taglines) run marked and sanitize-html on every render, and marked is super-linear on dense delimiters, so each is
// capped (LIMITS.markdown, LIMITS.inlineMarkdown) and a value holds at most MAX_MARKDOWN Markdown characters, counted
// before its nodes are checked (a field over its own cap counts up to the cap, so its own problem names it). Length does
// not bound marked's CPU, so a field within its length cap is also capped in delimiter density and line breaks ×
// characters, per field and over the value (the value totals counted like the others), and in the tail and starts of
// bare links, per field (markdown-density.mjs). Mermaid and code-block source is capped at LIMITS.code, a cover's
// background URLs at LIMITS.url. Plain-text fields are only type-checked: Astro escapes them in linear time.
// Image values inside the blocks of a `blocks` field (pages.layout: hero.image, feature_grid.features[].image)
// are rendered by the same component and get the same checks (guardBlockImages), and their printed text values the
// string-and-length check (guardBlockText). content:beforeSave runs before
// core's normalizeBlocksData (emdash-runtime.ts), so the walk sees the raw value and must survive any shape.
// Size caps, because the renderers are not linear in them: @portabletext/toolkit's buildMarksTree nests one
// component per mark (3000 marks on a span overflow the stack), and its sortMarksByOccurences is O(n²) in a
// block's children (20k spans = 12 s of CPU). So a span has at most MAX_MARKS marks and a block at most
// MAX_CHILDREN children. buildMarksTree also splits span text on "\n" and splices a "\n" node back in per line from the
// tail (astro-portabletext's copy, 3.0.3, dist/index.js:91-95), quadratic per span (80k line breaks = 1.6 s), so a span
// holds at most MAX_SPAN_LINES line breaks and a value at most MAX_TOTAL_LINES (blocks, container blocks and table cells).
// `_key` reaches template strings (`${_key}-group` in emdash portable-text-blockquote-group.ts:60), which throw for an
// object without a callable toString, so a `_key` must be a string when present on every node checked here.
// Ordered-list continuity (emdash content/portable-text-lists.ts): `listId` is only ever a Map key or part of a
// JSON string there (no plain-object lookup, so prototype names are harmless), and `listStart` becomes the
// `<ol start>` of OrderedList.astro. Both are bounded when present: listId a string of at most MAX_LIST_ID
// characters, listStart an integer from 1 to MAX_LIST_START.
import { normalizePortableTextTable } from "@emdash-cms/admin/portable-text-table";
import { LIMITS } from "./limits.mjs";
import { DEST_PARENS, FIELD_CAPS, LINE_BUDGET, LINE_MARKERS, LINK_STARTS, LINK_TAIL, VALUE_CAPS, markdownDensity } from "./markdown-density.mjs";
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
/** The base83 alphabet of blurhash (2.0.5, dist/index.mjs `q`). */
const BASE83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
/**
 * True exactly when the decoder core renders with accepts `v`; a throw there is a 500. Image.astro, Gallery.astro and
 * EmDashImage.astro call @unpic/placeholder's blurhashToImageCssString (0.1.2), which runs blurhash's decode(v, 8, 8)
 * (2.0.5). decode throws only in its validator: a falsy or shorter than 6 string, or a length other than
 * 4 + 2 × numX × numY, both read from the first character (one outside the alphabet reads as -1, so it asks for length 4
 * and always throws). Every other character is read with indexOf, an unknown one as -1: wrong pixels, never a throw; the
 * BMP and base64 steps that follow take bytes only. So this is the decoder's own test without the decode (133 µs per 9×9
 * hash; a gallery of 11k of them took 3 s on save). It does not require every character to be base83, which would reject
 * hashes that render today. pt-guard.blurhash.test.mjs sweeps it against the real decoder and pins both versions.
 */
const validBlurhash = (v) => {
	if (typeof v !== "string") return false;
	const size = BASE83.indexOf(v[0]);
	return size !== -1 && v.length === 4 + 2 * (Math.floor(size / 9) + 1) * ((size % 9) + 1);
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
		lines: 0,
		images: 0,
		markdown: 0,
		delimiters: Object.fromEntries(Object.keys(VALUE_CAPS).map((c) => [c, 0])),
		destParens: 0,
		lineCost: 0,
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

/** How a density problem names a class of markdown-density.mjs. */
const delimiterName = (c) => (c === "](" ? '"](" link openers' : `"${c}" characters`);

/**
 * Adds spans, marks, table grid slots, markDefs, line breaks, images, Markdown characters, Markdown delimiters (per class),
 * "(" in Markdown link destinations and Markdown line breaks × field characters to the value's totals; past one, stops the
 * walk with its problem.
 */
function count(out, { spans = 0, marks = 0, slots = 0, markDefs = 0, lines = 0, images = 0, markdown = 0, delimiters = {}, destParens = 0, lineCost = 0 }) {
	if (out.full) return;
	out.spans += spans;
	out.marks += marks;
	out.slots += slots;
	out.markDefs += markDefs;
	out.lines += lines;
	out.images += images;
	out.markdown += markdown;
	for (const [c, n] of Object.entries(delimiters)) out.delimiters[c] += n;
	out.destParens += destParens;
	out.lineCost += lineCost;
	const delimiter = Object.keys(VALUE_CAPS).find((c) => out.delimiters[c] > VALUE_CAPS[c]);
	if (out.spans > MAX_SPANS) out.stop(`at most ${MAX_SPANS} spans are allowed in total`);
	else if (out.marks > MAX_TOTAL_MARKS) out.stop(`at most ${MAX_TOTAL_MARKS} marks are allowed in total`);
	else if (out.slots > MAX_GRID_SLOTS) out.stop(`at most ${MAX_GRID_SLOTS} table cells are allowed in total (counting cells spanned by another)`);
	else if (out.markDefs > MAX_MARK_DEFS) out.stop(`at most ${MAX_MARK_DEFS} markDefs are allowed in total`);
	else if (out.lines > MAX_TOTAL_LINES) out.stop(`at most ${MAX_TOTAL_LINES} line breaks are allowed in total`);
	else if (out.images > MAX_IMAGES) out.stop(`at most ${MAX_IMAGES} images are allowed in total`);
	else if (out.markdown > MAX_MARKDOWN) out.stop(`at most ${MAX_MARKDOWN} Markdown characters are allowed in total`);
	else if (delimiter) out.stop(`at most ${VALUE_CAPS[delimiter]} ${delimiterName(delimiter)} are allowed in Markdown in total`);
	else if (out.destParens > DEST_PARENS[1]) out.stop(`at most ${DEST_PARENS[1]} "(" in link destinations are allowed in Markdown in total`);
	else if (out.lineCost > LINE_BUDGET[1]) out.stop(`at most ${LINE_BUDGET[1]} line breaks × field characters are allowed in Markdown in total`);
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
const MAX_BLOCK_MARK_DEFS = 100;
const MAX_ROWS = 500;
const MAX_CELLS = 2000;
const MAX_RECORD_KEYS = 16;
const MAX_SPAN_LINES = 1000;
const MAX_TOTAL_LINES = 5000;
const MAX_IMAGES = 500;
const MAX_MARKDOWN = 52000;
/**
 * Lists a renderer maps: [field, max items, text fields of an item (each with its length cap, or null for a type check
 * only), boolean fields of an item, null allowed]. url/logo are in RULES. Core's Buttons.astro defaults the list only for
 * undefined (`const { buttons = [] } = node`), so `buttons: null` throws there; web9's Tabs and ToolGrid tolerate null.
 */
const LISTS = {
	buttons: ["buttons", 10, { text: null }, [], false],
	tabs: ["tabs", 20, { label: null, body: LIMITS.markdown }, [], true],
	tool_grid: ["tools", 100, { name: null, tagline: LIMITS.inlineMarkdown }, ["featured"], true],
};

/**
 * The text fields a renderer prints, per _type, with their length cap (null: a type check only). Sinks: core Image.astro
 * (title attribute, figcaption), Code.astro, Pullquote.astro, File.astro (download attribute, name), Video.astro
 * (figcaption; core's isPortableTextVideoBlock already drops a video with a non-string caption), Button.astro,
 * Cover.astro (img and source src); web9 Embed.astro (figcaption), Callout.astro and Details.astro (renderMarkdown and
 * renderInlineMarkdown), Mermaid.astro (<pre>), ToolGrid.astro (<h4>). Gallery images and an image's alt reach the
 * page through core's own type checks (sanitizeGalleryImages, resolveImageMedia).
 */
const TEXT = {
	image: { title: null, caption: null },
	code: { code: LIMITS.code, filename: null },
	pullquote: { text: null, citation: null },
	file: { filename: null },
	video: { caption: null },
	button: { text: null },
	cover: { backgroundImage: LIMITS.url, backgroundVideo: LIMITS.url },
	embed: { caption: null },
	callout: { title: LIMITS.inlineMarkdown, body: LIMITS.markdown },
	details: { summary: LIMITS.inlineMarkdown, body: LIMITS.markdown },
	mermaid: { code: LIMITS.code },
	tool_grid: { title: null },
};
/** The Markdown fields per _type (on the node, or for a LISTS type on each item), which count toward MAX_MARKDOWN. */
const MARKDOWN = { callout: ["title", "body"], details: ["summary", "body"], tabs: ["body"], tool_grid: ["tagline"] };

/** A printed text field: absent or null, or a string of at most `max` characters (any length when `max` is null). */
function checkText(v, where, field, max, out) {
	if (v === undefined || v === null) return;
	if (typeof v !== "string") out.add(notAllowed(where, field, v));
	else if (max !== null && v.length > max) out.add(`${where} ${field}: at most ${max} characters (got ${v.length})`);
}

/** The Markdown characters a node renders, each field counted up to its own cap; a list past its item cap counts none. */
function markdownChars(node, type) {
	if (!Object.hasOwn(MARKDOWN, type)) return 0;
	const chars = (record, caps) => MARKDOWN[type].reduce((n, f) => n + (typeof record?.[f] === "string" ? Math.min(record[f].length, caps[f]) : 0), 0);
	if (!Object.hasOwn(LISTS, type)) return chars(node, TEXT[type]);
	const [field, max, texts] = LISTS[type];
	const list = node[field];
	return Array.isArray(list) && list.length <= max ? list.reduce((n, item) => n + chars(item, texts), 0) : 0;
}

/**
 * Delimiter density of each Markdown field of a node within its length cap (a longer one, or a list past its item cap,
 * has its own problem): per-field caps here, and each measure counted toward the value's total up to the field cap.
 */
function checkMarkdown(node, type, i, out) {
	const check = (v, field, max) => {
		if (typeof v !== "string" || v.length > max || out.full) return;
		const { counts, lineBreaks, destParens, lineMarkers, markerLine, linkTail, linkStarts } = markdownDensity(v);
		const where = `#${i} ${type} ${field}`;
		for (const [c, cap] of Object.entries(FIELD_CAPS)) {
			if (counts[c] > cap) out.add(`${where}: at most ${cap} ${delimiterName(c)} (got ${counts[c]})`);
		}
		const lines = Math.floor(LINE_BUDGET[0] / v.length);
		if (lineBreaks > lines) out.add(`${where}: at most ${lines} line breaks in a field of ${v.length} characters (got ${lineBreaks})`);
		if (destParens > DEST_PARENS[0]) out.add(`${where}: at most ${DEST_PARENS[0]} "(" in link destinations (got ${destParens})`);
		if (lineMarkers > LINE_MARKERS) out.add(`${where}: at most ${LINE_MARKERS} list or quote markers at the start of a line (got ${lineMarkers} on line ${markerLine})`);
		if (linkTail > LINK_TAIL) out.add(`${where}: at most ${LINK_TAIL} punctuation characters or entities at the end of a link (got ${linkTail})`);
		if (linkStarts > LINK_STARTS) out.add(`${where}: at most ${LINK_STARTS} link starts (http://, www. and the like) in one run without spaces (got ${linkStarts})`);
		const delimiters = Object.fromEntries(Object.entries(FIELD_CAPS).map(([c, cap]) => [c, Math.min(counts[c], cap)]));
		count(out, { delimiters, destParens: Math.min(destParens, DEST_PARENS[0]), lineCost: Math.min(lineBreaks * v.length, LINE_BUDGET[0]) });
	};
	if (!Object.hasOwn(LISTS, type)) {
		for (const f of MARKDOWN[type]) check(node[f], f, TEXT[type][f]);
		return;
	}
	const [field, max, texts] = LISTS[type];
	const list = node[field];
	if (!Array.isArray(list) || list.length > max) return;
	for (let k = 0; k < list.length; k++) {
		if (isObject(list[k])) for (const f of MARKDOWN[type]) check(list[k][f], `${field}[${k}].${f}`, texts[f]);
	}
}

/** `_key` may be absent (undefined or null); when present it must be a string. */
function checkKey(node, where, field, out) {
	if (node._key != null && typeof node._key !== "string") out.add(notAllowed(where, field, node._key));
}

/** Line breaks in `text`, counted with indexOf (no split) and only up to `max` + 1, enough to tell it is past the cap. */
function lineBreaks(text, max) {
	let n = 0;
	for (let at = text.indexOf("\n"); at !== -1 && n <= max; at = text.indexOf("\n", at + 1)) n++;
	return n;
}

/**
 * The toolkit splits a span's text on "\n" and splices a "\n" node back in per line from the tail, which is quadratic
 * per span: past MAX_SPAN_LINES a span is a problem, otherwise its line breaks count toward MAX_TOTAL_LINES. Only string
 * text counts (the toolkit renders anything else as a node, not as lines).
 */
function checkLines(span, at, out) {
	if (typeof span.text !== "string") return;
	const lines = lineBreaks(span.text, MAX_SPAN_LINES);
	if (lines > MAX_SPAN_LINES) out.add(`${at}.text: at most ${MAX_SPAN_LINES} line breaks are allowed`);
	else count(out, { lines });
}

/** Block children are rendered as custom types, so anything but a plain span is a way past the type check. */
function checkBlock(node, where, out) {
	checkKey(node, where, "_key", out);
	if (node.style != null && !BLOCK_STYLES.has(node.style)) out.add(notAllowed(where, "style", node.style));
	if (node.listItem != null && !LIST_ITEMS.has(node.listItem)) out.add(notAllowed(where, "listItem", node.listItem));
	if (node.level != null && !integerIn(1, MAX_LIST_LEVEL)(node.level)) out.add(notAllowed(where, "level", node.level));
	if (node.listId != null && !(typeof node.listId === "string" && node.listId.length <= MAX_LIST_ID)) out.add(notAllowed(where, "listId", node.listId));
	if (node.listStart != null && !integerIn(1, MAX_LIST_START)(node.listStart)) out.add(notAllowed(where, "listStart", node.listStart));
	// core's Block.astro looks textAlign up with Object.hasOwn (portable-text-text-align.ts:34), which throws for {"toString":1}
	if (node.textAlign != null && typeof node.textAlign !== "string") out.add(notAllowed(where, "textAlign", node.textAlign));

	// The only annotation core renders is link. Keys are what span marks point at: no inherited names.
	const keys = new Set();
	if (node.markDefs != null && !Array.isArray(node.markDefs)) out.add(`${where} markDefs: must be an array`);
	else {
		const defs = node.markDefs ?? [];
		count(out, { markDefs: defs.length });
		if (out.full) return;
		// Past the cap the block is rejected unwalked: its marks would only repeat it as unknown keys
		if (defs.length > MAX_BLOCK_MARK_DEFS) return out.add(`${where} markDefs: at most ${MAX_BLOCK_MARK_DEFS} markDefs are allowed`);
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
		checkLines(child, `${where} children[${j}]`, out);
		if (out.full) break;
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

/**
 * More than MAX_RECORD_KEYS own enumerable keys: core's safeFields (portable-text-table.js:494) runs a regex over every
 * key of a table, row, cell or markDef record and copies it. for…in returns at the first key past the cap, though V8
 * lists every key of a huge record first (about what Object.keys costs, far less than safeFields).
 */
function tooManyFields(record) {
	let n = 0;
	for (const key in record) if (Object.hasOwn(record, key) && ++n > MAX_RECORD_KEYS) return true;
	return false;
}

/** Table and cell markDefs, which core copies through safeFields too. Non-objects are left to the normalizer. */
function checkDefFields(defs, at, out) {
	for (let k = 0; k < defs.length && !out.full; k++) {
		if (isObject(defs[k]) && tooManyFields(defs[k])) out.add(`${at} markDefs[${k}]: at most ${MAX_RECORD_KEYS} fields are allowed`);
	}
}

/** Columns.astro maps `columns` and reads column.width, so a non-array or a null column throws. */
function checkColumns(node, i, out) {
	if (node.columns == null) return;
	if (!Array.isArray(node.columns)) return out.add(`#${i} columns columns: must be an array of columns`);
	for (let k = 0; k < node.columns.length && !out.full; k++) {
		const column = node.columns[k];
		if (!isObject(column)) out.add(`#${i} columns columns[${k}]: must be an object`);
	}
}

/**
 * A table cell's content: spans only (core renders them inline), within the span, mark and line-break caps; at most
 * MAX_BLOCK_MARK_DEFS markDefs, within MAX_RECORD_KEYS fields each. Spans are counted by checkTable.
 */
function checkCell(cell, at, out) {
	if (Array.isArray(cell.markDefs)) {
		count(out, { markDefs: cell.markDefs.length });
		if (out.full) return;
		if (cell.markDefs.length > MAX_BLOCK_MARK_DEFS) return out.add(`${at} markDefs: at most ${MAX_BLOCK_MARK_DEFS} markDefs are allowed`);
		checkDefFields(cell.markDefs, at, out);
	}
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
		checkLines(span, `${at} content[${j}]`, out);
		if (out.full) return;
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
 * value. The table, its rows, its cells and their markDefs hold at most MAX_RECORD_KEYS fields each (safeFields walks
 * every key), checked first, rows or not: core normalizes a row-less table too. Then core's own normalizer lays the table
 * out: one it cannot lay out is rejected, the grid it fills (work per slot, however few cells are written) is capped at
 * MAX_CELLS and counted toward MAX_GRID_SLOTS for the value, or the raw row count if that is larger (rows without cells
 * become one cell, after every row is keyed and copied), and the spans it renders (empty and padded cells are one span
 * each) count toward MAX_SPANS. The markDefs of the table and of each cell count toward MAX_MARK_DEFS as they are met,
 * before any normalizer run, and each of those lists holds at most MAX_BLOCK_MARK_DEFS.
 */
function checkTable(node, i, out) {
	// Every problem this table adds, the table node's and its markDefs' included, skips the normalizer below.
	const added = out.added;
	const where = `#${i} table`;
	if (tooManyFields(node)) out.add(`${where}: at most ${MAX_RECORD_KEYS} fields are allowed`);
	if (Array.isArray(node.markDefs)) {
		count(out, { markDefs: node.markDefs.length });
		if (node.markDefs.length > MAX_BLOCK_MARK_DEFS && !out.full) out.add(`${where} markDefs: at most ${MAX_BLOCK_MARK_DEFS} markDefs are allowed`);
		else checkDefFields(node.markDefs, where, out);
	}
	if (out.full || node.rows == null) return;
	if (!Array.isArray(node.rows)) return out.add(`${where} rows: must be an array`);
	if (node.rows.length > MAX_ROWS) return out.add(`${where} rows: at most ${MAX_ROWS} rows are allowed`);
	let cells = 0;
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
		if (tooManyFields(row)) out.add(`${where} rows[${r}]: at most ${MAX_RECORD_KEYS} fields are allowed`);
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
				if (tooManyFields(row.cells[c])) out.add(`${at}: at most ${MAX_RECORD_KEYS} fields are allowed`);
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
	count(out, { slots: Math.max(width * height, node.rows.length) });
	if (out.full) return;
	let spans = 0;
	for (const row of normalized.table.rows) for (const cell of row.cells) spans += Math.max(1, cell.content?.length ?? 0);
	count(out, { spans });
}

/**
 * tabs.default_tab, when present (not undefined or null): an integer from 1 to the number of tabs. Tabs.astro opens that
 * tab; a value that named no tab (a string gave a NaN index) hid every panel.
 */
function checkDefaultTab(node, i, out) {
	if (node.default_tab == null) return;
	const tabs = Array.isArray(node.tabs) ? Math.min(node.tabs.length, LISTS.tabs[1]) : 0;
	if (!integerIn(1, tabs)(node.default_tab)) out.add(notAllowed(`#${i} tabs`, "default_tab", node.default_tab));
}

/** A list a renderer maps (LISTS): an array of objects within its cap (null only where allowed), text fields strings within their caps, flags booleans. */
function checkList(node, type, i, out) {
	const [field, max, texts, booleans, nullable] = LISTS[type];
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
		for (const [key, cap] of Object.entries(texts)) checkText(item[key], `#${i} ${type}`, `${field}[${k}].${key}`, cap, out);
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
		// Counted before the node's checks run, so a huge gallery, or many oversized Markdown fields, is one problem
		if (type === "image") count(out, { images: 1 });
		if (type === "gallery" && Array.isArray(node.images)) count(out, { images: node.images.length });
		count(out, { markdown: markdownChars(node, type) });
		if (out.full) break;
		// astro-portabletext treats any node with a children array as a block and renders those children inline
		if (type === "block") checkBlock(node, `#${i} block`, out);
		else {
			checkKey(node, `#${i} ${type}`, "_key", out);
			if (node.children !== undefined && node.children !== null) out.add(`#${i} ${type} children: only a block may have children`);
		}
		if (type === "columns") checkColumns(node, i, out);
		if (type === "table") checkTable(node, i, out);
		if (Object.hasOwn(LISTS, type)) checkList(node, type, i, out);
		if (type === "tabs") checkDefaultTab(node, i, out);
		if (Object.hasOwn(TEXT, type)) for (const [field, cap] of Object.entries(TEXT[type])) checkText(node[field], `#${i} ${type}`, field, cap, out);
		if (Object.hasOwn(MARKDOWN, type)) checkMarkdown(node, type, i, out);
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

/**
 * Printed text values inside the blocks of a `blocks` field: each a string of at most its cap when present.
 * @param {unknown} value the field value, e.g. pages.layout
 * @param {Record<string, Record<string, number>>} textFields per block `_type`, the cap of each text path ("title", "features[].title")
 * @returns problems like `#0 hero title: at most 200 characters (got 201)`; empty means OK. A block whose `_type` has no
 * entry is left to core.
 */
export function guardBlockText(value, textFields) {
	const out = collector();
	if (!Array.isArray(value)) return out.done();
	for (let i = 0; i < value.length && !out.full; i++) {
		const block = value[i];
		const type = block !== null && typeof block === "object" ? block._type : undefined;
		if (typeof type !== "string" || !Object.hasOwn(textFields, type)) continue;
		for (const [path, max] of Object.entries(textFields[type])) {
			for (const [label, text] of labelledValuesAt(block, path)) {
				if (out.full) break;
				checkText(text, `#${i} ${type}`, label, max, out);
			}
		}
	}
	return out.done();
}
