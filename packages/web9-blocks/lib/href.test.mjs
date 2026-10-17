import { isSafeHref } from "emdash";
import { describe, expect, it } from "vitest";
import { isSiteHref, safeHref } from "./href.mjs";

// [href, kind]: "site" stays on the site, "external" leaves it (new tab), "unsafe" is not rendered as a link.
const CASES = [
	["/docs/intro", "site"],
	["/", "site"],
	["/img/a.png?x=1#y", "site"],
	["#section", "site"],
	["https://example.com/a", "external"],
	["HTTP://EXAMPLE.COM", "external"],
	["http:evil.example", "external"], // a browser reads it as http://evil.example/
	["mailto:a@example.com", "external"],
	["tel:+15551234567", "external"],
	["/\\evil.example", "unsafe"], // a browser reads it as //evil.example
	["\\\\evil.example", "unsafe"],
	["//evil.example", "unsafe"],
	[" //evil.example", "unsafe"],
	["\\/evil.example", "unsafe"],
	["javascript:alert(1)", "unsafe"],
	["data:text/html,<script>alert(1)</script>", "unsafe"],
	["vbscript:x", "unsafe"],
	["/a\tb", "unsafe"],
	["https://exa\nmple.com", "unsafe"],
	["https://", "unsafe"],
	["foo/bar", "unsafe"],
	["./x", "unsafe"],
	["?q=1", "unsafe"],
	["", "unsafe"],
];
const kind = (href) => (!safeHref(href) ? "unsafe" : isSiteHref(href) ? "site" : "external");

describe("safeHref / isSiteHref", () => {
	it("sorts each form into site, external or unsafe", () => {
		expect(CASES.map(([href]) => [href, kind(href)])).toEqual(CASES);
	});
	it("returns the href unchanged when safe", () => {
		expect(safeHref("http:evil.example")).toBe("http:evil.example");
		expect(safeHref("/docs/intro")).toBe("/docs/intro");
	});
	it("treats a non-string as unsafe", () => {
		for (const v of [undefined, null, 5, ["/a"], { toString: () => "/a" }]) {
			expect(safeHref(v)).toBe("");
			expect(isSiteHref(v)).toBe(false);
		}
	});
	it("agrees with core's isSafeHref (emdash utils/url.ts) on every case", () => {
		expect(CASES.map(([href]) => [href, Boolean(safeHref(href))])).toEqual(CASES.map(([href]) => [href, isSafeHref(href)]));
	});
});
