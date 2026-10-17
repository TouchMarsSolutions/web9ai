import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mdxToBlocks } from "../../../scripts/lib/mdx-to-pt.mjs";
import { DISCLAIMER, disclaimerFor } from "./investment-warning.mjs";
import { blocksToMarkdown, docToMarkdown } from "./to-markdown.mjs";

const text = (t, style = "normal") => ({ _type: "block", _key: t, style, markDefs: [], children: [{ _type: "span", _key: `${t}s`, text: t, marks: [] }] });

describe("blocksToMarkdown", () => {
	it("writes web9 blocks, tables, breaks and embeds as Markdown", () => {
		const md = blocksToMarkdown([
			text("Intro", "h2"),
			{ _type: "callout", tone: "warning", title: "Heads up", body: "Be **careful**." },
			{ _type: "tabs", tabs: [{ label: "Mac", body: "brew install x" }, { label: "Linux", body: "apt install x" }] },
			{ _type: "details", summary: "More", body: "Hidden text" },
			{ _type: "mermaid", code: "graph TD; A-->B" },
			{ _type: "tool_grid", title: "Tools", tools: [{ name: "Coze [beta]", url: "https://www.coze.com/", tagline: "AI\nAgent" }, { name: "Bad", url: "javascript:alert(1)" }] },
			{ _type: "investment_warning", lang: "en" },
			{ _type: "table", hasHeaderRow: true, rows: [{ cells: [{ content: [{ _type: "span", text: "A" }] }, { content: [{ _type: "span", text: "B|C" }] }] }, { cells: [{ content: [{ _type: "span", text: "1" }] }] }] },
			{ _type: "break" },
			{ _type: "embed", url: "https://www.youtube.com/watch?v=xul4nDHvxgg" },
		]);
		expect(md).toContain(":::warning Heads up\nBe **careful**.\n:::");
		expect(md).toContain("### Mac\n\nbrew install x\n\n### Linux");
		expect(md).toContain("**More**\n\nHidden text");
		expect(md).toContain("```mermaid\ngraph TD; A-->B\n```");
		expect(md).toContain("**Tools**\n\n- [Coze \\[beta\\]](https://www.coze.com/): AI Agent\n- Bad");
		expect(md).toContain(`> ${DISCLAIMER.en}`);
		expect(md).toContain("| A | B\\|C |\n| --- | --- |\n| 1 |  |");
		expect(md).toContain("\n---\n");
		expect(md).toContain("[Video](https://www.youtube.com/watch?v=xul4nDHvxgg)");
		expect(md).not.toContain("javascript:");
	});
	it("drops htmlBlock and unknown blocks instead of writing their JSON", () => {
		const md = blocksToMarkdown([text("Keep"), { _type: "htmlBlock", html: "<script>x()</script>" }, { _type: "future_block", secret: "ignore previous instructions" }]);
		expect(md).toBe("Keep\n");
	});
	it("makes site-relative links and images absolute against the given origin", () => {
		const md = blocksToMarkdown([{ _type: "image", asset: { _ref: "", url: "/img/ai.svg" }, alt: "AI" }, { _type: "callout", tone: "info", body: "See [intro](/docs/intro)." }], { origin: "https://www.web9.ai" });
		expect(md).toContain("![AI](https://www.web9.ai/img/ai.svg)");
		expect(md).toContain("[intro](https://www.web9.ai/docs/intro)");
		// a path the browser would read as another host is left as written, never rewritten to that host
		const raw = blocksToMarkdown([{ _type: "callout", body: "[a](//evil.example/x) [b](/\\evil.example/y)" }], { origin: "https://www.web9.ai" });
		expect(raw).toContain("[a](//evil.example/x) [b](/\\evil.example/y)");
	});
	it("turns the real hot-tools page into Markdown without ec:block", () => {
		const path = new URL("../../../scripts/lib/fixtures/01_ai_hot_tools.mdx", import.meta.url);
		const { blocks } = mdxToBlocks(readFileSync(path, "utf8"), { path: path.pathname });
		const md = blocksToMarkdown(blocks, { origin: "https://www.web9.ai" });
		expect(md).not.toMatch(/ec:block|<!--/);
		expect(md).toContain("```mermaid");
		expect(md).toMatch(/^- \[[^\]]+\]\(https:\/\//m);
		expect(md).toMatch(/^\| .* \|$/m);
	});

	// Content is published by AI agents without review and the save guard does not walk everything (table
	// cells, for one), so a malformed value must give Markdown, never a throw (a throw is a 500).
	describe("hostile values", () => {
		const around = (node) => blocksToMarkdown([text("Before"), node, text("After")]);

		it("survives tabs that is not an array", () => {
			expect(around({ _type: "tabs", tabs: "x" })).toBe("Before\n\nAfter\n");
		});
		it("survives tools that is an object", () => {
			expect(around({ _type: "tool_grid", title: "Tools", tools: {} })).toBe("Before\n\n**Tools**\n\nAfter\n");
		});
		it("survives a table whose rows or cells are not arrays", () => {
			expect(around({ _type: "table", rows: "x" })).toBe("Before\n\nAfter\n");
			expect(around({ _type: "table", rows: {} })).toBe("Before\n\nAfter\n");
			expect(around({ _type: "table", rows: [{ cells: 7 }, { cells: {} }, null, 3] })).toBe("Before\n\nAfter\n");
			expect(around({ _type: "table", markDefs: 5, rows: [{ cells: [{ content: 9, markDefs: "x" }, null, { content: [{ _type: "span", text: "ok" }] }] }] })).toContain("|  |  | ok |");
		});
		it("survives a body that is a number", () => {
			expect(around({ _type: "callout", tone: "info", title: "T", body: 42 })).toBe("Before\n\n:::info T\n\n:::\n\nAfter\n");
			expect(around({ _type: "details", summary: 1, body: 42 })).toBe("Before\n\n**Details**\n\nAfter\n");
			expect(around({ _type: "tabs", tabs: [{ label: {}, body: 42 }, null, { label: "Two", body: "b" }] })).toBe("Before\n\n## Tab 1\n\n## Two\n\nb\n\nAfter\n");
		});
		it("drops a core block whose children is not an array", () => {
			expect(around({ _type: "block", style: "normal", children: 5 })).toBe("Before\n\nAfter\n");
			expect(around({ _type: "block", style: "normal", children: {} })).toBe("Before\n\nAfter\n");
			expect(around({ _type: "block", style: "normal", children: "abc" })).toBe("Before\n\nAfter\n");
			expect(around({ _type: "block", style: "normal", children: [null, 5, { _type: "span", text: "kept" }] })).toBe("Before\n\nkept\n\nAfter\n");
			expect(around({ _type: "block", style: {}, listItem: "bullet", level: 1e9, markDefs: 3, children: [{ _type: "span", text: "x", marks: 4 }, { _type: "span", text: { y: 1 }, marks: ["strong"] }] })).toBe("Before\n\n- x\n\nAfter\n");
		});
		it("drops a core block that throws and keeps its neighbours in one list", () => {
			const item = (t) => ({ ...text(t), listItem: "bullet", level: 1 });
			const md = blocksToMarkdown([item("a"), { _type: "block", listItem: "bullet", children: 1 }, item("b")]);
			expect(md).toBe("- a\n- b\n");
		});
		it("survives non-object nodes and a non-array body", () => {
			expect(blocksToMarkdown([null, 5, "x", [], undefined, text("Keep")])).toBe("Keep\n");
			for (const body of [undefined, null, "x", 42, {}]) expect(blocksToMarkdown(body)).toBe("");
		});
		it("survives a node whose _type is not a string", () => {
			expect(blocksToMarkdown([{ _type: {} }, { _type: ["tabs"] }, { _type: "constructor" }, { _type: "__proto__" }, text("Keep")])).toBe("Keep\n");
		});
		it("survives tool entries that are not objects", () => {
			expect(around({ _type: "tool_grid", tools: [null, 4, "x", { name: 5, url: {} }, { name: "Kept", url: 5 }] })).toBe("Before\n\n- Kept\n\nAfter\n");
		});
		it("drops a node that throws and keeps the rest", () => {
			const boom = () => {
				throw new Error("boom");
			};
			expect(around({ _type: "tabs", get tabs() { return boom(); } })).toBe("Before\n\nAfter\n");
			expect(around({ _type: "block", get children() { return boom(); } })).toBe("Before\n\nAfter\n");
			expect(around({ get _type() { return boom(); } })).toBe("Before\n\nAfter\n");
			expect(around({ _type: "image", get asset() { return boom(); } })).toBe("Before\n\nAfter\n");
		});
	});

	// A hostile value must not cost more than its size: these took seconds before the regexes were made linear
	describe("cost stays linear in the size of the value", () => {
		const within = (ms, fn) => {
			const start = performance.now();
			const result = fn();
			expect(performance.now() - start).toBeLessThan(ms);
			return result;
		};
		it("handles a body with many unclosed link starts", () => {
			const md = within(1500, () => blocksToMarkdown([{ _type: "callout", body: "](/".repeat(40000) }], { origin: "https://www.web9.ai" }));
			expect(md.length).toBeGreaterThan(100000);
		});
		it("handles backtick runs that never close", () => {
			const body = Array.from({ length: 1200 }, (_, i) => "`".repeat(i + 1) + "a").join(" ");
			within(1500, () => blocksToMarkdown([{ _type: "callout", body }], { origin: "https://www.web9.ai" }));
		});
		it("handles a long run of whitespace in a table cell", () => {
			const cell = { content: [{ _type: "span", text: `a${" ".repeat(60000)}b` }] };
			within(1500, () => blocksToMarkdown([{ _type: "table", rows: [{ cells: [cell] }] }]));
		});
		it("handles code made of thousands of separate backtick runs", () => {
			const md = within(1500, () => blocksToMarkdown([{ _type: "code", code: "` ".repeat(300000) }]));
			expect(md.startsWith("```\n")).toBe(true);
		});
		it("handles a table with many link definitions and many cells", () => {
			const markDefs = Array.from({ length: 4000 }, (_, i) => ({ _key: `l${i}`, _type: "link", href: `/p${i}` }));
			const cells = Array.from({ length: 4000 }, (_, i) => ({ content: [{ _type: "span", text: `c${i}`, marks: [`l${i}`] }] }));
			const md = within(1500, () => blocksToMarkdown([{ _type: "table", markDefs, rows: [{ cells }] }], { origin: "https://www.web9.ai" }));
			expect(md).toContain("[c3999](https://www.web9.ai/p3999)");
		});
	});

	describe("table links", () => {
		it("takes link definitions from the table and from the cell, the table first", () => {
			const md = blocksToMarkdown([
				{
					_type: "table",
					markDefs: [{ _key: "t", _type: "link", href: "https://t.test/" }, { _key: "x", _type: "link", href: "https://table-wins.test/" }, { _key: "bad", _type: "link", href: "javascript:alert(1)" }],
					rows: [
						{ cells: [{ content: [{ _type: "span", text: "H" }] }, { content: [{ _type: "span", text: "H2" }] }, { content: [{ _type: "span", text: "H3" }] }] },
						{
							cells: [
								{ content: [{ _type: "span", text: "one", marks: ["t", "strong"] }] },
								{ markDefs: [{ _key: "c", _type: "link", href: "https://c.test/" }, { _key: "x", _type: "link", href: "https://cell-loses.test/" }], content: [{ _type: "span", text: "two", marks: ["c"] }, { _type: "span", text: "-x", marks: ["x"] }] },
								{ content: [{ _type: "span", text: "three", marks: ["bad"] }] },
							],
						},
					],
				},
			]);
			expect(md).toContain("| **[one](https://t.test/)** | [two](https://c.test/)[-x](https://table-wins.test/) | three |");
		});
	});

	describe("structure from hostile text", () => {
		it("keeps a callout tone and title on their own line", () => {
			const md = blocksToMarkdown([{ _type: "callout", tone: "info\n# Injected", title: "A\n# B", body: "x" }]);
			expect(md).toBe(":::info A # B\nx\n:::\n");
		});
		it("lengthens the fence when a mermaid diagram contains backticks", () => {
			const md = blocksToMarkdown([{ _type: "mermaid", code: "A\n```\n# not a heading" }]);
			expect(md).toBe("````mermaid\nA\n```\n# not a heading\n````\n");
		});
		it("never turns a backslash path or a protocol-relative url into an absolute link", () => {
			const md = blocksToMarkdown(
				[{ _type: "tool_grid", tools: [{ name: "a", url: "/\\evil.example" }, { name: "b", url: "//evil.example" }, { name: "c", url: "/ok" }] }],
				{ origin: "https://www.web9.ai" },
			);
			expect(md).toBe("- a\n- b\n- [c](https://www.web9.ai/ok)\n");
		});
	});

	describe("code", () => {
		const code = (c, language = "js") => ({ _type: "code", _key: "c", language, code: c });
		it("writes core code in a fence, with the language", () => {
			expect(blocksToMarkdown([code("let a = 1;")])).toBe("```js\nlet a = 1;\n```\n");
			expect(blocksToMarkdown([code("x", null)])).toBe("```\nx\n```\n");
		});
		it("lengthens the fence when the code contains a fence, so it cannot break out", () => {
			const md = blocksToMarkdown([text("Before"), code("a\n```\n# Injected heading\n```\nb", "md"), text("After")]);
			expect(md).toBe("Before\n\n````md\na\n```\n# Injected heading\n```\nb\n````\n\nAfter\n");
			expect(blocksToMarkdown([code("``````\nx", null)])).toBe("```````\n``````\nx\n```````\n");
		});
		it("keeps the code as written, indentation and blank lines included", () => {
			expect(blocksToMarkdown([code("  indented\n\n\tTabbed  ")])).toBe("```js\n  indented\n\n\tTabbed  \n```\n");
		});
		it("drops an unusable language and survives a code that is not a string", () => {
			expect(blocksToMarkdown([code("x", "js\n# Injected")])).toBe("```\nx\n```\n");
			expect(blocksToMarkdown([code({ a: 1 }), text("Keep")])).toBe("```js\n\n```\n\nKeep\n");
		});
		it("does not make a link inside code absolute, fenced or inline", () => {
			const md = blocksToMarkdown(
				[
					code("[a](/x)", "md"),
					{
						_type: "callout",
						body: "Link [b](/y), code `[c](/z)` and ``[d](/w)`` here.\n\n```\n[e](/v)\n```\n\n~~~md\n[f](/u)\n~~~\n\nAfter [g](/t)",
					},
					{ _type: "block", style: "normal", markDefs: [{ _key: "l", _type: "link", href: "/h" }], children: [{ _type: "span", text: "inline", marks: ["code", "l"] }, { _type: "span", text: " and `[i](/s)`" }] },
				],
				{ origin: "https://www.web9.ai" },
			);
			expect(md).toContain("```md\n[a](/x)\n```");
			expect(md).toContain("Link [b](https://www.web9.ai/y), code `[c](/z)` and ``[d](/w)`` here.");
			expect(md).toContain("```\n[e](/v)\n```");
			expect(md).toContain("~~~md\n[f](/u)\n~~~");
			expect(md).toContain("After [g](https://www.web9.ai/t)");
			expect(md).toContain("[`inline`](https://www.web9.ai/h) and `[i](/s)`");
		});
		it("makes links absolute again after a fence closes, and not inside an unclosed fence", () => {
			const md = blocksToMarkdown([{ _type: "callout", body: "````\n```\n[a](/x)\n```\n````\n[b](/y)\n\n```\n[c](/z)" }], { origin: "https://www.web9.ai" });
			expect(md).toContain("````\n```\n[a](/x)\n```\n````\n[b](https://www.web9.ai/y)");
			expect(md).toContain("```\n[c](/z)");
		});
	});

	describe("links and images in core text", () => {
		const link = (href, label = "go") => ({
			_type: "block",
			style: "normal",
			markDefs: [{ _key: "l", _type: "link", href }],
			children: [{ _type: "span", text: label, marks: ["l"] }],
		});
		it("keeps http, mailto, site-relative and hash links", () => {
			for (const href of ["https://x.test/a", "http://x.test", "mailto:a@b.test", "/docs/x", "#top", "http:x.test", "tel:+15551234567"]) {
				expect(blocksToMarkdown([link(href)])).toBe(`[go](${href})\n`);
			}
		});
		it("keeps the text but drops the link when the scheme is not safe", () => {
			for (const href of ["javascript:alert(1)", " JavaScript:alert(1)", "java\nscript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example", "/\\evil.example", "\\\\evil.example", " //evil.example", "\\/evil.example", "foo/bar", "?q=1", 5, null]) {
				expect(blocksToMarkdown([link(href)])).toBe("go\n");
			}
		});
		it("drops an image whose url is missing or not safe", () => {
			const img = (url) => ({ _type: "image", asset: { _ref: "r", url }, alt: "A" });
			expect(blocksToMarkdown([text("a"), img("javascript:alert(1)"), img(""), img(undefined), { _type: "image" }, img("https://x.test/i.png")])).toBe("a\n\n![A](https://x.test/i.png)\n");
		});
	});

	describe("embed", () => {
		const embed = (url) => blocksToMarkdown([{ _type: "embed", url }]);
		it("links the original YouTube and Vimeo url, never the nocookie or player one", () => {
			expect(embed("https://www.youtube.com/watch?v=xul4nDHvxgg")).toBe("[Video](https://www.youtube.com/watch?v=xul4nDHvxgg)\n");
			expect(embed("https://youtu.be/xul4nDHvxgg?t=30")).toBe("[Video](https://youtu.be/xul4nDHvxgg?t=30)\n");
			expect(embed("https://vimeo.com/123456789")).toBe("[Video](https://vimeo.com/123456789)\n");
			expect(embed("https://www.youtube.com/watch?v=xul4nDHvxgg")).not.toContain("nocookie");
		});
		it("drops an embed the site would not render as a player", () => {
			for (const url of ["https://example.com/video.mp4", "http://www.youtube.com/watch?v=xul4nDHvxgg", "javascript:alert(1)", "/watch", "", undefined, 5, {}]) {
				expect(embed(url)).toBe("");
			}
		});
		it("keeps link syntax in the url from closing the link", () => {
			expect(embed("https://youtu.be/xul4nDHvxgg?a=) [x](https://evil.example")).toBe("[Video](https://youtu.be/xul4nDHvxgg?a=%29%20[x]%28https://evil.example)\n");
		});
	});
});

describe("docToMarkdown", () => {
	it("writes the title, the description as a quote, then the body", () => {
		expect(docToMarkdown({ title: "T", description: "D", body: [text("Hi")] })).toBe("# T\n\n> D\n\nHi\n");
		expect(docToMarkdown({ title: "T", body: [text("Hi")] })).toBe("# T\n\nHi\n");
	});
	it("puts a multi-line title or description on one line and survives non-strings", () => {
		expect(docToMarkdown({ title: "A\n# B", description: "x\ny", body: [] })).toBe("# A # B\n\n> x y\n");
		for (const bad of [{}, 42, null, ["a"]]) expect(docToMarkdown({ title: bad, description: bad, body: [text("Hi")] })).toBe("Hi\n");
		expect(docToMarkdown(undefined)).toBe("");
	});
	it("makes relative links absolute", () => {
		expect(docToMarkdown({ title: "T", body: [{ _type: "callout", body: "[a](/docs/a)" }] }, { origin: "https://www.web9.ai" })).toContain("[a](https://www.web9.ai/docs/a)");
	});
});

describe("disclaimerFor", () => {
	it("gives the English text for en and the Chinese text for anything else, as on the old site", () => {
		expect(disclaimerFor("en")).toBe(DISCLAIMER.en);
		expect(disclaimerFor("zh")).toBe(DISCLAIMER.zh);
		for (const lang of [undefined, null, "fr", "constructor", "__proto__", {}, 7]) expect(disclaimerFor(lang)).toBe(DISCLAIMER.zh);
	});
});
