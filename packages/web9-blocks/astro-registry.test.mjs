import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOCKS } from "./index.mjs";

// vitest has no Astro plugin, so check the module's source instead of importing the .astro files.
// This file lives outside astro/ on purpose: Tailwind scans that folder (CLAUDE.md: never point @source at tests).
const source = readFileSync(new URL("./astro/index.mjs", import.meta.url), "utf8");

describe("astro/index.mjs registry", () => {
	it("maps htmlBlock and embed to the web9 components, not core's", () => {
		expect(source).toMatch(/import HtmlBlock from "\.\/HtmlBlock\.astro";/);
		expect(source).toMatch(/import Embed from "\.\/Embed\.astro";/);
		expect(source).toMatch(/^\thtmlBlock: HtmlBlock,$/m);
		expect(source).toMatch(/^\tembed: Embed,$/m);
	});
	it("registers a renderer for every block type the plugin defines", () => {
		for (const { type } of BLOCKS) expect(source).toMatch(new RegExp(`^\\t${type}: \\w+,$`, "m"));
	});
	it("exports SafeWidgetArea", () => {
		expect(source).toMatch(/export \{ default as SafeWidgetArea \} from "\.\/SafeWidgetArea\.astro";/);
	});
});

describe("Tabs and ToolGrid", () => {
	const component = (name) => readFileSync(new URL(`./astro/${name}`, import.meta.url), "utf8");
	it("render the lists tabItems and toolItems give (a null item or a number tagline used to throw)", () => {
		const tabs = component("Tabs.astro");
		expect(tabs).toMatch(/^import \{ activeTab, tabItems \} from "\.\.\/lib\/tabs\.mjs";$/m);
		expect(tabs).toContain("const tabs = tabItems(node);");
		// the open tab comes from activeTab only (a non-integer default_tab used to give a NaN index that hid every panel)
		expect(tabs).toContain("const active = activeTab(node, tabs.length);");
		expect(tabs).not.toMatch(/node\?\.default_tab/);
		const grid = component("ToolGrid.astro");
		expect(grid).toMatch(/^import \{ logoSize, toolItems \} from "\.\.\/lib\/tool-grid\.mjs";$/m);
		expect(grid).toContain("const tools = toolItems(node);");
		for (const source of [tabs, grid]) expect(source).not.toMatch(/Array\.isArray\(node\?\.(tabs|tools)\)/);
	});
});
