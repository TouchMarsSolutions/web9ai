// Markdown renderer for Markdown-valued block fields (callout/tabs/details bodies, tool taglines).
// Supports GFM, Docusaurus-style `:::tone title` admonitions, and ```mermaid fences.
import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { safeValueFor } from "./css-value.mjs";
import { isSiteHref, safeHref } from "./href.mjs";
import IMAGE_SIZES from "./image-sizes.json" with { type: "json" };

const TONES = new Set(["note", "tip", "info", "warning", "danger", "caution"]);

/** Block data reaches class attributes; only whitelisted tones may (Tailwind makes any class a style). */
export const safeTone = (tone) => (TONES.has(tone) ? tone : "info");

const escapeHtml = (s) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// An admonition opens only at the start of a block. There is no `start()`: marked called it on the rest of the field
// before each paragraph and cut the paragraph where it pointed, so ":::" at line starts made one block per position
// (25000 ":" took 3.6 s). The search for the closing line stops at the next opener line, which leaves this one
// unclosed: the searches then cover disjoint stretches of the field instead of each running to its end
// (":::note\n\n" repeated to 25000 characters took 0.6 s). A nested opener never rendered as an admonition anyway.
const OPENER = /:::(\w+)[ \t]*([^\n]*)\n/y;
const CLOSER_OR_OPENER = /^:::(?:[ \t]*(?:\n|$)|(\w))/gm;

const admonition = {
	name: "admonition",
	level: "block",
	tokenizer(src) {
		if (!src.startsWith(":::")) return undefined;
		OPENER.lastIndex = 0;
		const open = OPENER.exec(src);
		if (!open || !TONES.has(open[1])) return undefined;
		CLOSER_OR_OPENER.lastIndex = open[0].length;
		const close = CLOSER_OR_OPENER.exec(src);
		if (!close || close[1]) return undefined;
		const body = src.slice(open[0].length, close.index);
		const token = {
			type: "admonition",
			raw: src.slice(0, close.index + close[0].length),
			tone: open[1],
			title: open[2].trim(),
			titleTokens: [],
			tokens: [],
		};
		this.lexer.inlineTokens(token.title, token.titleTokens);
		this.lexer.blockTokens(body.endsWith("\n") ? body.slice(0, -1) : body, token.tokens);
		return token;
	},
	renderer(token) {
		const title = token.title
			? `<p class="callout__title">${this.parser.parseInline(token.titleTokens)}</p>`
			: "";
		return `<aside class="callout callout--${token.tone}">${title}${this.parser.parse(token.tokens)}</aside>`;
	},
};

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
	extensions: [admonition],
	renderer: {
		code({ text, lang }) {
			if (lang === "mermaid") return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
			return false; // default renderer
		},
	},
});

// Content is published by AI agents without review, so inline CSS is limited to cosmetic
// properties (no positioning) and every value goes through isSafeCssValue (css-value.mjs).
// Box properties are block-only: on an inline box, vertical padding, border and shadows paint outside
// the line box without pushing content, so only block tags may set them.
const TEXT_STYLE_PROPS = [
	"color", "background", "background-color", "text-align", "font-size", "font-weight", "font-style", "border-radius",
];
const BOX_STYLE_PROPS = ["padding", "margin", "border", "box-shadow", "line-height", "width", "max-width"];
const BLOCK_TAGS = [
	"address", "article", "aside", "footer", "header", "h1", "h2", "h3", "h4", "h5", "h6", "hgroup", "main", "nav", "section",
	"blockquote", "dd", "div", "dl", "dt", "figcaption", "figure", "li", "ol", "p", "pre", "ul",
	"details", "summary", "table", "caption", "td", "th",
];
const styleRules = (props) => Object.fromEntries(props.map((p) => [p, [safeValueFor(p)]]));
const BLOCK_STYLE_RULES = styleRules([...TEXT_STYLE_PROPS, ...BOX_STYLE_PROPS]);

// Ruby inlinifies its block children, which would carry block-only box styles into inline boxes.
const RUBY_TAGS = new Set(["ruby", "rb", "rt", "rtc", "rp"]);

