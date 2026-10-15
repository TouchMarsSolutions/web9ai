// Markdown renderer for Markdown-valued block fields (callout/tabs/details bodies, tool taglines).
// Supports GFM, Docusaurus-style `:::tone title` admonitions, and ```mermaid fences.
import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";

const TONES = new Set(["note", "tip", "info", "warning", "danger", "caution"]);

const escapeHtml = (s) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const admonition = {
	name: "admonition",
	level: "block",
	start(src) {
		return src.match(/^:::/m)?.index;
	},
	tokenizer(src) {
		const match = /^:::(\w+)[ \t]*([^\n]*)\n([\s\S]*?)\n?^:::[ \t]*(?:\n|$)/m.exec(src);
		if (!match || match.index !== 0 || !TONES.has(match[1])) return undefined;
		const token = {
			type: "admonition",
			raw: match[0],
			tone: match[1],
			title: match[2].trim(),
			titleTokens: [],
			tokens: [],
		};
		this.lexer.inlineTokens(token.title, token.titleTokens);
		this.lexer.blockTokens(match[3], token.tokens);
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

const SANITIZE = {
	allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "details", "summary", "del", "s", "h1", "h2"]),
	allowedAttributes: {
		"*": ["class", "style", "id"],
		a: ["href", "target", "rel", "title"],
		img: ["src", "alt", "width", "height", "loading"],
		code: ["class"],
	},
	allowedSchemes: ["http", "https", "mailto"],
};

/** Dedent a block so indented MDX children don't turn into code blocks. */
function dedent(src) {
	const lines = src.replace(/\t/g, "  ").split("\n");
	const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
	const min = indents.length ? Math.min(...indents) : 0;
	return lines.map((l) => l.slice(min)).join("\n");
}

export function renderMarkdown(src = "") {
	if (!src) return "";
	return sanitizeHtml(marked.parse(dedent(String(src))), SANITIZE);
}

export function renderInlineMarkdown(src = "") {
	if (!src) return "";
	return sanitizeHtml(marked.parseInline(String(src)), SANITIZE);
}
