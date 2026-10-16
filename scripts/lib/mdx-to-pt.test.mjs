import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertMdx, cssObjectToString, mdxToBlocks, parseTabs } from "./mdx-to-pt.mjs";

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
	it("keeps table, callout and tabs syntax inside a code fence as code", () => {
		const src = "# T\n\n```md\n| a | b |\n:::tip x\n<Tabs>\n```\n\nafter\n";
		const body = convertMdx(src, { path: "x/demo.mdx" }).data.body;
		expect(body.map((b) => b._type)).toEqual(["code", "block"]);
		expect(body[0].code).toBe("| a | b |\n:::tip x\n<Tabs>");
	});
	it("derives the slug from the file name without the numeric prefix", () => {
		expect(convertMdx("# T\n\nhello\n", { path: "a/b/01_hello_world.mdx" }).slug).toBe("hello_world");
	});
	it("converts the hot-tools page into the known block mix, tabs in values order", () => {
		// Copy of legacy/docs/ai/88-usecase/01_ai_hot_tools.mdx, kept so the test survives removing legacy/
		const src = readFileSync(new URL("./fixtures/01_ai_hot_tools.mdx", import.meta.url), "utf8");
		const path = "legacy/docs/ai/88-usecase/01_ai_hot_tools.mdx";
		const { slug, data } = convertMdx(src, { path, section: "ai", category: "usecase", order: 2002 });
		const count = (type) => data.body.filter((b) => b._type === type).length;
		expect(slug).toBe("ai-tools-adhoc");
		expect(data.title).toBe("Adhoc GenAI Tools");
		expect(data.body.filter((b) => b._type === "investment_warning").map((b) => b.lang)).toEqual(["zh", "zh"]);
		expect(JSON.stringify(convertMdx(src, { path }))).toBe(JSON.stringify(convertMdx(src, { path })));
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
	it("takes the title from frontmatter first and always drops the first H1", () => {
		const out = convertMdx("---\ntitle: Lambda Labs\n---\n# Lambda Labs GPU Cloud\n\nhello\n", { path: "a/05-lambda.mdx" });
		expect(out.data.title).toBe("Lambda Labs");
		expect(out.data.body.map((b) => b.style)).toEqual(["normal"]);
		expect(convertMdx("# Only H1\n\nx\n", { path: "a/b.mdx" }).data.title).toBe("Only H1");
	});
	it("takes the InvestmentWarning language from its import", () => {
		const warn = (file) => `import InvestmentWarning from '@site/src/components/invest/${file}';\n\n<InvestmentWarning />\n`;
		const lang = (src) => convertMdx(src, { path: "a/b.mdx" }).data.body[0].lang;
		expect(lang(warn("InvestmentWarning.mdx"))).toBe("en");
		expect(lang(warn("InvestmentWarning.cn.mdx"))).toBe("zh");
	});
	it("splits a 4-colon admonition and the callout nested in it into two callouts", () => {
		const src = "::::warning Problem:\n1. a\n2. b\n\n:::info Solution:\nx\n:::\n::::\n\nafter\n";
		const body = convertMdx(src, { path: "a/b.mdx" }).data.body;
		expect(body.map((b) => b._type)).toEqual(["callout", "callout", "block"]);
		expect(body[0]).toMatchObject({ tone: "warning", title: "Problem:", body: "1. a\n2. b" });
		expect(body[1]).toMatchObject({ tone: "info", title: "Solution:", body: "x" });
	});
	it("does not end a callout at a ::: line inside a code fence", () => {
		const src = ":::tip T\n```md\n:::\n```\nend\n:::\n";
		const body = convertMdx(src, { path: "a/b.mdx" }).data.body;
		expect(body).toHaveLength(1);
		expect(body[0].body).toBe("```md\n:::\n```\nend");
	});
	it("rewrites links in prose and in block bodies", () => {
		const rewriteHref = (href) => (href === "./qblock" ? "/docs/qblock" : href);
		const src = "See [q](./qblock) and [x](https://x.example).\n\n:::tip T\nAlso [q](./qblock).\n:::\n";
		const body = convertMdx(src, { path: "a/b.mdx", rewriteHref }).data.body;
		expect(body[0].markDefs.map((d) => d.href)).toEqual(["/docs/qblock", "https://x.example"]);
		expect(body[1].body).toBe("Also [q](/docs/qblock).");
	});
	it("gives every block, span and markDef a deterministic key unique within the doc", () => {
		const src = "# T\n\nA [l](/x) **b**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
		const keys = (v) => JSON.stringify(v).match(/"_key":"[^"]+"/g);
		const first = keys(mdxToBlocks(src, { path: "a/b.mdx" }).blocks);
		expect(keys(mdxToBlocks(src, { path: "a/b.mdx" }).blocks)).toEqual(first);
		expect(new Set(first).size).toBe(first.length);
		expect(keys(mdxToBlocks(src, { path: "a/other.mdx" }).blocks)).not.toEqual(first);
	});
});
