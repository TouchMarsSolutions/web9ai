// Portable Text -> Markdown for readers that are not browsers (llms.txt, /docs/<slug>.md; spec §8).
// Core text and image go through EmDash's portableTextToMarkdown. That function writes every other
// block as `<!--ec:block {json} -->`, which is noise to an LLM, so web9 blocks, tables, breaks, embeds
// and core code (its fixed ``` fence breaks out when the code holds a ``` line) are written here, and
// anything else (htmlBlock, unknown or future types) is dropped.
//
// Content is published by AI agents without review and the save guard does not walk everything (table
// cells, for one), so every value here may be malformed: a node that throws is dropped, never the page.
// Core nodes are rebuilt from their well-formed parts before portableTextToMarkdown sees them, because it
// throws on a non-iterable `children`, a null child or a non-string `style`, and `"  ".repeat(level)` throws
// on a huge `level`. Link and image urls are held to the site's href rule (href.mjs, core's isSafeHref).
import { portableTextToMarkdown } from "emdash/client";
import { embedSrc } from "./embed-url.mjs";
import { safeHref as safeUrl } from "./href.mjs";
import { disclaimerFor } from "./investment-warning.mjs";
import { safeTone } from "./markdown.mjs";

const CORE = new Set(["block", "image"]);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v : "");
const oneLine = (s) => str(s).replace(/\s+/g, " ").trim();
const escLink = (s) => oneLine(s).replace(/([[\]\\])/g, "\\$1");

/** A url as a Markdown link destination: whitespace, angle brackets, backslashes and parentheses must not end it early. */
const dest = (u) => u.replace(/[\s<>\\]/g, encodeURIComponent).replace(/\(/g, "%28").replace(/\)/g, "%29");

/** Mark definitions that are objects; a link with an unsafe href is left out, so its text stays plain. */
const cleanDefs = (defs) =>
	arr(defs)
		.filter(isObj)
		.flatMap((def) => {
			if (def._type !== "link") return [def];
			const href = safeUrl(def.href);
			return href ? [{ ...def, href: dest(href) }] : [];
		});

/** A text block rebuilt from its well-formed parts, or null when no text is left. */
const cleanBlock = (node) => {
	const level = Number.isInteger(node.level) && node.level >= 1 && node.level <= 8 ? node.level : 1;
	const markDefs = cleanDefs(node.markDefs);
	const children = arr(node.children)
		.filter((span) => isObj(span) && span._type === "span" && str(span.text))
		.map((span) => ({ ...span, text: span.text, marks: arr(span.marks) }));
	if (!children.some((span) => span.text.trim())) return null;
	const style = typeof node.style === "string" ? node.style : "normal";
	const listItem = node.listItem === "bullet" || node.listItem === "number" ? node.listItem : undefined;
	return { _type: "block", style, listItem, level, markDefs, children };
};
const cleanImage = (node) => {
	const url = safeUrl(node.asset?.url);
	return url ? { _type: "image", alt: escLink(node.alt), asset: { url: dest(url) } } : null;
};
const CLEAN = { block: cleanBlock, image: cleanImage };

/** The first definition for each key, as `find` in portableTextToMarkdown would pick it. */
const defsByKey = (defs) => {
	const byKey = new Map();
	for (const def of cleanDefs(defs)) if (!byKey.has(def._key)) byKey.set(def._key, def);
	return byKey;
};

// Table cells are not walked by the save guard. A cell gets only the definitions its own marks use (the table's
// first, then its own), so a table with thousands of definitions and thousands of cells does not cost their product.
const cellText = (cell, tableDefs) => {
	try {
		const children = arr(cell?.content);
		const own = defsByKey(cell?.markDefs);
		const used = new Set(children.flatMap((span) => (isObj(span) ? arr(span.marks) : [])));
		const markDefs = [...used].flatMap((key) => tableDefs.get(key) ?? own.get(key) ?? []);
		const block = cleanBlock({ markDefs, children });
		return (block ? portableTextToMarkdown([block]) : "")
			.trim()
			.replace(/\|/g, "\\|")
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.join(" ");
	} catch {
		return "";
	}
};

function tableToGfm(t) {
	const defs = defsByKey(t.markDefs);
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
	const longest = (content.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
	const fence = "`".repeat(Math.max(3, longest + 1));
	return `${fence}${info}\n${content}\n${fence}`;
};

const LANGUAGE = /^[\w+#.-]{1,32}$/;

const SERIALIZERS = {
	code: ({ language, code }) => fenced(LANGUAGE.test(str(language)) ? language : "", str(code)),
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

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
// A path ends at the first `)`, space, bracket or parenthesis, so a run of `](/` cannot make every start scan to the end.
const LINK_TO_PATH = /\]\((\/(?![/\\])[^()[\]\s]*)\)/g;

/** [start, end) of each inline code span in a line: a backtick run, closed by the next run of the same length. */
function codeSpans(line) {
	const runs = [...line.matchAll(/`+/g)];
	const nextSame = new Array(runs.length);
	const later = new Map();
	for (let k = runs.length - 1; k >= 0; k--) {
		const length = runs[k][0].length;
		nextSame[k] = later.get(length) ?? -1;
		later.set(length, k);
	}
	const spans = [];
	for (let k = 0; k < runs.length; ) {
		const close = nextSame[k];
		if (close < 0) {
			k++;
		} else {
			spans.push([runs[k].index, runs[close].index + runs[close][0].length]);
			k = close + 1;
		}
	}
	return spans;
}

/** `](/img/x.png)` -> `](https://www.web9.ai/img/x.png)`, outside code. `origin` comes from Astro.site, never the request. */
function absolutize(md, origin) {
	const absolute = (text) => text.replace(LINK_TO_PATH, (_, path) => `](${new URL(path, origin).href})`);
	const outsideCodeSpans = (line) => {
		let out = "";
		let last = 0;
		for (const [start, end] of codeSpans(line)) {
			out += absolute(line.slice(last, start)) + line.slice(start, end);
			last = end;
		}
		return out + absolute(line.slice(last));
	};
	let fence = ""; // the opening fence while inside fenced code
	return md
		.split("\n")
		.map((line) => {
			const m = FENCE.exec(line);
			if (fence) {
				// a closing fence: the same character, at least as long, nothing after it
				if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !m[2].trim()) fence = "";
				return line;
			}
			if (m && !(m[1][0] === "`" && m[2].includes("`"))) {
				fence = m[1];
				return line;
			}
			return outsideCodeSpans(line);
		})
		.join("\n");
}

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
