import { describe, expect, it } from "vitest";
import { sanitizeHtmlFragment } from "./html.mjs";

describe("sanitizeHtmlFragment", () => {
	it("drops class, id, data-* and style", () => {
		expect(sanitizeHtmlFragment('<div class="fixed inset-0 z-50" id="x" data-a="1" style="position:fixed;inset:0">overlay</div>')).toBe("<div>overlay</div>");
	});
	it("cannot forge Astro-scoped component selectors", () => {
		expect(sanitizeHtmlFragment('<img class="emdash-cover__background" data-astro-cid-g6rigryn src="https://evil.example/x.png">')).toBe('<img src="https://evil.example/x.png" />');
	});
	it("drops the hooks web9 client scripts query for", () => {
		expect(sanitizeHtmlFragment("<div data-w9-tabs data-fs>x</div>")).toBe("<div>x</div>");
	});
	it("removes style, script, svg, form and button elements", () => {
		expect(sanitizeHtmlFragment("<style>.x{position:fixed}</style><script>alert(1)</script><svg onload=alert(1)></svg><form action=/x><input></form><button>b</button>")).toBe("b");
	});
	it("drops iframes", () => {
		expect(sanitizeHtmlFragment('<iframe src="https://www.youtube.com/embed/abc" width="560"></iframe>')).toBe("");
	});
	it("strips javascript: and protocol-relative hrefs, forces rel/target", () => {
		expect(sanitizeHtmlFragment('<a href="//evil.example">p</a>')).toBe('<a rel="noopener noreferrer" target="_blank">p</a>');
		expect(sanitizeHtmlFragment('<a href="javascript:alert(1)">j</a>')).toBe('<a rel="noopener noreferrer" target="_blank">j</a>');
	});
	it("does not run markdown over HTML", () => {
		expect(sanitizeHtmlFragment("<p>2*3*4 and a_b_c</p>")).toBe("<p>2*3*4 and a_b_c</p>");
		expect(sanitizeHtmlFragment("<div>\n\n    <span>x</span>\n\n</div>")).toBe("<div>\n\n    <span>x</span>\n\n</div>");
	});
	it("returns an empty string for non-strings", () => {
		expect(sanitizeHtmlFragment(undefined)).toBe("");
		expect(sanitizeHtmlFragment(null)).toBe("");
	});
});
