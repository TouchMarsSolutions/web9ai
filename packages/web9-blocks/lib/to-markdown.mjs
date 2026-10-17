// Portable Text -> Markdown for readers that are not browsers (llms.txt, /docs/<slug>.md; spec §8).
// Core text, code and image go through EmDash's portableTextToMarkdown. That function writes every other
// block as `<!--ec:block {json} -->`, which is noise to an LLM, so web9 blocks, tables, breaks and
// embeds are written here, and anything else (htmlBlock, unknown or future types) is dropped.
//
// Content is published by AI agents without review and the save guard does not walk everything (table
// cells, for one), so every value here may be malformed: a node that throws is dropped, never the page.
// Core nodes are rebuilt from their well-formed parts before portableTextToMarkdown sees them, because it
// throws on a non-iterable `children`, a null child or a non-string `style`, and `"  ".repeat(level)` throws
// on a huge `level`. Link and image urls are held to the same rule as the site's sanitizeHref.
import { portableTextToMarkdown } from "emdash/client";
import { embedSrc } from "./embed-url.mjs";
import { disclaimerFor } from "./investment-warning.mjs";
import { safeTone } from "./markdown.mjs";

const CORE = new Set(["block", "code", "image"]);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v : "");
const oneLine = (s) => str(s).replace(/\s+/g, " ").trim();
const escLink = (s) => oneLine(s).replace(/([[\]\\])/g, "\\$1");

