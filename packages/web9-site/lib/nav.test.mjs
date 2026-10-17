import { describe, expect, it } from "vitest";
import { linkRel, localizeHref } from "./nav.mjs";

describe("localizeHref", () => {
	it("leaves every link alone on en pages", () => {
		expect(localizeHref("/", "en")).toBe("/");
		expect(localizeHref("/docs/intro", "en")).toBe("/docs/intro");
	});
	it("prefixes the routes that exist in zh-CN", () => {
		expect(localizeHref("/", "zh-CN")).toBe("/zh-CN/");
		expect(localizeHref("/docs/intro", "zh-CN")).toBe("/zh-CN/docs/intro");
	});
	it("keeps links without a zh-CN route", () => {
		for (const href of ["/posts", "/tag/ai", "/search", "https://github.com/TouchMarsSolutions/web9ai", "#top", "/docsx"]) {
			expect(localizeHref(href, "zh-CN")).toBe(href);
		}
	});
});

describe("linkRel", () => {
	it("cuts the opener and the referrer for every link that sets a target, not only _blank", () => {
		for (const target of ["_blank", "_self", "_parent", "_top", "named", "x", "_BLANK", " "]) {
			expect(linkRel(target), JSON.stringify(target)).toBe("noopener noreferrer");
		}
	});
	it("adds nothing to a link without a target", () => {
		for (const target of [undefined, null, ""]) expect(linkRel(target), String(target)).toBeUndefined();
	});
});
