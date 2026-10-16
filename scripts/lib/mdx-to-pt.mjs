// Convert a Docusaurus MDX doc into an EmDash `docs` entry payload (Portable Text body).
// Pure library (no I/O); the CLI wrapper is scripts/convert-mdx.mjs.
//
// Docusaurus constructs -> EmDash blocks:
//   :::tone title ... :::            -> callout (body kept as Markdown)
//   <details><summary>              -> details (body kept as Markdown)
//   <FullscreenWrapper><Tabs>       -> tabs (repeater of {label, body Markdown})
//   ```mermaid                      -> mermaid
//   <InvestmentWarning />           -> investment_warning
//   tables with logos/images        -> tool_grid; text-only tables -> core `table`
//   <div className="tools-gallery"> -> one tool_grid per category
//   <YouTube youTubeId>             -> core `embed` (prose) or a Markdown link (inside a block body)
//   images in prose                 -> core `image` blocks after the text block they were in
//   <Tabs> inside <details>         -> bold tab labels + the tab bodies, in the details Markdown
//   <MDXTemplate>, <AlignedText>, <TwitterFollowButton>, <style> -> dropped (children kept)
//   everything else (prose)         -> standard Portable Text via the marked lexer
// Any other raw HTML in prose is an error: the site rejects htmlBlock on save (spec §10).
//
// Output is deterministic: block keys come from the slug and the traversal order (fnv1a), so the
// same source always gives the same JSON and the migration runner can skip unchanged entries.

import { marked } from "marked";
import { parseFrontmatter } from "./frontmatter.mjs";
import { YOUTUBE_TOKEN, dropWrappers, imgAttributes, parseToolsGallery, youtubeToTokens, youtubeUrl } from "./mdx-jsx.mjs";

