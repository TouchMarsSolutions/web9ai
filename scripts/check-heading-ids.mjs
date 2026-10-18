#!/usr/bin/env node
// Usage: node scripts/check-heading-ids.mjs [baseUrl]      (default http://localhost:4321)
//
// Renders every docs page of a running site and checks its heading ids (scripts/lib/heading-ids.mjs): the page has a
// docs article; every h2-h6 in it has an id and a "#" link to that id; no id appears twice; every "On this page" link
// resolves to an h2/h3 of the article. The ids flow DocsPage -> Astro.locals.headingIds -> Heading.astro -> core Block,
// and no unit test renders a heading, so an emdash or astro-portabletext upgrade that changes the node shape would drop
// every id with a green suite. Run it against the dev server before a deploy and after such an upgrade.
// It needs no legacy/ and no old site: it compares the page with itself.
//
// The pages come from the site itself. The sidebar shows one section, so it starts from the doc links of the header
// menu on each locale's home page, / and /zh-CN/ (one doc per section), and unions the sidebar links of each: an en
// sidebar lists the en docs; a zh-CN one lists the translations under their own slugs, the docs that exist only in
// zh-CN, and the fallback pages of the en docs without a translation. Every en doc's /zh-CN twin is checked too. That
// crawl depends on the chrome it walks, so it is cross-checked against /sitemap-docs.xml, which does not: the crawl
// must have checked every doc the sitemap lists, en and zh-CN, and some headings and some TOC links, or the check fails
// (a crawl that silently finds nothing would otherwise pass). A heading the renderer marks
// data-w9-chrome (ToolGrid's title) is exempt; a heading in a Markdown field has no id and is reported.
// Prints one line per page with problems, the sitemap cross-check, then
//   pages=<n> headings=<n> toc-links=<n> problems=<n>
// and exits 1 on any problem, any failed or timed-out fetch, a home page whose header links no doc, or fewer than 2
// pages found (the crawl itself broke).
import { checkHeadings, coverageProblems, headerDocHrefs, navDocHrefs, sitemapDocs } from "./lib/heading-ids.mjs";

const base = (process.argv[2] ?? "http://localhost:4321").replace(/\/+$/, "");
let failures = 0;

/** The page's HTML, or null (and a printed line) when it cannot be fetched in 30 s. */
async function get(path) {
	try {
		const res = await fetch(base + path, { signal: AbortSignal.timeout(30_000) });
		if (res.ok) return await res.text();
		console.log(`${path}: HTTP ${res.status}`);
	} catch (err) {
		console.log(`${path}: ${err.message}`);
	}
	failures++;
	return null;
}

const docs = new Set();
for (const homePath of ["/", "/zh-CN/"]) {
	const home = await get(homePath);
	const starts = home ? headerDocHrefs(home) : [];
	// a home page whose header links no doc (a broken menu in that locale) would leave its sidebars uncrawled
	if (home && !starts.length) {
		console.log(`${homePath}: the header links no /docs page`);
		failures++;
	}
	for (const start of starts) {
		docs.add(start);
		const html = await get(start);
		if (html) for (const href of navDocHrefs(html)) docs.add(href);
	}
}
for (const href of [...docs]) if (href.startsWith("/docs/")) docs.add(`/zh-CN${href}`);
const pages = [...docs].sort();

let headings = 0;
let tocLinks = 0;
let problems = 0;
for (const path of pages) {
	const html = await get(path);
	if (html === null) continue;
	const found = checkHeadings(html);
	headings += found.headings;
	tocLinks += found.tocLinks;
	problems += found.problems.length;
	if (found.problems.length) console.log(`${path}:\n${found.problems.map((p) => `  ${p}`).join("\n")}`);
}

const xml = await get("/sitemap-docs.xml");
const sitemap = xml === null ? null : sitemapDocs(xml);
const coverage = coverageProblems({ crawled: pages, sitemap, headings, tocLinks });
problems += coverage.length;
const count = (paths) => {
	const zh = paths.filter((path) => path.startsWith("/zh-CN/")).length;
	return `${paths.length - zh} en + ${zh} zh-CN docs`;
};
console.log(`sitemap-docs.xml: ${sitemap ? count(sitemap) : "unreadable"}; crawl: ${count(pages)}`);
for (const p of coverage) console.log(`  coverage: ${p}`);
console.log(`pages=${pages.length} headings=${headings} toc-links=${tocLinks} problems=${problems}`);
if (pages.length < 2) console.log("the crawl found fewer than 2 pages: is the site running and the menu pointing at /docs/…?");
process.exit(problems || failures || pages.length < 2 ? 1 : 0);
