import { describe, expect, it } from "vitest";
import { checkHeadings, coverageProblems, docsArticle, headerDocHrefs, headingProblems, navDocHrefs, sitemapDocs } from "./heading-ids.mjs";

// A docs page cut down to what the check reads: a TOC, the article, and one chrome id outside it.
const hash = (id, text = "x") => `<a class="hash-link" href="#${id}" aria-label="Direct link to ${text}">#</a>`;
const page = ({ toc = [], body = "", chrome = '<dialog id="site:drawer"></dialog>' } = {}) =>
	`<!doctype html><html><body>${chrome}<ul class="m-0" data-toc>${toc
		.map((href) => `<li><a class="block" href="#${href}">t</a></li>`)
		.join("")}</ul><main><article class="docs-article prose max-w-none"><h1>Title</h1>${body}</article></main></body></html>`;

const GOOD = page({
	toc: ["intro", "details"],
	body: `<h2 id="intro" data-astro-cid-a="true">Intro${hash("intro")}</h2><p>text</p><h3 id="details">Details${hash("details")}</h3>`,
});

describe("docsArticle", () => {
	it("returns the docs article element", () => {
		const article = docsArticle(GOOD);
		expect(article.startsWith('<article class="docs-article prose max-w-none">')).toBe(true);
		expect(article.endsWith("</article>")).toBe(true);
		expect(article).toContain('<h2 id="intro"');
		expect(article).not.toContain("data-toc");
	});
	it("is null when no article carries the docs-article class", () => {
		expect(docsArticle('<article class="post"><h2 id="a">A</h2></article>')).toBeNull();
		expect(docsArticle("<p>no article</p>")).toBeNull();
	});
	it("matches the class as a whole token", () => {
		expect(docsArticle('<article class="not-docs-article-x">a</article>')).toBeNull();
		expect(docsArticle("<article data-x='1' class='prose docs-article'>a</article>")).toBe("<article data-x='1' class='prose docs-article'>a</article>");
	});
	it("pairs nested articles and ignores tags inside script, style and comments", () => {
		const html = `<article class="docs-article"><script>var s = "</article>";</script><!-- </article> --><article>inner</article><p>after</p></article><p>outside</p>`;
		expect(docsArticle(html)).toBe(html.slice(0, html.indexOf("<p>outside</p>")));
	});
});

