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
// Table cells are normalized by core (normalizePortableTextTable): spans only, decorator or link marks.
// Image values (an `image` field, `darkVariant`, PT image and gallery images) are checked for the colour and
// blurhash fields that core renderers paste into style or decode: a blurhash that does not decode throws.
import { blurhashToImageCssString } from "@unpic/placeholder";

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

/** Field checks per allowed _type. Paths use `a.b` for nesting and `list[].field` for arrays. */
const RULES = {
	block: {},
	blockquoteGroup: {},
	break: {},
	table: {},
	file: {},
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
	button: { style: BUTTON_STYLE },
	buttons: { layout: oneOf("horizontal", "vertical"), "buttons[].style": BUTTON_STYLE },
	code: { language: matches(LANGUAGE) },
	embed: { html: (v) => v === "" }, // web9's Embed renders from url only
	callout: {},
	tabs: {},
	details: {},
	mermaid: {},
	tool_grid: { logo_size: numberIn(16, 300) },
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

/** Problems for one node: `path: value ... is not allowed` per failing value. */
function checkRules(node, rules, prefix = "") {
	const problems = [];
	for (const [path, ok] of Object.entries(rules)) {
		for (const v of valuesAt(node, path)) {
			if (!ok(v)) problems.push(`${prefix}${path}: value ${JSON.stringify(v).slice(0, 60)} is not allowed`);
		}
	}
	return problems;
}

const show = (v) => JSON.stringify(v)?.slice(0, 60) ?? String(v);
const notAllowed = (where, field, v) => `${where} ${field}: value ${show(v)} is not allowed`;

// Names core renders. Sets, so a lookup never reaches Object.prototype.
// style: components/Block.astro and the default block map; listItem: astro-portabletext's default list maps.
const BLOCK_STYLES = new Set(["normal", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]);
const LIST_ITEMS = new Set(["bullet", "number", "menu"]);
// Decorators the editor emits (emdash content/converters/mark-safety.ts) and renders (components/marks.ts).
const DECORATORS = new Set(["strong", "em", "underline", "strike-through", "subscript", "superscript", "code"]);
const MAX_LIST_LEVEL = 20;

/** Block children are rendered as custom types, so anything but a plain span is a way past the type check. */
function checkBlock(node, where) {
	const problems = [];
	if (node.style != null && !BLOCK_STYLES.has(node.style)) problems.push(notAllowed(where, "style", node.style));
	if (node.listItem != null && !LIST_ITEMS.has(node.listItem)) problems.push(notAllowed(where, "listItem", node.listItem));
	if (node.level != null && !integerIn(1, MAX_LIST_LEVEL)(node.level)) problems.push(notAllowed(where, "level", node.level));

	// The only annotation core renders is link. Keys are what span marks point at: no inherited names.
	const keys = new Set();
	if (node.markDefs != null && !Array.isArray(node.markDefs)) problems.push(`${where} markDefs: must be an array`);
	else {
		(node.markDefs ?? []).forEach((def, k) => {
			if (def?._type !== "link") problems.push(notAllowed(where, `markDefs[${k}]._type`, def?._type));
			const key = def?._key;
			if (typeof key !== "string" || !key || key in Object.prototype) problems.push(notAllowed(where, `markDefs[${k}]._key`, key));
			else keys.add(key);
		});
	}

	if (node.children === undefined) return problems;
	if (!Array.isArray(node.children)) return [...problems, `${where} children: must be an array of spans`];
	node.children.forEach((child, j) => {
		const type = typeof child?._type === "string" ? child._type : "(no _type)";
		if (type !== "span") return problems.push(`${where} children[${j}] ${type}: only spans are allowed inside a block`);
		if (child.children !== undefined && child.children !== null) problems.push(`${where} children[${j}] span: a span must not have children`);
		if (child.marks == null) return;
		if (!Array.isArray(child.marks)) return problems.push(`${where} children[${j}].marks: must be an array`);
		for (const mark of child.marks) {
			if (typeof mark !== "string" || !(DECORATORS.has(mark) || keys.has(mark))) problems.push(notAllowed(where, `children[${j}].marks`, mark));
		}
	});
	return problems;
}

/** Portable Text arrays inside containers: [path, value] pairs, e.g. ["columns[1].content", [...]]. */
function containerLists(node, type) {
	if (type === "cover") return [["content", node.content]];
	if (type === "blockquoteGroup") return [["blocks", node.blocks]];
	if (type === "columns") return Array.isArray(node.columns) ? node.columns.map((column, k) => [`columns[${k}].content`, column?.content]) : [];
	return [];
}

/** Columns.astro maps `columns` and reads column.width, so a non-array or a null column throws. */
function checkColumns(node, i) {
	if (node.columns == null) return [];
	if (!Array.isArray(node.columns)) return [`#${i} columns columns: must be an array of columns`];
	return node.columns.flatMap((column, k) => (column && typeof column === "object" && !Array.isArray(column) ? [] : [`#${i} columns columns[${k}]: must be an object`]));
}

function checkContainers(node, type, i) {
	const problems = [];
	for (const [path, list] of containerLists(node, type)) {
		if (list == null) continue;
		if (!Array.isArray(list)) {
			problems.push(`#${i} ${type} ${path}: must be an array`);
			continue;
		}
		list.forEach((child, k) => {
			const childType = typeof child?._type === "string" ? child._type : "(no _type)";
			if (childType !== "block") problems.push(`#${i} ${type} ${path}[${k}] ${childType}: only blocks are allowed in container content`);
			else problems.push(...checkBlock(child, `#${i} ${type} ${path}[${k}] block`));
		});
	}
	return problems;
}

export function guardPortableText(value) {
	if (!Array.isArray(value)) return [];
	const problems = [];
	value.forEach((node, i) => {
		const type = typeof node?._type === "string" ? node._type : "(no _type)";
		if (Object.hasOwn(FORBIDDEN, type)) {
			problems.push(`#${i} ${type}: ${FORBIDDEN[type]}`);
			return;
		}
		if (!Object.hasOwn(RULES, type)) {
			problems.push(`#${i} ${type}: unknown block type`);
			return;
		}
		// astro-portabletext treats any node with a children array as a block and renders those children inline
		if (type === "block") problems.push(...checkBlock(node, `#${i} block`));
		else if (node.children !== undefined && node.children !== null) problems.push(`#${i} ${type} children: only a block may have children`);
		if (type === "columns") problems.push(...checkColumns(node, i));
		problems.push(...checkContainers(node, type, i));
		problems.push(...checkRules(node, RULES[type], `#${i} ${type} `));
	});
	return problems;
}

/** Colour and placeholder fields of a media value (the `image` field, which also carries `darkVariant`). */
const MEDIA_RULES = {
	dominantColor: COLOR_OK,
	blurhash: validBlurhash,
	"meta.dominantColor": COLOR_OK,
	"meta.blurhash": validBlurhash,
};
const IMAGE_VALUE_RULES = {
	...MEDIA_RULES,
	...Object.fromEntries(Object.entries(MEDIA_RULES).map(([path, ok]) => [`darkVariant.${path}`, ok])),
};

/** @param {unknown} value an `image` field value; returns problems, empty means OK */
export function guardImageValue(value) {
	return checkRules(value, IMAGE_VALUE_RULES);
}
