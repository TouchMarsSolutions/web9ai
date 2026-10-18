import { describe, expect, it } from "vitest";
import { themeLabel, uiLabels } from "./ui-labels.mjs";

describe("uiLabels", () => {
	it("gives zh-CN pages the old site's zh-Hans names", () => {
		const zh = uiLabels("zh-CN");
		expect([zh.main, zh.breadcrumbs, zh.home, zh.docs, zh.onThisPage]).toEqual(["主导航", "页面路径", "主页面", "文档侧边栏", "本页目录"]);
		expect(zh.headingLink("函数")).toBe("函数的直接链接");
		expect(zh.currentLanguage("简体中文")).toBe("语言：简体中文");
	});
	it("keeps the en names the check-page markers look for", () => {
		const en = uiLabels("en");
		expect([en.main, en.menu, en.breadcrumbs, en.home, en.docs, en.onThisPage]).toEqual(["Main", "Menu", "Breadcrumbs", "Home", "Docs", "On this page"]);
		expect(en.headingLink("What NOT ?")).toBe("Direct link to What NOT ?");
	});
	it("has the same names in every locale", () => {
		expect(Object.keys(uiLabels("zh-CN")).sort()).toEqual(Object.keys(uiLabels("en")).sort());
		expect(Object.keys(uiLabels("zh-CN").themeNames).sort()).toEqual(Object.keys(uiLabels("en").themeNames).sort());
	});
	it("reads en for any other locale, Object.prototype names included", () => {
		for (const locale of ["fr", "", undefined, "constructor", "__proto__", "toString"]) expect(uiLabels(locale), String(locale)).toBe(uiLabels("en"));
	});
});

describe("themeLabel", () => {
	it("names the current theme and the next one in the page's language", () => {
		expect(themeLabel("en", "light", "dark")).toBe("Theme: light. Switch to dark");
		expect(themeLabel("zh-CN", "dark", "system")).toBe("主题：暗黑模式，切换到跟随系统");
		expect(themeLabel("de", "system", "light")).toBe("Theme: system. Switch to light");
	});
});
