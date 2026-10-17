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
// Table cells are not walked: they are left to core's normalizePortableTextTable, which bounds their types
// (spans only) and marks (decorators or a link) but not their sizes, so the caps below do not reach them.
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

/** Keeps the first MAX_PROBLEMS problems. `full` turns true once one was left out, so loops can stop early. */
function collector() {
	const list = [];
	return {
		full: false,
		add(problem) {
			if (list.length < MAX_PROBLEMS) list.push(problem);
			else this.full = true;
		},
		done() {
			return this.full ? [...list, MORE] : list;
		},
	};
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
		for (let k = 0; k < defs.length && !out.full; k++) {
			const def = defs[k];
			if (def?._type !== "link") out.add(notAllowed(where, `markDefs[${k}]._type`, def?._type));
			else if (typeof def.href !== "string") out.add(notAllowed(where, `markDefs[${k}].href`, def.href));
			const key = def?._key;
			if (typeof key !== "string" || !key || key in Object.prototype) out.add(notAllowed(where, `markDefs[${k}]._key`, key));
			else keys.add(key);
		}
	}

	if (node.children === undefined) return;
	if (!Array.isArray(node.children)) return out.add(`${where} children: must be an array of spans`);
	if (node.children.length > MAX_CHILDREN) return out.add(`${where} children: at most ${MAX_CHILDREN} spans are allowed`);
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

/** Columns.astro maps `columns` and reads column.width, so a non-array or a null column throws. */
function checkColumns(node, i, out) {
	if (node.columns == null) return;
	if (!Array.isArray(node.columns)) return out.add(`#${i} columns columns: must be an array of columns`);
	for (let k = 0; k < node.columns.length && !out.full; k++) {
		const column = node.columns[k];
		if (!column || typeof column !== "object" || Array.isArray(column)) out.add(`#${i} columns columns[${k}]: must be an object`);
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
