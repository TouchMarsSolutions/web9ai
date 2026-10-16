import { describe, expect, it } from "vitest";
import { renderInlineMarkdown, renderMarkdown, safeTone } from "./markdown.mjs";

describe("renderMarkdown sanitizer", () => {
	it("keeps cosmetic inline styles, gradients included", () => {
		expect(
			renderMarkdown('<div style="background: linear-gradient(135deg, #9400D3, #4B0082); padding: 20px; color: #E6E6FA">ok</div>'),
		).toBe('<div style="background:linear-gradient(135deg, #9400D3, #4B0082);padding:20px;color:#E6E6FA">ok</div>');
	});
	it("drops positioning so content cannot overlay the page", () => {
		expect(renderMarkdown('<div style="position: fixed; inset: 0; z-index: 9999; background: red">x</div>')).toBe(
			'<div style="background:red">x</div>',
		);
	});
	it("strips Tailwind utility classes that would build an overlay", () => {
		expect(renderMarkdown('<div class="fixed inset-0 z-50 bg-black">x</div>')).toBe("<div>x</div>");
	});
	it("drops url() and CSS escapes", () => {
		expect(renderMarkdown('<div style="background: url(https://evil.example/t.gif)">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="background: u\\72l(https://evil.example)">x</div>')).toBe("<div>x</div>");
	});
	it("removes scripts, event handlers and javascript: links", () => {
		expect(renderMarkdown("<img src=x onerror=alert(1)><script>alert(1)</script>")).toBe('<p><img src="x" /></p>\n');
		expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("javascript:");
	});
	it("forces rel/target on links", () => {
		expect(renderMarkdown("[ok](https://example.com)")).toBe(
			'<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">ok</a></p>\n',
		);
	});
	it("drops arbitrary class and id attributes", () => {
		expect(renderMarkdown('<div class="w9-tabs" id="evil">x</div>')).toBe("<div>x</div>");
	});
	it("renders :::tone admonitions as whitelisted callout markup", () => {
		expect(renderMarkdown(":::tip Title\nbody **bold**\n:::")).toBe(
			'<aside class="callout callout--tip"><p class="callout__title">Title</p><p>body <strong>bold</strong></p>\n</aside>',
		);
	});
	it("renders mermaid fences as escaped <pre class=mermaid>", () => {
		expect(renderMarkdown("```mermaid\ngraph TD; A-->B\n```")).toBe('<pre class="mermaid">graph TD; A--&gt;B</pre>');
	});
	it("keeps language-* classes on code blocks", () => {
		expect(renderMarkdown("```js\nconst a = 1;\n```")).toContain('<code class="language-js">');
	});
	it("sanitizes inline markdown too", () => {
		expect(renderInlineMarkdown('<b onclick="x()">hi</b>')).toBe("<b>hi</b>");
	});
});

describe("safeTone", () => {
	it("passes known tones through", () => {
		expect(safeTone("danger")).toBe("danger");
	});
	it("refuses anything else, so block data cannot inject classes", () => {
		expect(safeTone("x fixed inset-0 z-50")).toBe("info");
		expect(safeTone(undefined)).toBe("info");
	});
});
