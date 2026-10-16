import { describe, expect, it } from "vitest";
import { FALLBACK_NOTICE, docPageChecks, escapeHtml } from "./verify-pages.mjs";

const payload = (locale, slug, title) => ({ doc: { locale, slug }, want: { data: { title } } });

describe("docPageChecks", () => {
	it("checks en pages, zh-CN translations and zh-CN fallbacks", () => {
		const checks = docPageChecks([payload("en", "intro", "Intro"), payload("en", "llm", "LLM & Co"), payload("zh-CN", "intro", "入门介绍")]);
		expect(checks.map((c) => [c.url, c.present])).toEqual([
			["/docs/intro", [">Intro</h1>"]],
			["/zh-CN/docs/intro", [">入门介绍</h1>"]],
			["/docs/llm", [">LLM &amp; Co</h1>"]],
			["/zh-CN/docs/llm", [">LLM &amp; Co</h1>", FALLBACK_NOTICE]],
		]);
		expect(checks[1].absent).toContain(FALLBACK_NOTICE);
		expect(checks[0].absent).toContain("ec:block");
	});
	it("escapes like Astro", () => {
		expect(escapeHtml(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&#39;");
	});
});