describe("headingProblems", () => {
	it("is empty for a good page", () => {
		expect(headingProblems(GOOD)).toEqual([]);
		expect(checkHeadings(GOOD)).toEqual({ problems: [], headings: 2, tocLinks: 2 });
	});
	it("accepts a page without a TOC (nothing to resolve)", () => {
		expect(headingProblems(page({ body: `<h2 id="a">A${hash("a")}</h2>` }))).toEqual([]);
	});
	it("reports a page with no docs article", () => {
		expect(headingProblems("<html><body><h2>No article</h2></body></html>")).toEqual(["no docs article"]);
	});
	it("reports a heading without an id, or with an empty one", () => {
		expect(headingProblems(page({ body: `<h2>Plain</h2>` }))).toEqual(['h2 "Plain" has no id']);
		expect(headingProblems(page({ body: `<h4 id="">Empty${hash("")}</h4>` }))).toEqual(['h4 "Empty" has no id']);
	});
	it("skips a heading the renderer marks data-w9-chrome (ToolGrid's title): block chrome, not a Portable Text heading", () => {
		const grid = `<h4 class="mt-4 mb-2" data-w9-chrome>AI Agents</h4><div class="not-prose" data-w9-tools><a href="https://x.dev">t</a></div>`;
		expect(checkHeadings(page({ body: `<h2 id="a">A${hash("a")}</h2>${grid}` }))).toEqual({ problems: [], headings: 1, tocLinks: 0 });
		// the marker exempts whatever carries it, wherever it sits and whatever the level
		expect(headingProblems(page({ body: `<h3 data-w9-chrome class="x">Chrome</h3>` }))).toEqual([]);
	});
	it("reports the same h4 without the marker, even right before a data-w9-tools grid", () => {
		const unmarked = `<h4 class="mt-4 mb-2">AI Agents</h4><div class="not-prose" data-w9-tools></div>`;
		expect(headingProblems(page({ body: unmarked }))).toEqual(['h4 "AI Agents" has no id']);
		expect(headingProblems(page({ body: `<h3 id="a">A</h3>${unmarked.slice(unmarked.indexOf("<div"))}` }))).toEqual(['h3 id="a" has no hash link to #a']);
	});
	it("reports a heading inside a Markdown-field block (no id, no marker): a real parity gap, none exist today", () => {
		const callout = `<aside class="callout callout--info"><div><h3>Inner</h3><p>text</p></div></aside>`;
		expect(headingProblems(page({ body: callout }))).toEqual(['h3 "Inner" has no id']);
	});
	it("reports a heading with an id but no hash link", () => {
		expect(headingProblems(page({ body: `<h3 id="a">A</h3>` }))).toEqual(['h3 id="a" has no hash link to #a']);
	});
	it("reports a hash link that points at another id, or that is not a hash-link", () => {
		expect(headingProblems(page({ body: `<h2 id="a">A${hash("b")}</h2>` }))).toEqual(['h2 id="a" has no hash link to #a']);
		expect(headingProblems(page({ body: `<h2 id="a">A<a class="other" href="#a">#</a></h2>` }))).toEqual(['h2 id="a" has no hash link to #a']);
	});
	it("reports a duplicate id anywhere in the page, headings or not", () => {
		const twice = page({ body: `<h2 id="a">A${hash("a")}</h2><h3 id="a">B${hash("a")}</h3>` });
		expect(headingProblems(twice)).toEqual(['duplicate id "a"']);
		const chrome = page({ body: `<h2 id="site:drawer">A${hash("site:drawer")}</h2>` });
		expect(headingProblems(chrome)).toEqual(['duplicate id "site:drawer"']);
		const thrice = page({ body: `<p id="z">1</p><p id="z">2</p><p id="z">3</p>` });
		expect(headingProblems(thrice)).toEqual(['duplicate id "z"']);
	});
	it("reports a TOC link no h2/h3 of the article answers", () => {
		expect(headingProblems(page({ toc: ["gone"], body: `<h2 id="a">A${hash("a")}</h2>` }))).toEqual(['TOC link #gone has no h2/h3 with that id in the article']);
		// an h4 is not in the TOC range, and an id outside the article does not count (the drawer's id)
		expect(headingProblems(page({ toc: ["deep"], body: `<h4 id="deep">D${hash("deep")}</h4>` }))).toEqual(['TOC link #deep has no h2/h3 with that id in the article']);
		expect(headingProblems(page({ toc: ["site:drawer"], body: `<h2 id="a">A${hash("a")}</h2>` }))).toEqual([
			'TOC link #site:drawer has no h2/h3 with that id in the article',
		]);
	});
	it("reports an href that cannot be decoded instead of throwing", () => {
		expect(headingProblems(page({ toc: ["%E0%A4%A"], body: `<h2 id="a">A${hash("a")}</h2>` }))).toEqual(['TOC link #%E0%A4%A cannot be decoded']);
	});
	it("reports each problem kind in one run, in a stable order", () => {
		const html = page({ toc: ["gone"], body: `<h2>Plain</h2><h3 id="a">A</h3><h3 id="a">B${hash("a")}</h3>` });
		expect(headingProblems(html)).toEqual([
			'duplicate id "a"',
			'h2 "Plain" has no id',
			'h3 id="a" has no hash link to #a',
			'TOC link #gone has no h2/h3 with that id in the article',
		]);
	});
	it("does not read headings outside the article, or tags inside script and comments", () => {
		const html = page({ body: `<h2 id="a">A${hash("a")}</h2>` }).replace(
			"</body>",
			`<h2>Footer</h2><script>document.write("<h2>x</h2><p id='a'>")</script><!-- <h2>c</h2> --></body>`,
		);
		expect(headingProblems(html)).toEqual([]);
	});
	it("reads single-quoted, unquoted and entity-escaped attributes", () => {
		const html = page({ toc: ["a&amp;b"], body: `<h2 id='a&amp;b'>A<a class=hash-link href=#a&amp;b>#</a></h2>` });
		expect(headingProblems(html)).toEqual([]);
	});
	it("counts every h2-h6 of the article and every TOC link of the page", () => {
		const html = page({ toc: ["a", "b", "c"], body: ["h2", "h3", "h4", "h5", "h6"].map((h, i) => `<${h} id="${"abcde"[i]}">T${hash("abcde"[i])}</${h}>`).join("") });
		expect(checkHeadings(html)).toMatchObject({ headings: 5, tocLinks: 3 });
	});

	describe("CJK ids", () => {
		const id = "文生文txt2txt";
		const encoded = encodeURIComponent(id);
		it("resolves a raw id from a raw href", () => {
			expect(headingProblems(page({ toc: [id], body: `<h2 id="${id}">T${hash(id)}</h2>` }))).toEqual([]);
		});
		it("resolves a raw id from a percent-encoded TOC href and hash link", () => {
			expect(headingProblems(page({ toc: [encoded], body: `<h2 id="${id}">T${hash(encoded)}</h2>` }))).toEqual([]);
		});
		it("resolves a percent-encoded id from a raw href, and still flags a different id", () => {
			expect(headingProblems(page({ toc: [id], body: `<h2 id="${encoded}">T${hash(id)}</h2>` }))).toEqual([]);
			expect(headingProblems(page({ toc: [encoded], body: `<h2 id="文生图">T${hash("文生图")}</h2>` }))).toEqual([
				`TOC link #${encoded} has no h2/h3 with that id in the article`,
			]);
		});
	});

	it("stays fast on a large page of unclosed tags, quotes and headings", () => {
		const junk = ['<a class="x" '.repeat(50000), '<h2 id="d">h'.repeat(20000), '<ul data-toc><a href="#d">'.repeat(20000), "<p id='z' ".repeat(20000)];
		for (const tail of junk) {
			const html = page({ body: `<h2 id="a">A${hash("a")}</h2>` + tail });
			const t = Date.now();
			headingProblems(html);
			docsArticle(html);
			expect(Date.now() - t).toBeLessThan(1000);
		}
	});
});

