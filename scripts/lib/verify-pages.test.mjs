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
	it("checks for the web9 embed player and for no output of core's htmlBlock or embed renderer", () => {
		const page = (locale, slug, title, body) => ({ doc: { locale, slug }, want: { data: { title, body } } });
		const video = { _type: "embed", _key: "v", url: "https://www.youtube.com/watch?v=LslC2nKEEGU&t=644s" };
		const other = { _type: "embed", _key: "o", url: "https://example.com/talk.mp4" };
		const player = 'src="https://www.youtube-nocookie.com/embed/LslC2nKEEGU?start=644"';
		const checks = docPageChecks([page("en", "guide", "Guide", [video, other]), page("en", "intro", "Intro", [])]);
		expect(checks.map((c) => [c.url, c.present])).toEqual([
			["/docs/guide", [">Guide</h1>", player]],
			["/zh-CN/docs/guide", [">Guide</h1>", FALLBACK_NOTICE, player]],
			["/docs/intro", [">Intro</h1>"]],
			["/zh-CN/docs/intro", [">Intro</h1>", FALLBACK_NOTICE]],
		]);
		for (const c of checks) expect(c.absent).toEqual(expect.arrayContaining(['class="emdash-html-block', '<figure class="emdash-embed']));
	});
	it("escapes like Astro", () => {
		expect(escapeHtml(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&#39;");
	});
});
