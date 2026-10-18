// Checks of the rendered heading ids of a docs page (final review 2026-10-17, #1). Pure functions over an HTML string:
// scripts/check-heading-ids.mjs feeds them every docs page of a running site. The scan is a small linear tokenizer, not
// a regex over whole tags: it skips comments and the text of <script>/<style>, and respects quotes inside a tag.
// Ids and fragments are compared decoded the same way (HTML entities, then decodeURIComponent), as some renderers
// percent-encode non-ASCII in href and others do not.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const RAW_TEXT = new Set(["script", "style"]);

/** Decodes the HTML character references of an attribute value (named: amp lt gt quot apos nbsp; numeric). */
function decodeEntities(s) {
	return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, ref) => {
		if (ref[0] !== "#") return ENTITIES[ref.toLowerCase()] ?? m;
		const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
		return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
	});
}

/** An id or fragment as it compares: entities decoded, then percent-decoded; null when the percent-encoding is bad. */
function normalize(s) {
	try {
		return decodeURIComponent(decodeEntities(s));
	} catch {
		return null;
	}
}
/** `normalize`, falling back to the entity-decoded text, for ids (a bad percent sequence in an id is just text). */
const normalizeId = (s) => normalize(s) ?? decodeEntities(s);

/** Every start and end tag of `html` in order: { name, close, attrs: Map, start, end }. Linear in the input. */
function tokenize(html) {
	const tokens = [];
	let i = 0;
	while (i < html.length) {
		const lt = html.indexOf("<", i);
		if (lt < 0) break;
		if (html.startsWith("<!--", lt)) {
			const end = html.indexOf("-->", lt + 4);
			if (end < 0) break;
			i = end + 3;
			continue;
		}
		const m = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(html.slice(lt, lt + 80));
		if (!m) {
			i = lt + 1;
			continue;
		}
		// the tag ends at the first ">" outside quotes; a tag that never ends is not a tag
		let j = lt + m[0].length;
		let quote = "";
		for (; j < html.length; j++) {
			const c = html[j];
			if (quote) {
				if (c === quote) quote = "";
			} else if (c === '"' || c === "'") quote = c;
			else if (c === ">") break;
		}
		if (j >= html.length) break;
		const name = m[2].toLowerCase();
		const attrs = new Map();
		if (!m[1]) {
			for (const a of html.slice(lt + m[0].length, j).matchAll(ATTR)) {
				if (!attrs.has(a[1].toLowerCase())) attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
			}
		}
		tokens.push({ name, close: Boolean(m[1]), attrs, start: lt, end: j + 1 });
		i = j + 1;
		if (!m[1] && RAW_TEXT.has(name)) {
			// the text of a script or style is not markup: continue at its end tag
			const closer = new RegExp(`</${name}`, "gi");
			closer.lastIndex = i;
			const found = closer.exec(html);
			if (!found) break;
			i = found.index;
		}
	}
	return tokens;
}

const hasClass = (t, cls) => (t.attrs.get("class") ?? "").split(/\s+/).includes(cls);
const isHeadingTag = (name) => /^h[2-6]$/.test(name);

/** Index of the end tag that matches the start tag at tokens[from]; tokens.length when the element is never closed. */
function elementEnd(tokens, from) {
	const { name } = tokens[from];
	let depth = 0;
	for (let k = from; k < tokens.length; k++) {
		if (tokens[k].name !== name) continue;
		depth += tokens[k].close ? -1 : 1;
		if (depth === 0) return k;
	}
	return tokens.length;
}

/** The `<article class="docs-article …">…</article>` element of `html`, or null when the page has none. */
export function docsArticle(html) {
	const tokens = tokenize(html);
	const from = tokens.findIndex((t) => t.name === "article" && !t.close && hasClass(t, "docs-article"));
	if (from < 0) return null;
	const to = elementEnd(tokens, from);
	return html.slice(tokens[from].start, to < tokens.length ? tokens[to].end : html.length);
}

