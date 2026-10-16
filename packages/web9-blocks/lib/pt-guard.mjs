// Write-time check of Portable Text values (spec §10). Returns a list of problems; empty means OK.
// Core renderers paste some block fields straight into class="" or style="" (cover.minHeight,
// image.dominantColor, columns[].width, button.style, code.language ...), core's htmlBlock/embed
// sanitizer keeps class/id/data-*, and MCP accepts any _type through a `<!--ec:block {json} -->` line.
// Top-level nodes are checked by _type. Children of a `block` are rendered inline through the same merged
// type map as top-level nodes (a cover or iframe in block.children renders as that core component), so a
// block may hold spans only. Container content (columns, cover, table cells, blockquote groups) renders
// with marks only, so a custom type nested there shows up as a hidden "unknown" div and is not checked.
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

/** Block children are rendered as custom types, so anything but a plain span is a way past the type check. */
function checkBlockChildren(node, i) {
	if (node.children === undefined) return [];
	if (!Array.isArray(node.children)) return [`#${i} block children: must be an array of spans`];
	const problems = [];
	node.children.forEach((child, j) => {
		const type = typeof child?._type === "string" ? child._type : "(no _type)";
		if (type !== "span") problems.push(`#${i} block children[${j}] ${type}: only spans are allowed inside a block`);
		else if (child.children !== undefined && child.children !== null) problems.push(`#${i} block children[${j}] span: a span must not have children`);
	});
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
		if (type === "block") problems.push(...checkBlockChildren(node, i));
		else if (node.children !== undefined && node.children !== null) problems.push(`#${i} ${type} children: only a block may have children`);
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
