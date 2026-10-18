import { describe, expect, it } from "vitest";
import { checkHeadings, docsArticle, headerDocHrefs, headingProblems, navDocHrefs } from "./heading-ids.mjs";

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
	it("skips a ToolGrid block's own title (an h4 right before its data-w9-tools grid): it is not a Portable Text heading", () => {
		const grid = `<h4 class="mt-4 mb-2">AI Agents</h4><div class="not-prose" data-w9-tools><a href="https://x.dev">t</a></div>`;
		expect(checkHeadings(page({ body: `<h2 id="a">A${hash("a")}</h2>${grid}` }))).toEqual({ problems: [], headings: 1, tocLinks: 0 });
		// a heading with an id before a grid is a real heading and is still checked; so is the same h4 anywhere else
		expect(headingProblems(page({ body: `<h3 id="a">A</h3>${grid.slice(grid.indexOf("<div"))}` }))).toEqual(['h3 id="a" has no hash link to #a']);
		expect(headingProblems(page({ body: `<h4 class="mt-4 mb-2">AI Agents</h4><div class="not-prose"></div>` }))).toEqual(['h4 "AI Agents" has no id']);
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
	const nav = (links) => `<nav aria-label="Docs" class="x"><ul>${links.map((h) => `<li><a class="l" href="${h}">t</a></li>`).join("")}</ul></nav>`;
	it("lists the doc links of every Docs nav, once each", () => {
		const html = `<nav aria-label="Main"><a href="/docs/other">no</a></nav>${nav(["/docs/a", "/docs/b"])}<dialog>${nav(["/docs/b", "/docs/c"])}</dialog>`;
		expect(navDocHrefs(html)).toEqual(["/docs/a", "/docs/b", "/docs/c"]);
	});
});

describe("headerDocHrefs", () => {
	it("lists the site-relative doc links of the header, once each, and skips every other link", () => {
		const html = `<header><a href="/docs/intro">i</a><a href="/posts">p</a><a href="https://x.dev/docs/z">x</a><a href="/docs/intro">again</a><a href="/zh-CN/docs/intro">z</a></header><footer><a href="/docs/foot">f</a></footer>`;
		expect(headerDocHrefs(html)).toEqual(["/docs/intro", "/zh-CN/docs/intro"]);
	});
});
