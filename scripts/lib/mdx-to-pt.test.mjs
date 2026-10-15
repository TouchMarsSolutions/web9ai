import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertMdx, cssObjectToString, parseTabs } from "./mdx-to-pt.mjs";

describe("cssObjectToString", () => {
	it("keeps commas inside CSS functions", () => {
		const obj = `background: 'linear-gradient(135deg, rgba(148, 0, 211, 0.9), #4B0082)', padding: '20px', borderRadius: '8px'`;
		expect(cssObjectToString(obj)).toBe(
			"background: linear-gradient(135deg, rgba(148, 0, 211, 0.9), #4B0082); padding: 20px; border-radius: 8px",
		);
	});
	it("handles multi-line objects with a trailing comma", () => {
		expect(cssObjectToString(`\n  color: '#E6E6FA',\n  fontWeight: 'bold',\n`)).toBe("color: #E6E6FA; font-weight: bold");
	});
});

const TABS = `<Tabs defaultValue="b" values={[
  { label: 'Alpha', value: 'a' },
  { label: "Beta", value: "b" },
]}>
<TabItem value="b">

Beta body

</TabItem>
<TabItem value="a">

Alpha body

</TabItem>
</Tabs>`;

describe("parseTabs", () => {
	it("orders tabs by the values array, not by TabItem source order", () => {
		const { tabs, defaultIndex } = parseTabs(TABS);
		expect(tabs.map((t) => t.label)).toEqual(["Alpha", "Beta"]);
		expect(tabs[0].content).toContain("Alpha body");
		expect(defaultIndex).toBe(1);
	});
});

describe("convertMdx", () => {
	it("emits tabs in values order with a 1-based default_tab", () => {
		const tabs = convertMdx(TABS, { path: "x/demo.mdx" }).data.body.find((b) => b._type === "tabs");
		expect(tabs.tabs.map((t) => t.label)).toEqual(["Alpha", "Beta"]);
		expect(tabs.default_tab).toBe(2);
	});
	it("converts JSX style objects without cutting gradients", () => {
		const src = ":::tip Styled\n<div style={{background: 'linear-gradient(90deg, #fff, #000)', padding: '8px'}}>x</div>\n:::\n";
		const callout = convertMdx(src, { path: "x/demo.mdx" }).data.body[0];
		expect(callout.body).toContain('style="background: linear-gradient(90deg, #fff, #000); padding: 8px"');
	});
	it("keeps /img paths site-relative by default", () => {
		const src = "import logo from '/img/logo.png';\n\n:::note Logo\n<Image img={logo} />\n:::\n";
		expect(convertMdx(src, { path: "x/demo.mdx" }).data.body[0].body).toContain("![logo](/img/logo.png)");
	});
	it("derives the slug from the file name without the numeric prefix", () => {
		expect(convertMdx("# T\n\nhello\n", { path: "a/b/01_hello_world.mdx" }).slug).toBe("hello_world");
	});
	it("converts the hot-tools page into the known block mix, tabs in values order", () => {
		const path = "legacy/docs/ai/88-usecase/01_ai_hot_tools.mdx";
		const { slug, data } = convertMdx(readFileSync(path, "utf8"), { path, section: "ai", category: "usecase", order: 1 });
		const count = (type) => data.body.filter((b) => b._type === type).length;
		expect(slug).toBe("ai-tools-adhoc");
		expect(data.body).toHaveLength(51);
		expect({
			callout: count("callout"), tool_grid: count("tool_grid"), details: count("details"), tabs: count("tabs"),
			table: count("table"), mermaid: count("mermaid"), investment_warning: count("investment_warning"),
		}).toEqual({ callout: 9, tool_grid: 8, details: 5, tabs: 1, table: 1, mermaid: 1, investment_warning: 2 });
		const tabs = data.body.find((b) => b._type === "tabs");
		expect(tabs.tabs.map((t) => t.label)).toEqual(["为啥学AI", "概念强化", "大模型", "LLM使用心法", "幻相", "神通"]);
		expect(tabs.default_tab).toBe(3);
		expect(JSON.stringify(data.body)).not.toContain("https://www.web9.ai/img/");
	});
});