/** 32-bit FNV-1a; no dependencies, same result in Node and workerd. */
export function fnv1a(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/** Entry slug: frontmatter `slug` (leading "/" dropped, other "/" -> "-"), else the file name without its number prefix. */
export function deriveSlug(frontmatter, path) {
	const raw = frontmatter.slug ?? path.split("/").pop().replace(/\.mdx?$/, "").replace(/^\d+[-_]/, "");
	return String(raw).replace(/^\//, "").replace(/\//g, "-");
}

/** Split on `sep` at the top level only: separators inside (...) or quotes don't count. */
export function splitTopLevel(text, sep = ",") {
	const out = [];
	let depth = 0;
	let quote = null;
	let cur = "";
	for (const ch of text) {
		if (quote) {
			if (ch === quote) quote = null;
		} else if (ch === "'" || ch === '"') {
			quote = ch;
		} else if (ch === "(") {
			depth++;
		} else if (ch === ")") {
			depth--;
		} else if (ch === sep && depth === 0) {
			out.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	if (cur.trim()) out.push(cur);
	return out;
}

/** JSX style object body -> CSS declarations. `{{background: 'linear-gradient(a, b)'}}` keeps its commas. */
export function cssObjectToString(obj) {
	return splitTopLevel(obj)
		.map((pair) => pair.match(/^\s*([\w-]+)\s*:\s*['"]?([\s\S]+?)['"]?\s*$/))
		.filter(Boolean)
		.map(([, k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v}`)
		.join("; ");
}

/** Parse a Docusaurus <Tabs> element. Tabs follow the `values` prop order, as Docusaurus renders them. */
export function parseTabs(jsx) {
	const declared = [...jsx.matchAll(/\{\s*label:\s*['"]([^'"]+)['"],\s*value:\s*['"]([^'"]+)['"]\s*\}/g)].map(
		([, label, value]) => ({ value, label }),
	);
	const items = [...jsx.matchAll(/<TabItem\s+([^>]*)>([\s\S]*?)<\/TabItem>/g)].map(([, attrs, content]) => ({
		value: attrs.match(/value="([^"]+)"/)?.[1],
		label: attrs.match(/label="([^"]+)"/)?.[1],
		content,
	}));
	const byValue = new Map(items.map((it) => [it.value, it]));
	const order = [...declared.map((d) => d.value), ...items.map((it) => it.value).filter((v) => !declared.some((d) => d.value === v))];
	const tabs = order
		.filter((value) => byValue.has(value))
		.map((value) => ({
			value,
			label: declared.find((d) => d.value === value)?.label ?? byValue.get(value).label ?? value,
			content: byValue.get(value).content,
		}));
	const defaultValue = jsx.match(/defaultValue="([^"]+)"/)?.[1];
	return { tabs, defaultIndex: Math.max(0, tabs.findIndex((t) => t.value === defaultValue)) };
}

/** Apply `fn` to the parts of one paragraph outside inline code spans (a span never crosses a blank line). */
function outsideInlineCode(paragraph, fn) {
	let out = "";
	let last = 0;
	const ticks = /`+/g;
	for (let open; (open = ticks.exec(paragraph)); ) {
		const n = open[0].length;
		const closing = new RegExp(`(?<!\`)\`{${n}}(?!\`)`, "g");
		closing.lastIndex = ticks.lastIndex;
		const close = closing.exec(paragraph);
		if (!close) continue; // an unmatched backtick run is literal text
		const end = close.index + n;
		out += fn(paragraph.slice(last, open.index)) + paragraph.slice(open.index, end);
		last = ticks.lastIndex = end;
	}
	return out + fn(paragraph.slice(last));
}

/** Apply `fn` to the Markdown outside fenced code blocks and inline code spans. */
function outsideCode(text, fn) {
	const out = [];
	let plain = [];
	let fence = null;
	const flushPlain = () => {
		if (!plain.length) return;
		const chunk = plain.join("\n");
		plain = [];
		out.push(chunk.split(/(\n[ \t]*\n)/).map((part, i) => (i % 2 ? part : outsideInlineCode(part, fn))).join(""));
	};
	for (const line of text.split("\n")) {
		if (fence) {
			out.push(line);
			if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
			continue;
		}
		const open = /^\s*(`{3,}(?=[^`]*$)|~{3,})/.exec(line);
		if (!open) {
			plain.push(line);
			continue;
		}
		flushPlain();
		fence = open[1];
		out.push(line);
	}
	flushPlain();
	return out.join("\n");
}

/** Markdown links and href attributes in `text`, passed through `rewriteHref`. Code is left alone. */
function rewriteLinks(text, rewriteHref) {
	return outsideCode(text, (part) =>
		part
			.replace(/(\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (_, open, href, close) => `${open}${rewriteHref(href)}${close}`)
			.replace(/(\bhref=")([^"]+)(")/g, (_, open, href, close) => `${open}${rewriteHref(href)}${close}`),
	);
}

/**
 * Parse one Docusaurus MDX file into Portable Text blocks. Shared by docs (convertMdx) and posts.
 * - `slug` overrides the derived slug (the legacy inventory de-duplicates slugs).
 * - `lang` is the InvestmentWarning language when the file does not import one (the import decides:
 *   `InvestmentWarning.cn.mdx` -> "zh", `InvestmentWarning.mdx` -> "en").
 * - `site` prefixes /img/... URLs; the default "" keeps them site-relative (served from public/img).
 * - `rewriteHref(href)` maps legacy links to new URLs; it must return unknown hrefs unchanged. It is not applied
 *   inside code (fences, inline code, mermaid), nor to table cells and tool_grid urls.
 * Returns { frontmatter, slug, title, blocks }. Title = frontmatter title, else the first H1;
 * the first H1 is always removed from the body (Docusaurus pages repeat the title as an H1), except that
 * a link inside it stays behind as a normal paragraph (a few pages carry their only link to the product there).
 */
export function mdxToBlocks(src, { path, slug: slugOption, lang = "en", site = "", rewriteHref = (href) => href }) {
	const { data: frontmatter, body: afterFrontmatter } = parseFrontmatter(src);
	const slug = slugOption ?? deriveSlug(frontmatter, path);
	const warningImport = /^import\s+InvestmentWarning\s+from\s+['"]([^'"]+)['"]/m.exec(src)?.[1];
	const warningLang = warningImport ? (/\.cn\.mdx$/.test(warningImport) ? "zh" : "en") : lang;

	let keySeq = 0;
	const key = () => {
		const n = keySeq++; // key() call order is the converter's deterministic traversal order
		return `k${n.toString(36)}${fnv1a(`${slug}:${n}`).toString(36).padStart(7, "0").slice(-4)}`;
	};

	// ---------------------------------------------------------------- MDX -> Markdown helpers
	let body = afterFrontmatter;

	const images = {};
	body = body.replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, name, path) => {
		if (path.startsWith("/img/")) images[name] = site + path;
		return "";
	});
	body = body.replace(/^import\s+.*$/gm, "");
	const img = (name) => images[name] ?? "";
	body = dropWrappers(body);
	const { body: withTokens, videos } = youtubeToTokens(body);
	body = withTokens;

	/** Rewrite MDX/JSX inline constructs into plain Markdown/HTML; `links: false` leaves hrefs alone (mermaid source). */
	function mdxToMarkdown(text, { links = true } = {}) {
		const markdown =
			text
				// <Image img={X} .../>  and  <XSvg width={w} height={h} />
				.replace(/<Image\s+img=\{(\w+)\}[^>]*\/>/g, (_, n) => `![${n}](${img(n)})`)
				.replace(/<(\w+(?:Svg|Png))\s*([^>]*)\/>/g, (_, n, attrs) => {
					const w = attrs.match(/width=\{(\d+)\}/)?.[1];
					const h = attrs.match(/height=\{(\d+)\}/)?.[1];
					return `<img src="${img(n)}" alt="${n}"${w ? ` width="${w}"` : ""}${h ? ` height="${h}"` : ""}>`;
				})
				.replace(/style=\{\{([\s\S]*?)\}\}/g, (_, obj) => `style="${cssObjectToString(obj)}"`)
				.replace(/img:\s*'(\/img\/[^']+)'/g, (_, p) => `img: '${site}${p}'`) // mermaid image nodes
				.replace(/\s*\{#[\w-]+\}\s*$/gm, "") // Docusaurus heading ids
				.replace(/^\s*<!--.*?-->\s*$/gm, "");
		return links ? rewriteLinks(markdown, rewriteHref) : markdown;
	}

	/** Markdown for a block body (callout, details, tabs): videos become links, there is no block to put them in. */
	const bodyMarkdown = (text) => mdxToMarkdown(text).replace(YOUTUBE_TOKEN, (_, n) => `[YouTube](${youtubeUrl(videos[n])})`);

	/** Docusaurus Tabs inside Markdown: each tab becomes `**label**` + its dedented content (no label for a single tab). */
	function tabsToMarkdown(text) {
		return text.replace(/^[ \t]*<Tabs\b[\s\S]*?^[ \t]*<\/Tabs>[ \t]*$/gm, (jsx) => {
			const { tabs } = parseTabs(jsx);
			return tabs.map((t) => `${tabs.length > 1 ? `**${t.label}**\n\n` : ""}${dedent(t.content)}`).join("\n\n");
		});
	}

	function dedent(text) {
		const lines = text.replace(/\t/g, "  ").split("\n");
		const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
		const min = indents.length ? Math.min(...indents) : 0;
		return lines.map((l) => l.slice(min)).join("\n").trim();
	}

	// ---------------------------------------------------------------- Markdown -> Portable Text
	// Portable Text has no inline images or videos: inlineToSpans collects them here and they are emitted
	// as blocks right after the text block (or list item) they were in.
	// Indented admonitions inside list items (`  :::tip`) take the same route: callouts after the item.
	const media = [];
	const nestedCallouts = [];
	const mediaBlocks = () =>
		media.splice(0).map((m) => {
			if (m.video) return { _type: "embed", _key: key(), url: youtubeUrl(m.video) };
			if (m.callout) return { _type: "callout", _key: key(), ...m.callout };
			return { _type: "image", _key: key(), asset: { _ref: "", url: m.src }, alt: m.alt };
		});
	const hasText = (block) => block.children.some((c) => c.text.trim());

	function inlineToSpans(tokens = [], markDefs, marks = []) {
		const spans = [];
		const push = (text, m = marks) => text && spans.push({ _type: "span", _key: key(), text, marks: [...m] });
		const pushText = (text) =>
			text.split(/(%%(?:youtube|callout):\d+%%)/).forEach((part) => {
				const token = /^%%(youtube|callout):(\d+)%%$/.exec(part);
				if (token?.[1] === "youtube") media.push({ video: videos[token[2]] });
				else if (token) media.push({ callout: nestedCallouts[token[2]] });
				else push(part);
			});
		for (const t of tokens) {
			switch (t.type) {
				case "strong":
					spans.push(...inlineToSpans(t.tokens, markDefs, [...marks, "strong"]));
					break;
				case "em":
					spans.push(...inlineToSpans(t.tokens, markDefs, [...marks, "em"]));
					break;
				case "del":
					spans.push(...inlineToSpans(t.tokens, markDefs, [...marks, "strike-through"]));
					break;
				case "codespan":
					push(t.text, [...marks, "code"]);
					break;
				case "link": {
					const k = key();
					markDefs.push({ _key: k, _type: "link", href: t.href });
					spans.push(...inlineToSpans(t.tokens, markDefs, [...marks, k]));
					break;
				}
				case "br":
					push("\n");
					break;
				case "html":
					if (/^<br\s*\/?>$/i.test(t.raw.trim())) push("\n");
					else if (/^<img\s/i.test(t.raw.trim())) media.push(imgAttributes(t.raw));
					else push(t.raw);
					break;
				case "image":
					media.push({ src: t.href, alt: t.text ?? "" });
					break;
				case "text":
					if (t.tokens?.length) spans.push(...inlineToSpans(t.tokens, markDefs, marks));
					else pushText(t.text);
					break;
				default:
					push(t.raw ?? "");
			}
		}
		return spans;
	}

	/** Drops trailing whitespace from the last spans; a trailing "\n" would render as <br>. */
	function trimEnd(spans) {
		while (spans.length) {
			const last = spans.at(-1);
			last.text = last.text.trimEnd();
			if (last.text) return;
			spans.pop();
		}
	}

	const textBlock = (tokens, extra = {}) => {
		const markDefs = [];
		const pulled = media.length;
		const children = inlineToSpans(tokens, markDefs);
		// the line break before an image, video or callout moved out of the block stays behind otherwise
		if (media.length > pulled) trimEnd(children);
		if (!children.length) children.push({ _type: "span", _key: key(), text: "", marks: [] });
		return { _type: "block", _key: key(), style: "normal", markDefs, children, ...extra };
	};

	// Numbered items carry listId + listStart (their own number) so a list split by an image, video or
	// callout keeps counting instead of restarting at 1 (emdash/src/content/portable-text-lists.ts).
	let listSeq = 0;
	function listToBlocks(list, level = 1) {
		const out = [];
		const listId = list.ordered ? `${slug}:list-${listSeq++}` : undefined;
		const start = Number(list.start) || 1;
		for (const [n, item] of list.items.entries()) {
			const extra = list.ordered ? { listItem: "number", level, listId, listStart: start + n } : { listItem: "bullet", level };
			for (const t of item.tokens) {
				if (t.type === "list") out.push(...listToBlocks(t, level + 1));
				else if (t.type === "text" || t.type === "paragraph") {
					const block = textBlock(t.tokens ?? [t], extra);
					if (hasText(block) || !media.length) out.push(block);
					out.push(...mediaBlocks());
				}
			}
		}
		return out;
	}

	function tableToCoreTable(t) {
		const cell = (c, isHeader) => {
			const markDefs = [];
			return { _type: "tableCell", _key: key(), content: inlineToSpans(c.tokens, markDefs), markDefs, isHeader };
		};
		return {
			_type: "table",
			_key: key(),
			hasHeaderRow: true,
			rows: [
				{ _type: "tableRow", _key: key(), cells: t.header.map((c) => cell(c, true)) },
				...t.rows.map((r) => ({ _type: "tableRow", _key: key(), cells: r.map((c) => cell(c, false)) })),
			],
		};
	}

	function markdownToBlocks(md) {
		const blocks = [];
		for (const t of marked.lexer(md)) {
			switch (t.type) {
				case "heading":
					blocks.push(textBlock(t.tokens, { style: `h${t.depth}` }));
					break;
				case "paragraph": {
					const block = textBlock(t.tokens);
					if (hasText(block) || !media.length) blocks.push(block);
					break;
				}
				case "list":
					blocks.push(...listToBlocks(t));
					break;
				case "blockquote":
					for (const p of t.tokens) if (p.tokens) blocks.push(textBlock(p.tokens, { style: "blockquote" }));
					break;
				case "hr":
					blocks.push({ _type: "break", _key: key(), style: "line" });
					break;
				case "code":
					blocks.push({ _type: "code", _key: key(), language: t.lang || undefined, code: t.text });
					break;
				case "table":
					blocks.push(tableToCoreTable(t));
					break;
				case "html": {
					// Only images (possibly in a styled wrapper div) are allowed; anything else needs a converter rule.
					const html = t.raw.trim();
					const tags = html.match(/<img\s[^>]*>/gi) ?? [];
					const rest = html.replace(/<img\s[^>]*>/gi, "").replace(/<\/?(?:div|p|center)\b[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "");
					if (rest.trim()) throw new Error(`${path}: unsupported HTML in prose: ${html.slice(0, 120)}`);
					for (const tag of tags) media.push(imgAttributes(tag));
					break;
				}
				case "space":
					break;
				default:
					console.error(`[convert] unhandled markdown token: ${t.type}`);
			}
			blocks.push(...mediaBlocks());
		}
		return blocks;
	}

	// ---------------------------------------------------------------- Tables -> tool_grid
	const LOGO_CELL = /^\[?\s*<(?:Image\s+img=\{(\w+)\}|(\w+)\s)[^>]*\/>\s*(?:\]\(([^)]+)\))?$/;
	const splitRow = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

	function tableToBlock(lines) {
		const rows = lines.filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l)).map(splitRow);
		const hasLogos = rows.some((r) => r.some((c) => LOGO_CELL.test(c)));
		if (!hasLogos) {
			const t = marked.lexer(lines.join("\n")).find((x) => x.type === "table");
			return tableToCoreTable(t);
		}
		const [header, ...rest] = rows;
		const tools = header.map((h) => {
			const link = h.match(/\[([^\]]+)\]\(([^)]+)\)/);
			const raw = link ? link[1] : h;
			return {
				name: raw.replace(/\*\*/g, "").trim(),
				featured: /\*\*/.test(raw),
				url: link?.[2] ?? "",
				logo: "",
				tagline: "",
			};
		});
		let logoSize = 0;
		for (const r of rest) {
			r.forEach((c, i) => {
				const tool = tools[i];
				if (!tool) return;
				const m = c.match(LOGO_CELL);
				if (m) {
					tool.logo = img(m[1] ?? m[2]);
					if (m[3]) tool.url = m[3];
					logoSize = Math.max(logoSize, Number(c.match(/height=\{(\d+)\}/)?.[1] ?? 0));
				} else if (c) {
					tool.tagline = [tool.tagline, c.replace(/<br\s*\/?>/g, "\n").replace(/\s*\n\s*/g, "\n")]
						.filter(Boolean)
						.join("\n");
				}
			});
		}
		return { _type: "tool_grid", _key: key(), tools: tools.map((t) => ({ ...t })), ...(logoSize ? { logo_size: logoSize } : {}) };
	}

	// ---------------------------------------------------------------- Top-level scanner
	const lines = body.split("\n");
	const blocks = [];
	let prose = [];
	let fullscreen = false;
	const flush = () => {
		if (prose.join("").trim()) blocks.push(...markdownToBlocks(mdxToMarkdown(prose.join("\n"))));
		prose = [];
	};
	/** Lines from i up to the first line matching endRe; lines inside fenced code never end the run. */
	const collectUntil = (i, endRe) => {
		const out = [];
		let fence = null;
		for (; i < lines.length; i++) {
			const line = lines[i];
			if (fence) {
				if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
			} else if (endRe.test(line)) {
				break;
			} else {
				fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? null;
			}
			out.push(line);
		}
		return [out, i];
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let m;
		if (/^\s*<!--.*-->\s*$/.test(line) || /^\s*<TOCInline/.test(line)) continue;
		if (/^\s*<InvestmentWarning\s*\/>/.test(line)) {
			flush();
			blocks.push({ _type: "investment_warning", _key: key(), lang: warningLang });
		} else if ((m = line.match(/^::::(\w+)[ \t]*(.*)$/))) {
			// 4-colon admonition wrapping a 3-colon one: a callout body is Markdown and cannot nest a callout,
			// so the outer one ends at the first nested `:::tone` line and the inner one follows as its own block.
			flush();
			const [inner, end] = collectUntil(i + 1, /^:{3,4}(?:\w+.*)?\s*$/);
			i = /^::::\s*$/.test(lines[end] ?? "") ? end : end - 1;
			blocks.push({ _type: "callout", _key: key(), tone: m[1], title: m[2].trim(), body: bodyMarkdown(dedent(inner.join("\n"))) });
		} else if (/^::::\s*$/.test(line)) {
			// closing line of a 4-colon admonition whose nested callout was emitted separately
		} else if ((m = line.match(/^:::(\w+)[ \t]*(.*)$/))) {
			flush();
			const [inner, end] = collectUntil(i + 1, /^:::\s*$/);
			i = end;
			blocks.push({ _type: "callout", _key: key(), tone: m[1], title: m[2].trim(), body: bodyMarkdown(dedent(inner.join("\n"))) });
		} else if (/^\s*<details>/.test(line)) {
			flush();
			const [inner, end] = collectUntil(i + 1, /^\s*<\/details>/);
			i = end;
			const joined = inner.join("\n");
			const summary = joined.match(/<summary>([\s\S]*?)<\/summary>/)?.[1].trim() ?? "Details";
			const rest = joined.replace(/<summary>[\s\S]*?<\/summary>/, "").replace(/^\s*<\/?div>\s*$/gm, "");
			// A details body is Markdown, so Tabs inside it become bold labels followed by each tab's content
			blocks.push({ _type: "details", _key: key(), summary, body: bodyMarkdown(tabsToMarkdown(dedent(rest))) });
		} else if (/^\s*<div className="tools-gallery">/.test(line)) {
			flush();
			const [inner, end] = collectUntil(i + 1, /^<\/div>\s*$/);
			i = end;
			for (const { title, tools } of parseToolsGallery(inner.join("\n"), img)) {
				blocks.push({ _type: "tool_grid", _key: key(), title, tools, logo_size: 100 });
			}
		} else if (/^\s*<FullscreenWrapper>/.test(line)) {
			fullscreen = true;
		} else if (/^\s*<\/FullscreenWrapper>/.test(line)) {
			fullscreen = false;
		} else if (/^\s*<Tabs\b/.test(line)) {
			flush();
			const [inner, end] = collectUntil(i, /^\s*<\/Tabs>/);
			i = end;
			const { tabs, defaultIndex } = parseTabs(inner.join("\n"));
			blocks.push({
				_type: "tabs",
				_key: key(),
				tabs: tabs.map((t) => ({ label: t.label, body: bodyMarkdown(dedent(t.content)) })),
				default_tab: defaultIndex + 1,
				fullscreen,
			});
		} else if (/^```mermaid\s*$/.test(line)) {
			flush();
			const [inner, end] = collectUntil(i + 1, /^```\s*$/);
			i = end;
			blocks.push({ _type: "mermaid", _key: key(), code: mdxToMarkdown(inner.join("\n"), { links: false }) });
		} else if ((m = line.match(/^\s*(`{3,}|~{3,})/))) {
			// A fenced code block is prose: `|`, `:::`, `<details>` or `<Tabs` lines inside it are code, not blocks
			const close = new RegExp(`^\\s*${m[1][0]}{${m[1].length},}\\s*$`);
			prose.push(line);
			while (++i < lines.length) {
				prose.push(lines[i]);
				if (close.test(lines[i])) break;
			}
		} else if (/^\s*\|/.test(line)) {
			flush();
			const [inner, end] = collectUntil(i, /^(?!\s*\|)/);
			i = end - 1;
			blocks.push(tableToBlock(inner), ...mediaBlocks()); // images from text-only table cells follow the table
		} else if ((m = line.match(/^(\s+):::(\w+)[ \t]*(.*)$/))) {
			// Indented admonition (inside a list item): becomes a callout right after that item
			const [inner, end] = collectUntil(i + 1, /^\s*:::\s*$/);
			i = end;
			nestedCallouts.push({ tone: m[2], title: m[3].trim(), body: bodyMarkdown(dedent(inner.join("\n"))) });
			prose.push(`${m[1]}%%callout:${nestedCallouts.length - 1}%%`);
		} else {
			prose.push(line);
		}
	}
	flush();

	// The first H1 is dropped (the page title replaces it); if it carries a link, that link survives as a normal paragraph
	const h1 = blocks.findIndex((b) => b.style === "h1");
	const h1Block = h1 >= 0 ? blocks[h1] : undefined;
	if (h1Block?.markDefs.length) blocks[h1] = { ...h1Block, style: "normal" };
	else if (h1Block) blocks.splice(h1, 1);
	const h1Text = h1Block?.children.map((c) => c.text).join("");
	const title = String(frontmatter.title ?? h1Text ?? slug);
	return { frontmatter, slug, title, blocks };
}

/** Convert one Docusaurus MDX doc into an EmDash `docs` payload (options as for mdxToBlocks, plus the doc fields). */
export function convertMdx(src, { section = "ai", category = "general", order = 0, ...options }) {
	const { frontmatter, slug, title, blocks } = mdxToBlocks(src, options);
	return {
		collection: "docs",
		slug,
		data: {
			title,
			description: String(frontmatter.description ?? frontmatter.title ?? ""),
			section,
			category,
			sort_order: Number(order),
			body: blocks,
		},
	};
}