// The urls the site renders as links (emdash sanitizeHref): http(s), mailto, tel, a site path, a #fragment.
// Protocol-relative (`//host`) and backslash paths (`/\host`, which a browser reads as `//host`) are not.
const HREF = /^(?:https?:|mailto:|tel:|\/(?![/\\])|#)/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const safeUrl = (u) => (typeof u === "string" && HREF.test(u) && !CONTROL.test(u) && (u[0] === "/" || u[0] === "#" || URL.canParse(u)) ? u : "");
/** A url as a Markdown link destination: whitespace, angle brackets, backslashes and parentheses must not end it early. */
const dest = (u) => u.replace(/[\s<>\\]/g, encodeURIComponent).replace(/\(/g, "%28").replace(/\)/g, "%29");

/** A text block rebuilt from its well-formed parts, or null when no text is left. */
const cleanBlock = (node) => {
	const level = Number.isInteger(node.level) && node.level >= 1 && node.level <= 8 ? node.level : 1;
	const markDefs = arr(node.markDefs)
		.filter(isObj)
		.flatMap((def) => {
			if (def._type !== "link") return [def];
			const href = safeUrl(def.href);
			return href ? [{ ...def, href: dest(href) }] : []; // an unsafe link keeps its text only
		});
	const children = arr(node.children)
		.filter((span) => isObj(span) && span._type === "span" && str(span.text))
		.map((span) => ({ ...span, text: span.text, marks: arr(span.marks) }));
	if (!children.some((span) => span.text.trim())) return null;
	const style = typeof node.style === "string" ? node.style : "normal";
	const listItem = node.listItem === "bullet" || node.listItem === "number" ? node.listItem : undefined;
	return { _type: "block", style, listItem, level, markDefs, children };
};
const cleanCode = (node) => ({ _type: "code", language: /^[\w+#.-]{1,32}$/.test(str(node.language)) ? node.language : "", code: str(node.code) });
const cleanImage = (node) => {
	const url = safeUrl(node.asset?.url);
	return url ? { _type: "image", alt: escLink(node.alt), asset: { url: dest(url) } } : null;
};
const CLEAN = { block: cleanBlock, code: cleanCode, image: cleanImage };

const cellText = (cell, tableDefs) => {
	try {
		const block = cleanBlock({ markDefs: [...tableDefs, ...arr(cell?.markDefs)], children: arr(cell?.content) });
		return (block ? portableTextToMarkdown([block]) : "")
			.trim()
			.replace(/\|/g, "\\|")
			.replace(/\s*\n\s*/g, " ");
	} catch {
		return "";
	}
};

function tableToGfm(t) {
	const defs = arr(t.markDefs).filter(isObj);
	const rows = arr(t.rows).map((r) => arr(r?.cells).map((c) => cellText(c, defs)));
	const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
	if (!width) return "";
	const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
	// GFM needs a header row; a table without one gets an empty header
	const [header, body] = t.hasHeaderRow === false ? [Array(width).fill(""), rows] : [rows[0], rows.slice(1)];
	return [line(header), line(Array(width).fill("---")), ...body.map(line)].join("\n");
}

/** A fence longer than any run of backticks inside, so the content cannot close it. */
const fenced = (info, content) => {
	const fence = "`".repeat(Math.max(3, ...(content.match(/`+/g) ?? []).map((run) => run.length + 1)));
	return `${fence}${info}\n${content}\n${fence}`;
};

const SERIALIZERS = {
	callout: ({ tone, title, body }) => `:::${safeTone(tone)}${oneLine(title) ? ` ${oneLine(title)}` : ""}\n${str(body).trim()}\n:::`,
	// tab labels become headings one level below the last heading seen
	tabs: ({ tabs }, { level }) =>
		arr(tabs)
			.filter(isObj)
			.map((t, i) => [`${"#".repeat(Math.min(level + 1, 6))} ${oneLine(t.label) || `Tab ${i + 1}`}`, str(t.body).trim()].filter(Boolean).join("\n\n"))
			.join("\n\n"),
	details: ({ summary, body }) => `**${oneLine(summary) || "Details"}**\n\n${str(body).trim()}`,
	mermaid: ({ code }) => fenced("mermaid", str(code).trim()),
	tool_grid: ({ title, tools }) =>
		[
			oneLine(title) && `**${oneLine(title)}**`,
			arr(tools)
				.filter((t) => isObj(t) && oneLine(t.name))
				.map((t) => {
					const url = safeUrl(t.url);
					const tagline = oneLine(t.tagline);
					return `- ${url ? `[${escLink(t.name)}](${dest(url)})` : escLink(t.name)}${tagline ? `: ${tagline}` : ""}`;
				})
				.join("\n"),
		]
			.filter(Boolean)
			.join("\n\n"),
	investment_warning: ({ lang }) => `> ${disclaimerFor(lang)}`,
	// only what the site renders as a player (embedSrc); linked by the url as written, not the nocookie one
	embed: ({ url }) => (embedSrc(url) ? `[Video](${dest(url)})` : ""),
	table: tableToGfm,
	break: () => "---",
};

/** `](/img/x.png)` -> `](https://www.web9.ai/img/x.png)`. `origin` comes from Astro.site, never the request. */
const absolutize = (md, origin) => md.replace(/\]\((\/(?![/\\])[^)\s]*)\)/g, (_, p) => `](${new URL(p, origin).href})`);

/** Markdown for a Portable Text value. Never contains `ec:block` JSON, and never throws on a malformed value. */
export function blocksToMarkdown(body, { origin } = {}) {
	if (!Array.isArray(body)) return "";
	const out = [];
	let run = [];
	let level = 1;
	const flush = () => {
		try {
			// consecutive core nodes are converted together, so lists stay together
			if (run.length) out.push(portableTextToMarkdown(run).trimEnd());
		} catch {
			// each node was converted on its own when it joined the run, so this is not expected
		}
		run = [];
	};
	for (const node of body) {
		try {
			const type = node?._type;
			if (typeof type !== "string") continue;
			if (CORE.has(type)) {
				const clean = CLEAN[type](node);
				if (!clean || !portableTextToMarkdown([clean]).trim()) continue; // an empty paragraph or unusable image
				const heading = /^h([1-6])$/.exec(clean.style ?? "");
				if (heading) level = Number(heading[1]);
				run.push(clean);
				continue;
			}
			flush();
			const md = Object.hasOwn(SERIALIZERS, type) ? SERIALIZERS[type](node, { level }) : "";
			if (typeof md === "string" && md.trim()) out.push(md.trim());
		} catch {
			// a node that throws is dropped
		}
	}
	flush();
	if (!out.length) return "";
	const text = `${out.join("\n\n")}\n`;
	return origin ? absolutize(text, origin) : text;
}

/** A whole doc: `# title`, the description as a quote, then the body. */
export function docToMarkdown(doc, { origin } = {}) {
	const title = oneLine(doc?.title);
	const description = oneLine(doc?.description);
	const text = [title && `# ${title}`, description && `> ${description}`, blocksToMarkdown(doc?.body, { origin }).trimEnd()].filter(Boolean).join("\n\n");
	return text && `${text}\n`;
}
