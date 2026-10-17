import { describe, expect, it } from "vitest";
import { activeMenuHref, homeLanguages, isExternalHref, linkRel, localizeHref, splitMenu } from "./nav.mjs";

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

describe("splitMenu", () => {
	it("puts absolute http(s) links on the right and everything else on the left, in menu order", () => {
		const items = [{ href: "/docs/intro" }, { href: "https://github.com/x" }, { href: "/posts" }, { href: "HTTP://example.com" }];
		const { internal, external } = splitMenu(items);
		expect(internal.map((i) => i.href)).toEqual(["/docs/intro", "/posts"]);
		expect(external.map((i) => i.href)).toEqual(["https://github.com/x", "HTTP://example.com"]);
	});
	it("counts only http and https as external", () => {
		for (const href of ["//cdn.example.com/x", "mailto:a@b.c", "/x", "", undefined, null]) expect(isExternalHref(href), String(href)).toBe(false);
	});
});

describe("activeMenuHref", () => {
	const items = [{ href: "/docs/intro" }, { href: "/docs/overview" }, { href: "/posts" }, { href: "https://github.com/x" }];
	const sectionOf = { intro: "ai", guide: "ai", overview: "dev", learn_ai_coding: "dev" };
	it("on a doc page, picks the item that links to a doc of the same section", () => {
		expect(activeMenuHref(items, "/docs/guide", { section: "ai", sectionOf })).toBe("/docs/intro");
		expect(activeMenuHref(items, "/docs/learn_ai_coding", { section: "dev", sectionOf })).toBe("/docs/overview");
	});
	it("reads zh-CN menu links", () => {
		const zh = [{ href: "/zh-CN/docs/intro" }, { href: "/zh-CN/docs/overview" }, { href: "/posts" }];
		expect(activeMenuHref(zh, "/zh-CN/docs/learn_ai_coding", { section: "dev", sectionOf })).toBe("/zh-CN/docs/overview");
	});
	it("highlights nothing on a doc page whose section no item links to", () => {
		expect(activeMenuHref(items, "/docs/x", { section: "other", sectionOf })).toBeUndefined();
		expect(activeMenuHref(items, "/docs/x", { section: "ai", sectionOf: {} })).toBeUndefined();
	});
	it("picks the /posts item on posts, tag and category pages", () => {
		for (const path of ["/posts", "/posts/", "/posts/hello", "/tag/ai", "/category/news"]) expect(activeMenuHref(items, path), path).toBe("/posts");
		expect(activeMenuHref(items, "/postscript")).toBeUndefined();
	});
	it("matches any other page by its exact path, ignoring a trailing slash", () => {
		expect(activeMenuHref([{ href: "/search" }], "/search/")).toBe("/search");
		expect(activeMenuHref(items, "/")).toBeUndefined();
	});
	it("never picks an external item or an item without a string href", () => {
		expect(activeMenuHref([{ href: "https://www.web9.ai/posts" }, { href: null }, {}], "/posts")).toBeUndefined();
	});
});

describe("homeLanguages", () => {
	it("links each locale's home page", () => {
		expect(homeLanguages()).toEqual([
			{ code: "en", label: "English", href: "/" },
			{ code: "zh-CN", label: "中文", href: "/zh-CN/" },
		]);
	});
});
