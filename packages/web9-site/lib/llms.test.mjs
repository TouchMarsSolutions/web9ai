import { describe, expect, it } from "vitest";
import { buildLlmsTxt } from "./llms.mjs";

const doc = (slug, title, section, category, sort_order, description) => ({ data: { slug, title, section, category, sort_order, description } });
const entries = [
	doc("overview", "Overview", "dev", "general", 1001000),
	doc("guide", "Guide [new]", "ai", "usecase", 2001, "How to\nstart"),
	doc("intro", "Intro", "ai", "general", 1000, ""),
];
const site = new URL("https://www.web9.ai");

describe("buildLlmsTxt", () => {
	it("lists the docs per sidebar group with absolute .md links", () => {
		expect(buildLlmsTxt({ site, locale: "en", siteTitle: "Web9.AI", tagline: "square of web3 to the power of AI", entries })).toBe(
			[
				"# Web9.AI",
				"",
				"> square of web3 to the power of AI",
				"",
				"Knowledge base for AI and Dev. Each link is the Markdown version of a page, without site navigation.",
				"",
				"## AI",
				"",
				"- [Intro](https://www.web9.ai/docs/intro.md)",
				"",
				"## Use Case",
				"",
				"- [Guide \\[new\\]](https://www.web9.ai/docs/guide.md): How to start",
				"",
				"## Dev",
				"",
				"- [Overview](https://www.web9.ai/docs/overview.md)",
				"",
				"## Optional",
				"",
				"- [中文 llms.txt](https://www.web9.ai/zh-CN/llms.txt)",
				"- [Blog RSS](https://www.web9.ai/rss.xml)",
				"- [Sitemap](https://www.web9.ai/sitemap.xml)",
				"",
			].join("\n"),
		);
	});
	it("uses the locale prefix and zh-CN labels", () => {
		const txt = buildLlmsTxt({ site, locale: "zh-CN", siteTitle: "Web9.AI", tagline: "t", entries: [entries[1]] });
		expect(txt).toContain("## 神兵利器\n\n- [Guide \\[new\\]](https://www.web9.ai/zh-CN/docs/guide.md)");
		expect(txt).toContain("- [English llms.txt](https://www.web9.ai/llms.txt)");
		expect(txt).toContain("AI 与 Dev 知识库");
	});

	// Docs are published by AI agents without review: a malformed row must not take /llms.txt down (a throw is a 500)
	describe("hostile values", () => {
		const build = (rows) => buildLlmsTxt({ site, locale: "en", siteTitle: "Web9.AI", tagline: "t", entries: rows });
		const docsPart = (txt) => txt.slice(txt.indexOf("\n## ") + 1, txt.indexOf("## Optional"));

		it("survives a title, description, section, category or sort_order that is not what it should be", () => {
			const txt = build([
				doc("a", {}, {}, [1], "x", 42),
				doc("b", 42, null, 7, NaN, ["d"]),
				doc("c", "C", "constructor", "__proto__", 5, "x\n# y"),
			]);
			expect(docsPart(txt)).toBe(
				"## AI\n\n- [a](https://www.web9.ai/docs/a.md)\n- [b](https://www.web9.ai/docs/b.md)\n\n## __proto__\n\n- [C](https://www.web9.ai/docs/c.md): x # y\n\n",
			);
		});
		it("skips rows that cannot be linked", () => {
			const txt = build([null, 5, "x", [], {}, { data: null }, { data: [] }, doc({}, "T"), doc("", "T"), doc("\uD800", "Lone surrogate"), doc(undefined, "T"), doc("ok", "OK")]);
			expect(docsPart(txt)).toBe("## AI\n\n- [OK](https://www.web9.ai/docs/ok.md)\n\n");
		});
		it("encodes a slug into one path segment", () => {
			expect(build([doc("a b/c?d", "S")])).toContain("(https://www.web9.ai/docs/a%20b%2Fc%3Fd.md)");
		});
		it("keeps a group heading, title and description on one line each", () => {
			const txt = build([doc("x", "T\n## Injected", "evil\n# Heading", "general", 1, "d\n- [bad](https://evil.example)")]);
			expect(txt).toContain("## evil # Heading\n\n- [T ## Injected](https://www.web9.ai/docs/x.md): d - [bad](https://evil.example)");
			expect(txt.split("\n").filter((l) => l.startsWith("#"))).toEqual(["# Web9.AI", "## evil # Heading", "## Optional"]);
		});
		it("survives entries that are not an array", () => {
			for (const rows of [undefined, null, "x", 42, {}]) expect(build(rows)).toContain("## Optional");
		});
		it("survives a site title and tagline that are not strings", () => {
			expect(buildLlmsTxt({ site, locale: "en", siteTitle: {}, tagline: 5, entries: [] })).toContain("## Optional");
		});
	});
});