/** Tags renderMarkdown keeps; html.mjs reuses the same set. */
export const ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags
	.filter((tag) => !RUBY_TAGS.has(tag))
	.concat(["img", "details", "summary", "del", "s", "h1", "h2"]);

const omit = (attribs, ...names) => Object.fromEntries(Object.entries(attribs).filter(([name]) => !names.includes(name)));

/** Links follow the site's href rule (href.mjs): an unsafe href is dropped (the text stays), a site path or fragment opens in the same tab, anything else in a new one. */
function transformLink(tagName, attribs) {
	if (!safeHref(attribs.href)) return { tagName, attribs: omit(attribs, "href", "target", "rel") };
	if (isSiteHref(attribs.href)) return { tagName, attribs: omit(attribs, "target") };
	return { tagName, attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" } };
}

/**
 * An image under /img or /cover gets its width and height from image-sizes.json (scripts/lib/image-sizes.mjs), as
 * ContentImage.astro gives a Portable Text image, so it keeps its box while it loads. Only a fixed size: an SVG the
 * browser draws as wide as the line (`fill`) would need a style of ours, which Markdown output never carries. A width or
 * height the content gives itself is kept. The sanitizer checks the attributes after this, as it does every tag's.
 */
function transformImage(tagName, attribs) {
	if (attribs.width !== undefined || attribs.height !== undefined || typeof attribs.src !== "string") return { tagName, attribs };
	const size = Object.hasOwn(IMAGE_SIZES, attribs.src) ? IMAGE_SIZES[attribs.src] : null;
	if (!size || size.fill || !Number.isInteger(size.width) || !Number.isInteger(size.height)) return { tagName, attribs };
	return { tagName, attribs: { ...attribs, width: String(size.width), height: String(size.height) } };
}

const SANITIZE = {
	allowedTags: ALLOWED_TAGS,
	allowedAttributes: {
		"*": ["style"],
		a: ["href", "title", "target", "rel"],
		img: ["src", "alt", "width", "height", "loading"],
		pre: ["class"],
		code: ["class"],
		aside: ["class"],
		p: ["class"],
	},
	allowedClasses: {
		pre: ["mermaid"],
		code: [/^language-[\w-]+$/],
		aside: ["callout", /^callout--(note|tip|info|warning|danger|caution)$/],
		p: ["callout__title"],
	},
	allowedStyles: {
		"*": styleRules(TEXT_STYLE_PROPS),
		...Object.fromEntries(BLOCK_TAGS.map((tag) => [tag, BLOCK_STYLE_RULES])),
	},
	// the schemes href.mjs accepts; the sanitizer checks them again after transformLink
	allowedSchemes: ["http", "https", "mailto", "tel"],
	allowProtocolRelative: false,
	transformTags: { a: transformLink, img: transformImage },
};

/** Dedent a block so indented MDX children don't turn into code blocks. */
function dedent(src) {
	const lines = src.replace(/\t/g, "  ").split("\n");
	const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
	const min = indents.length ? Math.min(...indents) : 0;
	return lines.map((l) => l.slice(min)).join("\n");
}

// marked recurses once per nested list or quote, so a deep enough nest overflows the stack (about 1900 markers on one line
// on Node's main thread). The save check caps markers per line (markdown-density.mjs); a field that throws anyway, stored
// before the cap or nested some other way, renders as nothing instead of taking the page down.
const failed = (e) => {
	console.warn(`web9-blocks: a Markdown field did not render (${e instanceof Error ? e.name : typeof e})`);
	return "";
};

// A stored field that is not a string renders as nothing (lib/text.mjs): String() on it could throw and take the page down
export function renderMarkdown(src) {
	if (typeof src !== "string" || !src) return "";
	try {
		return sanitizeHtml(marked.parse(dedent(src)), SANITIZE);
	} catch (e) {
		return failed(e);
	}
}

export function renderInlineMarkdown(src) {
	if (typeof src !== "string" || !src) return "";
	try {
		return sanitizeHtml(marked.parseInline(src), SANITIZE);
	} catch (e) {
		return failed(e);
	}
}