describe("navDocHrefs", () => {
	const nav = (links) => `<nav aria-label="文档侧边栏" data-docs-sidebar class="x"><ul>${links.map((h) => `<li><a class="l" href="${h}">t</a></li>`).join("")}</ul></nav>`;
	it("lists the doc links of every Docs nav, once each", () => {
		const html = `<nav aria-label="Main"><a href="/docs/other">no</a></nav>${nav(["/docs/a", "/docs/b"])}<dialog>${nav(["/docs/b", "/docs/c"])}</dialog>`;
		expect(navDocHrefs(html)).toEqual(["/docs/a", "/docs/b", "/docs/c"]);
	});
	it("goes by data-docs-sidebar, not by the label", () => {
		expect(navDocHrefs(`<nav aria-label="Docs"><a href="/docs/a">a</a></nav>`)).toEqual([]);
		expect(navDocHrefs(`<nav data-docs-sidebar=""><a href="/zh-CN/docs/a">a</a></nav>`)).toEqual(["/zh-CN/docs/a"]);
	});
});

describe("headerDocHrefs", () => {
	it("lists the site-relative doc links of the header, once each, and skips every other link", () => {
		const html = `<header><a href="/docs/intro">i</a><a href="/posts">p</a><a href="https://x.dev/docs/z">x</a><a href="/docs/intro">again</a><a href="/zh-CN/docs/intro">z</a></header><footer><a href="/docs/foot">f</a></footer>`;
		expect(headerDocHrefs(html)).toEqual(["/docs/intro", "/zh-CN/docs/intro"]);
	});
});

