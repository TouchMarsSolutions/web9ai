// Write-time check of Portable Text values (spec §10). Returns a list of problems; empty means OK.
// Core renderers paste some block fields straight into class="" or style="" (cover.minHeight,
// image.dominantColor, columns[].width, button.style, code.language ...), core's htmlBlock/embed
// sanitizer keeps class/id/data-*, and MCP accepts any _type through a `<!--ec:block {json} -->` line.
// Only top-level blocks are checked: nested blocks (columns, cover, table cells) are rendered by
// astro-portabletext without a type map, so a nested custom type renders as a hidden "unknown" div.

const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/i;
const LENGTH = /^\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%)$/;
const MIN_HEIGHT = /^(?:\d{1,4}(?:\.\d{1,2})?(?:px|rem|em)|(?:100|\d{1,2})(?:\.\d{1,2})?vh)$/;
const LANGUAGE = /^[\w+#.-]{1,32}$/;

const oneOf = (...values) => (v) => values.includes(v);
const matches = (re) => (v) => typeof v === "string" && re.test(v);
const numberIn = (min, max) => (v) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integerIn = (min, max) => (v) => Number.isInteger(v) && v >= min && v <= max;
const BUTTON_STYLE = oneOf("default", "outline", "fill");

/** Field checks per allowed _type. Paths use `a.b` for nesting and `list[].field` for arrays. */
const RULES = {
	block: {},
	blockquoteGroup: {},
	break: {},
	table: {},
	file: {},
	pullquote: {},
	video: {},
	image: { alignment: oneOf("left", "center", "right", "wide", "full"), dominantColor: matches(COLOR), "asset.meta.dominantColor": matches(COLOR) },
	gallery: { columns: integerIn(1, 6), "images[].dominantColor": matches(COLOR), "images[].asset.meta.dominantColor": matches(COLOR) },
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
		for (const [path, ok] of Object.entries(RULES[type])) {
			for (const v of valuesAt(node, path)) {
				if (!ok(v)) problems.push(`#${i} ${type} ${path}: value ${JSON.stringify(v).slice(0, 60)} is not allowed`);
			}
		}
	});
	return problems;
}
