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
	it("drops url() smuggled past a newline", () => {
		expect(renderMarkdown('<div style="background: red\nurl(//evil.example/t.gif)">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="background: red&#10;url(//evil.example/t.gif)">x</div>')).toBe("<div>x</div>");
	});
	it("drops every function that can fetch or leak: image-set, cross-fade, src, attr, var", () => {
		for (const fn of ["image-set", "-webkit-image-set", "cross-fade", "src", "element", "paint"]) {
			expect(renderMarkdown(`<div style="background: ${fn}('//evil.example/t.gif' 1x)">x</div>`)).toBe("<div>x</div>");
		}
		expect(renderMarkdown('<div style="width: attr(data-w px)">x</div>')).toBe("<div>x</div>");
	});
	it("drops protocol-relative URLs", () => {
		expect(renderMarkdown('<div style="background: //evil.example/t.gif">x</div>')).toBe("<div>x</div>");
	});
	it("keeps rgb() and gradients, drops calc() and min()", () => {
		expect(renderMarkdown('<div style="color: rgb(10, 20, 30); background: radial-gradient(circle, rgba(255,255,255,.4), transparent)">x</div>')).toBe(
			'<div style="color:rgb(10, 20, 30);background:radial-gradient(circle, rgba(255,255,255,.4), transparent)">x</div>',
		);
		expect(renderMarkdown('<div style="width: calc(100% - 20px); max-width: min(100%, 600px)">x</div>')).toBe("<div>x</div>");
	});
	it("drops exponent lengths and calc() that would paint past the page", () => {
		expect(renderMarkdown('<div style="box-shadow:0 0 0 1e4px red;margin:calc(0px - 1e4px)">x</div>')).toBe("<div>x</div>");
	});
	it("drops full-page box-shadow spreads and viewport units", () => {
		expect(renderMarkdown('<div style="box-shadow: 0 0 0 9999px red">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="box-shadow: 0 0 0 100vmax #000">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="width: 100vw; color: red">x</div>')).toBe('<div style="color:red">x</div>');
		expect(renderMarkdown('<div style="box-shadow: 0 2px 8px rgba(0,0,0,0.2)">x</div>')).toBe('<div style="box-shadow:0 2px 8px rgba(0,0,0,0.2)">x</div>');
	});
	it("drops negative margins and absurd sizes", () => {
		expect(renderMarkdown('<div style="margin: -9999px 0 0 -9999px">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="margin: -1px">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="padding: 99999px; font-size: 9999px">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="margin: 0 auto; padding: 100px 20px">x</div>')).toBe('<div style="margin:0 auto;padding:100px 20px">x</div>');
	});
	it("drops upper-case property names (the whitelist is case-sensitive, so they fail closed)", () => {
		expect(renderMarkdown('<div style="POSITION: fixed; Background-Color: red; color: red">x</div>')).toBe('<div style="color:red">x</div>');
	});
	it("opens only external links in a new tab", () => {
		expect(renderMarkdown("[a](/docs/intro) [b](#top) [c](https://example.com)")).toBe(
			'<p><a href="/docs/intro">a</a> <a href="#top">b</a> <a href="https://example.com" rel="noopener noreferrer" target="_blank">c</a></p>\n',
		);
		expect(renderMarkdown('<a href="/docs/x" target="_top">t</a>')).toBe('<p><a href="/docs/x">t</a></p>\n');
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
