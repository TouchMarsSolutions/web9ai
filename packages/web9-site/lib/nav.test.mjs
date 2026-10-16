import { describe, expect, it } from "vitest";
import { localizeHref } from "./nav.mjs";

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
