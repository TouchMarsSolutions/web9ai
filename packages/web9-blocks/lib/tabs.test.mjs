import { describe, expect, it } from "vitest";
import { activeTab, fullscreenLabel, tabItems } from "./tabs.mjs";

describe("tabItems", () => {
	it("keeps object tabs, with label and body as strings", () => {
		expect(tabItems({ tabs: [{ label: "A", body: "md" }, null, 5, [], { label: 7, body: { x: 1 } }, {}] })).toEqual([
			{ label: "A", body: "md" },
			{ label: "", body: "" },
			{ label: "", body: "" },
		]);
	});
	it("gives no tabs for a missing or non-array list", () => {
		for (const node of [undefined, null, {}, { tabs: "x" }, { tabs: { 0: {} } }]) expect(tabItems(node)).toEqual([]);
	});
});

describe("activeTab", () => {
	it("opens default_tab (1-based), clamped to the tabs there are", () => {
		expect(activeTab({ default_tab: 3 }, 6)).toBe(2);
		expect(activeTab({ default_tab: 1 }, 3)).toBe(0);
		expect(activeTab({ default_tab: 9 }, 3)).toBe(2);
		for (const default_tab of [0, -4]) expect(activeTab({ default_tab }, 3)).toBe(0);
		expect(activeTab({ default_tab: 2 }, 0)).toBe(0);
	});
	it("opens the first tab when default_tab is not an integer (a NaN index used to hide every panel)", () => {
		for (const default_tab of [undefined, null, "2", "x", 1.5, Number.NaN, Number.POSITIVE_INFINITY, true, {}, [2]]) {
			expect(activeTab({ default_tab }, 3), String(default_tab)).toBe(0);
		}
		for (const node of [undefined, null, {}]) expect(activeTab(node, 3)).toBe(0);
	});
});

describe("fullscreenLabel", () => {
	it("is in the page's language, en for any other", () => {
		expect(fullscreenLabel("zh-CN")).toBe("切换全屏");
		expect(fullscreenLabel("en")).toBe("Toggle fullscreen");
		for (const locale of [undefined, "fr", "constructor", "__proto__"]) expect(fullscreenLabel(locale), String(locale)).toBe("Toggle fullscreen");
	});
});