describe("sitemapDocs", () => {
	const loc = (u) => `<url><loc>${u}</loc><xhtml:link rel="alternate" hreflang="zh-CN" href="https://x.dev/zh-CN/docs/z" /></url>`;
	it("lists the en and zh-CN doc paths of the sitemap, once each, sorted", () => {
		const xml = `<?xml version="1.0"?><urlset>${[
			loc("https://www.web9.ai/docs/b"),
			loc("https://www.web9.ai/zh-CN/docs/b"),
			loc("https://www.web9.ai/zh-CN/docs/only-zh"),
			loc("https://www.web9.ai/docs/a"),
			loc("https://www.web9.ai/docs/a"),
			loc("https://www.web9.ai/posts/p"),
			loc("https://www.web9.ai/docs/a/deeper"),
			loc("https://www.web9.ai/zh-CN/docs/"),
			loc("https://www.web9.ai/fr/docs/a"),
			loc("https://www.web9.ai/docs/"),
			loc("not a url"),
			`<url><loc>\n  https://www.web9.ai/docs/c_d  \n</loc></url>`,
		].join("")}</urlset>`;
		expect(sitemapDocs(xml)).toEqual(["/docs/a", "/docs/b", "/docs/c_d", "/zh-CN/docs/b", "/zh-CN/docs/only-zh"]);
	});
	it("is empty for a sitemap without locs, or one that is not XML", () => {
		expect(sitemapDocs("<urlset></urlset>")).toEqual([]);
		expect(sitemapDocs("<html>502</html>")).toEqual([]);
		expect(sitemapDocs("<loc>")).toEqual([]);
	});
});

describe("coverageProblems", () => {
	const healthy = { crawled: ["/docs/a", "/docs/b", "/zh-CN/docs/a", "/zh-CN/docs/b"], sitemap: ["/docs/a", "/docs/b", "/zh-CN/docs/a"], headings: 5, tocLinks: 8 };
	it("is empty when the crawl covers the sitemap and checked headings and TOC links", () => {
		expect(coverageProblems(healthy)).toEqual([]);
		// a crawl may find more than the sitemap lists (a fallback page, a draft the sidebar links to)
		expect(coverageProblems({ ...healthy, crawled: [...healthy.crawled, "/docs/extra"] })).toEqual([]);
	});
	it("reports a sitemap that could not be read", () => {
		expect(coverageProblems({ ...healthy, sitemap: null })).toEqual(["/sitemap-docs.xml could not be read"]);
	});
	it("reports a sitemap that lists no en docs, even with zh-CN ones", () => {
		expect(coverageProblems({ ...healthy, sitemap: [] })).toEqual(["/sitemap-docs.xml lists 0 en docs"]);
		expect(coverageProblems({ ...healthy, sitemap: ["/zh-CN/docs/a"] })).toEqual(["/sitemap-docs.xml lists 0 en docs"]);
	});
	it("names the docs the crawl missed, en and zh-CN", () => {
		expect(coverageProblems({ ...healthy, crawled: ["/docs/a"], sitemap: ["/docs/a", "/docs/b", "/docs/c"] })).toEqual([
			"the crawl checked 1 of the 3 docs the sitemap lists; missing: /docs/b, /docs/c",
		]);
		// a doc only in zh-CN, which no en sidebar lists
		expect(coverageProblems({ ...healthy, sitemap: [...healthy.sitemap, "/zh-CN/docs/only-zh"] })).toEqual([
			"the crawl checked 3 of the 4 docs the sitemap lists; missing: /zh-CN/docs/only-zh",
		]);
	});
	it("compares percent-encoded and raw slugs as the same page", () => {
		const raw = "/zh-CN/docs/文生文";
		expect(coverageProblems({ ...healthy, crawled: ["/docs/a", raw], sitemap: ["/docs/a", encodeURI(raw)] })).toEqual([]);
	});
	it("reports zero headings and zero TOC links checked", () => {
		expect(coverageProblems({ ...healthy, headings: 0 })).toEqual(["no headings were checked"]);
		expect(coverageProblems({ ...healthy, tocLinks: 0 })).toEqual(["no TOC links were checked"]);
	});
	it("reports every problem once, in a stable order", () => {
		expect(coverageProblems({ crawled: [], sitemap: ["/docs/a"], headings: 0, tocLinks: 0 })).toEqual([
			"the crawl checked 0 of the 1 docs the sitemap lists; missing: /docs/a",
			"no headings were checked",
			"no TOC links were checked",
		]);
	});
});
