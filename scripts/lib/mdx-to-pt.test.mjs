import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertMdx, cssObjectToString, fnv1a, mdxToBlocks, parseTabs } from "./mdx-to-pt.mjs";

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
		const plain = convertMdx("# Only H1\n\nx\n", { path: "a/b.mdx" });
		expect(plain.data.title).toBe("Only H1");
		expect(plain.data.body).toHaveLength(1); // a plain H1 leaves nothing behind
	});
	it("keeps the link of the dropped first H1 as a normal paragraph", () => {
		const rewriteHref = (href) => (href === "./lat" ? "/docs/lat" : href);
		const out = convertMdx("# [Latitude](https://www.latitude.sh/r/C4FC3EA5)\n\nhello\n", { path: "a/08-latitude.mdx" });
		expect(out.data.title).toBe("Latitude");
		expect(out.data.body).toHaveLength(2);
		const [first, second] = out.data.body;
		expect(first).toMatchObject({ _type: "block", style: "normal" });
		expect(first.children.map((c) => c.text).join("")).toBe("Latitude");
		expect(first.markDefs.map((d) => d.href)).toEqual(["https://www.latitude.sh/r/C4FC3EA5"]);
		expect(first.children[0].marks).toEqual([first.markDefs[0]._key]);
		expect(second.children[0].text).toBe("hello");
		// the frontmatter title wins; the link is still kept and goes through rewriteHref
		const fm = convertMdx("---\ntitle: Lat Labs\n---\n# [Latitude](./lat)\n", { path: "a/b.mdx", rewriteHref });
		expect(fm.data.title).toBe("Lat Labs");
		expect(fm.data.body.map((b) => b.style)).toEqual(["normal"]);
		expect(fm.data.body[0].markDefs.map((d) => d.href)).toEqual(["/docs/lat"]);
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
	it("rewrites href attributes in block bodies", () => {
		const rewriteHref = (href) => (href === "./qblock" ? "/docs/qblock" : href);
		const src = ':::tip T\nSee <a href="./qblock">q</a> and <a href="https://x.example">x</a>.\n:::\n';
		const { body } = convertMdx(src, { path: "a/b.mdx", rewriteHref }).data.body[0];
		expect(body).toBe('See <a href="/docs/qblock">q</a> and <a href="https://x.example">x</a>.');
	});
	it("does not rewrite links inside fenced code, inline code or mermaid", () => {
		const rewriteHref = () => "/rewritten";
		const src = [
			"See [a](./a) and `](./x)` here.",
			"",
			"```md",
			'See [x](./x) <a href="./h">',
			"```",
			"",
			":::tip T",
			"~~~",
			"[y](./y)",
			"~~~",
			"[z](./z) `[w](./w)`",
			":::",
			"",
			"```mermaid",
			"A[x](./m) --> B",
			"```",
		].join("\n");
		const body = convertMdx(src, { path: "a/b.mdx", rewriteHref }).data.body;
		expect(body.map((b) => b._type)).toEqual(["block", "code", "callout", "mermaid"]);
		expect(body[0].markDefs.map((d) => d.href)).toEqual(["/rewritten"]);
		expect(body[0].children.find((c) => c.marks.includes("code")).text).toBe("](./x)");
		expect(body[1].code).toBe('See [x](./x) <a href="./h">');
		expect(body[2].body).toBe("~~~\n[y](./y)\n~~~\n[z](/rewritten) `[w](./w)`");
		expect(body[3].code).toBe("A[x](./m) --> B");
	});
	it("gives every block, span and markDef a deterministic key unique within the doc", () => {
		const src = "# T\n\nA [l](/x) **b**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
		const keys = (v) => JSON.stringify(v).match(/"_key":"[^"]+"/g);
		const first = keys(mdxToBlocks(src, { path: "a/b.mdx" }).blocks);
		expect(keys(mdxToBlocks(src, { path: "a/b.mdx" }).blocks)).toEqual(first);
		expect(new Set(first).size).toBe(first.length);
		expect(keys(mdxToBlocks(src, { path: "a/other.mdx" }).blocks)).not.toEqual(first);
	});
	it("pins the fnv1a hash and the key format", () => {
		// 32-bit FNV-1a test vectors
		expect(fnv1a("")).toBe(0x811c9dc5);
		expect(fnv1a("a")).toBe(0xe40c292c);
		expect(fnv1a("foobar")).toBe(0xbf9cf968);
		// k<n base36><last 4 base36 digits of fnv1a("<slug>:<n>")>: the span is key 0, its block key 1
		const [block] = mdxToBlocks("hello\n", { path: "a/b.mdx" }).blocks;
		expect([block.children[0]._key, block._key]).toEqual(["k0d4av", "k1dilw"]);
		const other = mdxToBlocks("hello\n", { path: "a/b.mdx", slug: "other" });
		expect(other.slug).toBe("other");
		expect([other.blocks[0].children[0]._key, other.blocks[0]._key]).toEqual(["k060pj", "k16f0k"]);
	});
	it("uses the lang option only when the file imports no InvestmentWarning", () => {
		const bare = "<InvestmentWarning />\n";
		const lang = (src, options) => convertMdx(src, { path: "a/b.mdx", ...options }).data.body[0].lang;
		expect(lang(bare)).toBe("en");
		expect(lang(bare, { lang: "zh" })).toBe("zh");
		expect(lang(`import InvestmentWarning from '@site/x/InvestmentWarning.mdx';\n\n${bare}`, { lang: "zh" })).toBe("en");
	});
});