/** The site-relative `/docs/…` or `/zh-CN/docs/…` hrefs of the links inside every element `isStart` picks, once each. */
function docHrefsWithin(html, isStart) {
	const tokens = tokenize(html);
	const hrefs = new Set();
	for (let k = 0; k < tokens.length; k++) {
		if (tokens[k].close || !isStart(tokens[k])) continue;
		const to = elementEnd(tokens, k);
		for (let n = k + 1; n < Math.min(to + 1, tokens.length); n++) {
			const href = tokens[n].name === "a" && !tokens[n].close ? tokens[n].attrs.get("href") : undefined;
			if (href !== undefined && /^(\/zh-CN)?\/docs\/[^/?#]+$/.test(href)) hrefs.add(href);
		}
		k = to;
	}
	return [...hrefs];
}

/** The doc links of every `<nav data-docs-sidebar>` (the docs sidebar; its label depends on the locale), once each. */
export const navDocHrefs = (html) => docHrefsWithin(html, (t) => t.name === "nav" && t.attrs.has("data-docs-sidebar"));

/** The doc links of the site header's menu, once each. */
export const headerDocHrefs = (html) => docHrefsWithin(html, (t) => t.name === "header");

/**
 * What the heading-id check finds in one page: { problems, headings, tocLinks }. headings counts the h2-h6 of the docs
 * article, tocLinks the `#` links inside every [data-toc] list. Problems, in this order: no docs article; duplicate ids
 * (all elements); per heading, no id or no matching hash link; per TOC link, no h2/h3 of the article with that id.
 * Headings marked data-w9-chrome are skipped (see below).
 */
export function checkHeadings(html) {
	const tokens = tokenize(html);
	const problems = [];
	const articleAt = tokens.findIndex((t) => t.name === "article" && !t.close && hasClass(t, "docs-article"));
	if (articleAt < 0) problems.push("no docs article");

	const seen = new Map();
	for (const t of tokens) {
		const id = t.close ? "" : decodeEntities(t.attrs.get("id") ?? "");
		if (id) seen.set(id, (seen.get(id) ?? 0) + 1);
	}
	for (const [id, n] of seen) if (n > 1) problems.push(`duplicate id "${id}"`);

	const tocLinks = [];
	let toc = null;
	for (let k = 0; k < tokens.length; k++) {
		const t = tokens[k];
		if (toc) {
			if (t.name === toc.name) toc.depth += t.close ? -1 : 1;
			if (toc.depth === 0) toc = null;
			else if (t.name === "a" && !t.close && (t.attrs.get("href") ?? "").startsWith("#")) tocLinks.push(t.attrs.get("href").slice(1));
		} else if (!t.close && t.attrs.has("data-toc")) toc = { name: t.name, depth: 1 };
	}
	if (articleAt < 0) return { problems, headings: 0, tocLinks: tocLinks.length };

	// the headings of the article, in one pass: each takes the hash links between its start and end tag
	const articleEnd = Math.min(elementEnd(tokens, articleAt), tokens.length - 1);
	const headings = [];
	let current = null;
	let pos = tokens[articleAt].end;
	let inHash = false;
	// A heading the renderer marks data-w9-chrome (ToolGrid.astro's title) is block chrome, not a Portable Text heading:
	// no id by design, as on the old site, where it was JSX. Content cannot carry the marker (the sanitizers strip data-*)
	// and Heading.astro never emits it, so a broken heading renderer cannot exempt itself. A heading inside a Markdown
	// field (Callout, Tabs, Details) has no marker and is reported: it has no id and no TOC entry.
	const finish = () => {
		if (current && !current.chrome) headings.push(current);
		current = null;
		inHash = false;
	};
	for (let k = articleAt + 1; k <= articleEnd; k++) {
		const t = tokens[k];
		if (current && !inHash) current.text += html.slice(pos, t.start);
		pos = t.end;
		if (isHeadingTag(t.name) && !t.close) {
			finish();
			current = { tag: t.name, id: decodeEntities(t.attrs.get("id") ?? ""), chrome: t.attrs.has("data-w9-chrome"), text: "", hashes: [] };
		} else if (current && t.name === current.tag && t.close) finish();
		else if (current && t.name === "a") {
			if (!t.close && hasClass(t, "hash-link")) {
				current.hashes.push(t.attrs.get("href") ?? "");
				inHash = true;
			} else if (t.close) inHash = false;
		}
	}
	finish();

	const label = (h) => decodeEntities(h.text.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim().slice(0, 60);
	for (const h of headings) {
		if (!h.id) problems.push(`${h.tag} "${label(h)}" has no id`);
		else if (!h.hashes.some((href) => href.startsWith("#") && normalizeId(href.slice(1)) === normalizeId(h.id))) problems.push(`${h.tag} id="${h.id}" has no hash link to #${h.id}`);
	}
	const targets = new Set(headings.filter((h) => (h.tag === "h2" || h.tag === "h3") && h.id).map((h) => normalizeId(h.id)));
	for (const href of tocLinks) {
		const target = normalize(href);
		if (target === null) problems.push(`TOC link #${href} cannot be decoded`);
		else if (!targets.has(target)) problems.push(`TOC link #${href} has no h2/h3 with that id in the article`);
	}
	return { problems, headings: headings.length, tocLinks: tocLinks.length };
}

/** The problems of one page's heading ids; empty when the page is fine. */
export const headingProblems = (html) => checkHeadings(html).problems;

/**
 * The `/docs/<slug>` and `/zh-CN/docs/<slug>` paths a sitemap lists (`<loc>` URLs; other pages left out), once each,
 * sorted. The sitemap lists a zh-CN doc only where it has its own entry (a translation, or a doc only in zh-CN), not
 * the fallback pages that show the en text.
 */
export function sitemapDocs(xml) {
	const paths = new Set();
	for (let at = xml.indexOf("<loc>"); at >= 0; at = xml.indexOf("<loc>", at + 5)) {
		const end = xml.indexOf("</loc>", at + 5);
		if (end < 0) break;
		let path;
		try {
			path = decodeURIComponent(new URL(decodeEntities(xml.slice(at + 5, end).trim())).pathname);
		} catch {
			continue;
		}
		if (/^(\/zh-CN)?\/docs\/[^/]+$/.test(path)) paths.add(path);
	}
	return [...paths].sort();
}

/**
 * What a crawl that "found no problems" must still show, so a guard that went vacuous cannot pass: the sitemap was read and
 * lists en docs, the crawl checked every doc it lists, en and zh-CN (`crawled` and `sitemap` are `/docs/<slug>` and
 * `/zh-CN/docs/<slug>` paths; `sitemap` is null when the sitemap could not be read), and some headings and some TOC
 * links were checked.
 */
export function coverageProblems({ crawled, sitemap, headings, tocLinks }) {
	const problems = [];
	const plain = (path) => normalize(path) ?? path;
	if (sitemap === null) problems.push("/sitemap-docs.xml could not be read");
	else if (!sitemap.some((path) => path.startsWith("/docs/"))) problems.push("/sitemap-docs.xml lists 0 en docs");
	else {
		const checked = new Set(crawled.map(plain));
		const missing = sitemap.filter((path) => !checked.has(plain(path)));
		if (missing.length) problems.push(`the crawl checked ${sitemap.length - missing.length} of the ${sitemap.length} docs the sitemap lists; missing: ${missing.join(", ")}`);
	}
	if (headings === 0) problems.push("no headings were checked");
	if (tocLinks === 0) problems.push("no TOC links were checked");
	return problems;
}
