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
// menu on the home page (one doc per section), unions the sidebar links of each, and checks every en doc and its
// /zh-CN twin. Prints one line per page with problems, then
//   pages=<n> headings=<n> toc-links=<n> problems=<n>
// and exits 1 on any problem, any failed fetch, or fewer than 2 pages found (the crawl itself broke).
import { checkHeadings, headerDocHrefs, navDocHrefs } from "./lib/heading-ids.mjs";

const base = (process.argv[2] ?? "http://localhost:4321").replace(/\/+$/, "");
let failures = 0;

/** The page's HTML, or null (and a printed line) when it cannot be fetched. */
async function get(path) {
	try {
		const res = await fetch(base + path);
		if (res.ok) return await res.text();
		console.log(`${path}: HTTP ${res.status}`);
	} catch (err) {
		console.log(`${path}: ${err.message}`);
	}
	failures++;
	return null;
}

const enHref = (href) => href.replace(/^\/zh-CN/, "");
const home = await get("/");
const starts = home ? headerDocHrefs(home).map(enHref) : [];
const docs = new Set(starts);
for (const start of starts) {
	const html = await get(start);
	if (html) for (const href of navDocHrefs(html)) docs.add(enHref(href));
}
const pages = [...docs].flatMap((href) => [href, `/zh-CN${href}`]);

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
console.log(`pages=${pages.length} headings=${headings} toc-links=${tocLinks} problems=${problems}`);
if (pages.length < 2) console.log("the crawl found fewer than 2 pages: is the site running and the menu pointing at /docs/…?");
process.exit(problems || failures || pages.length < 2 ? 1 : 0);