describe("convertMdx: legacy JSX (Task 7)", () => {
	const body = (src) => convertMdx(src, { path: "a/b.mdx" }).data.body;
	const shape = (blocks) => blocks.map((b) => (b._type === "block" ? `${b.listItem ?? b.style}:${b.children.map((c) => c.text).join("").trim()}` : b._type));
	it("turns prose images into image blocks after their text block", () => {
		const src = "import logo from '/img/logo.png';\nimport ASvg from '/img/a.svg';\n\nText ![x](/img/x.png) more\n\n<Image img={logo} />\n\n<ASvg width={100} />\n";
		const blocks = body(src);
		expect(shape(blocks)).toEqual(["normal:Text  more", "image", "image", "image"]);
		expect(blocks.filter((b) => b._type === "image").map((b) => b.asset.url)).toEqual(["/img/x.png", "/img/logo.png", "/img/a.svg"]);
		expect(blocks[1]).toMatchObject({ asset: { _ref: "", url: "/img/x.png" }, alt: "x" });
	});
	it("keeps the image out of a styled wrapper div", () => {
		const src = "import PosterSvg from '/img/p.svg';\n\n<div style={{textAlign: 'center'}}>\n  <PosterSvg style={{maxWidth: '100%'}}/>\n</div>\n";
		expect(body(src)).toMatchObject([{ _type: "image", asset: { url: "/img/p.svg" }, alt: "PosterSvg" }]);
	});
	it("turns YouTube into an embed in prose and a link inside a block body", () => {
		const src = [
			'<YouTube youTubeId="SKS-URw9a18" />',
			"",
			"- item one",
			'      <YouTube youTubeId="LslC2nKEEGU" />',
			"- item two",
			"",
			":::tip T",
			'<YouTube youTubeId="trXPfpV5iRQ" />',
			":::",
		].join("\n");
		const blocks = body(src);
		expect(shape(blocks)).toEqual(["embed", "bullet:item one", "embed", "bullet:item two", "callout"]);
		expect(blocks[0].url).toBe("https://www.youtube.com/watch?v=SKS-URw9a18");
		expect(blocks[4].body).toBe("[YouTube](https://www.youtube.com/watch?v=trXPfpV5iRQ)");
	});
	it("moves an admonition inside a list item to a callout after the item, numbering continues", () => {
		const blocks = body("1. Copilot\n   :::tip\n   Future\n   :::\n2. Cursor\n");
		expect(shape(blocks)).toEqual(["number:Copilot", "callout", "number:Cursor"]);
		expect(blocks[1]).toMatchObject({ tone: "tip", body: "Future" });
		expect([blocks[0].listStart, blocks[2].listStart]).toEqual([1, 2]);
		expect(blocks[0].listId).toBe(blocks[2].listId);
	});
	it("flattens Tabs inside details into bold labels and code fences", () => {
		const src = [
			"<details>",
			"<summary>Code</summary>",
			"  <Tabs>",
			'    <TabItem value="java" label="Java">',
			"    ```java",
			"    class A {}",
			"    ```",
			"    </TabItem>",
			'    <TabItem value="py" label="Python">',
			"    ```python",
			"    a = 1",
			"    ```",
			"    </TabItem>",
			"  </Tabs>",
			"</details>",
		].join("\n");
		const [details] = body(src);
		expect(details).toMatchObject({ _type: "details", summary: "Code" });
		expect(details.body).toBe("**Java**\n\n```java\nclass A {}\n```\n\n**Python**\n\n```python\na = 1\n```");
	});
	it("turns the tools gallery into one tool_grid per category and drops its style", () => {
		const src = [
			"import Zapier from '/img/zapier/zapier_apps.png';",
			"",
			'<div className="tools-gallery">',
			'  <div className="tool-category">',
			"    <h3>AI Agents</h3>",
			'    <a href="https://zapier.com/" target="_blank" title="Workflow Automation">',
			'      <Image img={Zapier} className="tool-image" />',
			"      <span>Zapier</span>",
			"    </a>",
			"  </div>",
			"</div>",
			"",
			"<style>",
			"{`",
			"  .tools-gallery { margin-top: 2rem; }",
			"`}",
			"</style>",
		].join("\n");
		expect(body(src)).toMatchObject([
			{ _type: "tool_grid", title: "AI Agents", logo_size: 100, tools: [{ name: "Zapier", logo: "/img/zapier/zapier_apps.png", tagline: "Workflow Automation" }] },
		]);
	});
	it("fails on raw HTML it has no rule for", () => {
		expect(() => body('<iframe src="https://x.example"></iframe>\n')).toThrow(/unsupported HTML in prose/);
	});
	it("drops the line break left behind by an image, video or callout moved out of its block", () => {
		// a trailing "\n" in a span renders as <br> (@portabletext/toolkit splits span text at newlines)
		const src = "- Full Features\n  ![Full](/img/f.png)\n- Clip\n      <YouTube youTubeId=\"LslC2nKEEGU\" />\n\n1. Copilot \n   :::tip\n   Future\n   :::\n2. Cursor\n";
		const blocks = body(src);
		expect(blocks.map((b) => b._type)).toEqual(["block", "image", "block", "embed", "block", "callout", "block"]);
		expect(blocks.filter((b) => b._type === "block").map((b) => b.children.map((c) => c.text).join(""))).toEqual(["Full Features", "Clip", "Copilot", "Cursor"]);
	});
	it("puts an image from a text-only table cell right after the table", () => {
		expect(shape(body("| a | b |\n|---|---|\n| ![x](/img/x.png) | y |\n"))).toEqual(["table", "image"]);
		expect(shape(body("| a | b |\n|---|---|\n| ![x](/img/x.png) | y |\n\nafter\n"))).toEqual(["table", "image", "normal:after"]);
	});
});

describe("convertMdx: list items keep their code, details and HTML (Task 7 fix round 1)", () => {
	const body = (src) => convertMdx(src, { path: "a/b.mdx" }).data.body;
	const shape = (blocks) => blocks.map((b) => (b._type === "block" ? `${b.listItem ?? b.style}:${b.children.map((c) => c.text).join("").trim()}` : b._type));
	it("emits a fenced code block inside a list item as a code block after the item, numbering continues", () => {
		const src = "1. Define `cog.yaml`\n    ```yaml\n    build:\n        gpu: true\n    ```\n2. Push\n    ```bash\n    cog push    \n    ```\n- Run it\n    ```python\n    def sum(a, b):\n        return a + b\n    ```\n";
		const blocks = body(src);
		expect(shape(blocks)).toEqual(["number:Define cog.yaml", "code", "number:Push", "code", "bullet:Run it", "code"]);
		expect(blocks.filter((b) => b._type === "code").map((b) => [b.language, b.code])).toEqual([
			["yaml", "build:\n    gpu: true"],
			["bash", "cog push    "],
			["python", "def sum(a, b):\n    return a + b"],
		]);
		expect([blocks[0].listStart, blocks[2].listStart]).toEqual([1, 2]);
		expect(blocks[2].listId).toBe(blocks[0].listId);
	});
	it("emits a details element inside a list item as the same details block as at top level, after the item", () => {
		const details = "<details>\n    <summary>Preloaded Models</summary>\n    - [openjourney](https://civitai.com/models/86/openjourney)\n    - [deliberate](https://civitai.com/models/4823/deliberate)\n</details>";
		const listed = body(`- [Invoke AI](https://invoke-ai.github.io/InvokeAI/)\n- ${details.replace(/\n/g, "\n  ")}\n\nafter\n`);
		expect(shape(listed)).toEqual(["bullet:Invoke AI", "details", "normal:after"]);
		const top = body(`${details}\n`)[0];
		expect(listed[1]).toEqual({ ...top, _key: listed[1]._key });
		expect(top).toMatchObject({ summary: "Preloaded Models", body: "- [openjourney](https://civitai.com/models/86/openjourney)\n- [deliberate](https://civitai.com/models/4823/deliberate)" });
	});
	it("applies the top-level HTML rules to HTML inside a list item", () => {
		expect(shape(body('- Poster\n\n  <div style={{textAlign: "center"}}>\n    <img src="/img/p.svg" alt="P">\n  </div>\n'))).toEqual(["bullet:Poster", "image"]);
		expect(() => body('- Map\n\n  <iframe src="https://maps.example/embed"></iframe>\n')).toThrow(/unsupported HTML in prose: <iframe src="https:\/\/maps\.example/);
		expect(() => body("- Note\n\n  <section>x</section>\n")).toThrow(/unsupported HTML in prose: <section>/);
	});
	it("drops a bilibili player whose video the list item or the next block already links to", () => {
		const player = '<iframe src="//player.bilibili.com/player.html?aid=271160091&bvid=BV1Cc411P7rs&cid=1131288245&page=1" scrolling="no" allowfullscreen="true"></iframe>';
		const inItem = body(`- [B站手把手视频讲解](https://www.bilibili.com/video/BV1Cc411P7rs/?share_source=copy_web):\n\n  ${player}\n- next\n`);
		expect(shape(inItem)).toEqual(["bullet:B站手把手视频讲解:", "bullet:next"]);
		expect(JSON.stringify(inItem)).not.toContain("player.bilibili.com");
		const nextBlock = body(`${player}\n\n[B站](https://www.bilibili.com/video/BV1Cc411P7rs/)\n`);
		expect(shape(nextBlock)).toEqual(["normal:B站"]);
	});
	it("links to the bilibili player when nothing nearby links to its video", () => {
		const blocks = body('- Clip\n\n  <iframe src="//player.bilibili.com/player.html?aid=1&bvid=BV1Fg4y1c7qy&page=1"> </iframe>\n');
		expect(shape(blocks)).toEqual(["bullet:Clip", "normal:Bilibili"]);
		expect(blocks[1].markDefs.map((d) => d.href)).toEqual(["https://player.bilibili.com/player.html?aid=1&bvid=BV1Fg4y1c7qy&page=1"]);
		expect(JSON.stringify(blocks)).not.toContain("iframe");
	});
	it("fails on inline raw HTML other than img and br, in prose, list items and table cells", () => {
		for (const src of ["Tail with <b>x</b>\n", "- a <span>b</span>\n", "| a |\n|---|\n| <u>x</u> |\n", "Text <!-- note --> more\n"]) {
			expect(() => body(src)).toThrow(/unsupported HTML in prose/);
		}
		expect(shape(body('Line<br>break <img src="/img/a.svg" alt="A"> end\n'))).toEqual(["normal:Line\nbreak  end", "image"]);
	});
});
