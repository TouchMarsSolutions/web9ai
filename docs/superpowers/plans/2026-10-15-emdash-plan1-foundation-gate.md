# EmDash 迁移 · 计划 1：基础 + 验证关口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `emdash` 分支变成"本地和生产同一个 runtime、样式用 Tailwind、有测试兜底"的状态，并实测 spec 里所有会影响架构的待验证项，为计划 2（批量迁移、首页、上线）给出明确的通过 / 不通过结论。

**Architecture:**
- 本地 `astro dev` 改用 `@astrojs/cloudflare`，跑在 workerd 里，D1/R2 用 wrangler 本地模拟；生产也是这份配置。
- 内容模型写进 `seed/seed.json`，新库首次启动时由 seed 建表。实测发现：通过 MCP 建的 collection 没有全文搜索索引表。
- 自定义块继续由 `packages/web9-blocks` 渲染，样式改成 Tailwind 4。
- 验证类任务都走 MCP，用仓库里的 Node 脚本调用，结论写回 spec。

**Tech Stack:** EmDash 1.3 · Astro 7 · `@astrojs/cloudflare` 14 · wrangler 4 · Tailwind CSS 4.3.3 + `@tailwindcss/typography` · marked + sanitize-html · vitest 5

**Spec:** `docs/superpowers/specs/2026-10-15-emdash-migration-design.md`（执行前通读 §1–§4、§8、§10、§11）

## Global Constraints

- EmDash 锁 minor：`emdash ~1.3.0`、`@emdash-cms/cloudflare ~1.3.0`。Astro 7.x。Node ≥ 22.22.0（astro 的 engines 要求；本机是 24.16）。
- Tailwind `4.3.3`、`@tailwindcss/vite 4.3.3`、`@tailwindcss/typography 0.5.20`，版本写死。
- `astro.config.mjs` 里固定 `site: "https://www.web9.ai"`。绝对 URL 一律从 `site` 拼，不能用请求的 Host。
- i18n：`en` 是默认语言、不加前缀；`zh-CN` 加前缀，fallback 到 `en`。
- 不启用 sandboxed 插件（免费套餐）。
- doc 正文一律是 `portableText` 字段 + 内联块，**不用 `blocks` 字段**。
- `packages/web9-blocks/lib/markdown.mjs` 的 class / style 白名单**不能放宽**。
- 内容 HTML 不带 utility class。不用 `dark:` variant，明暗切换靠颜色 token 里的 `light-dark()`。
- MCP 写内容时传 `status: "published"`，或者之后调用 `content_publish`。默认会存成草稿。
- 图片 URL 保持站内相对路径 `/img/...`，不加 `https://www.web9.ai` 前缀。
- 本机 shell 环境：
  - `grep` 是 ugrep，复杂正则要用 `command grep`；
  - `sed -i ''` 会报错，原地改文件用 node 或 python；
  - zsh 不会对变量做 word-split。
- 浏览器只能通过 CDP（localhost:9222）操作**已经打开**的 Chrome 标签页。不准开新标签页或新的 Chrome 实例；没有合适的标签页就请用户去打开。
- 每个 commit message 末尾加两行：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB
  ```
- **关口规则**：标了 🚦 的步骤是验证关口。结果和预期不符时，**停下来**，把命令和输出原样报告给用户。不要临场换库、改架构或绕过去。

## 文件结构

| 文件 | 职责 | 任务 |
|---|---|---|
| `vitest.config.mjs` | 测试入口：`scripts/`、`packages/`、`seed/` 下的 `*.test.mjs` | 1 |
| `scripts/lib/mdx-to-pt.mjs` | 纯函数 `convertMdx()`：MDX → `docs` payload | 1 |
| `scripts/convert-mdx.mjs` | 薄 CLI，调用 `convertMdx` | 1 |
| `packages/web9-blocks/lib/markdown.test.mjs` | sanitizer 回归测试 | 2 |
| `seed/seed.json` + `seed/seed.test.mjs` | 内容模型快照（`docs` collection） | 3 |
| `scripts/lib/mcp.mjs` / `scripts/mcp.mjs` | MCP JSON-RPC client 和 CLI | 4 |
| `scripts/lib/markers.mjs` / `scripts/check-page.mjs` | 抓取页面，断言包含 / 不包含指定标记 | 4 |
| `astro.config.mjs`、`wrangler.jsonc`、`src/worker.ts` | Cloudflare runtime | 5 |
| `src/styles/global.css` | Tailwind 入口 | 6 |
| `packages/web9-blocks/astro/*.astro`、`blocks.css` | 块渲染，改用 Tailwind | 6 |
| `packages/web9-blocks/lib/search-text.mjs` | （条件）把块里的文字摊平，供搜索使用 | 9 |
| `.agents/skills/web9-blocks/SKILL.md` | AI 写作手册（cookbook） | 10 |
| `.local/`（gitignored） | dev token、临时 payload | 1 起 |

---

### Task 1: 测试框架 + 把转换脚本抽成纯函数 + 修两个已知 bug

**Files:**
- Create: `vitest.config.mjs`、`scripts/lib/mdx-to-pt.mjs`、`scripts/lib/mdx-to-pt.test.mjs`
- Modify: `scripts/convert-mdx.mjs`（整个改写成薄 CLI）、`package.json`、`.gitignore`

**Interfaces:**
- Produces:
  - `convertMdx(src: string, opts: { path: string, section?: "ai"|"dev", category?: string, order?: number, lang?: "zh"|"en", site?: string }) → { collection: "docs", slug: string, data: { title, description, section, category, sort_order: number, body: PTBlock[] } }`。`site` 的默认值是 `""`，图片保持 `/img/...`。
  - `cssObjectToString(obj: string) → string`
  - `parseTabs(jsx: string) → { tabs: { value, label, content }[], defaultIndex: number }`，其中 `defaultIndex` 从 0 开始。
  - CLI：`node scripts/convert-mdx.mjs <file> [--section] [--category] [--order] [--lang] [--site]`，把 JSON 输出到 stdout。

- [ ] **Step 1: 安装 vitest，加 test script 和 `.local/`**

```bash
cd /Users/john/git/web9ai
npm i -D vitest@^5.0.5
node -e "const f='package.json';const p=JSON.parse(require('fs').readFileSync(f,'utf8'));p.scripts.test='vitest run';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
printf '\n# Local scratch (dev token, payloads)\n.local/\n' >> .gitignore
mkdir -p .local
```

Create `vitest.config.mjs`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["scripts/**/*.test.mjs", "packages/**/*.test.mjs", "seed/**/*.test.mjs"],
	},
});
```

- [ ] **Step 2: 写失败的测试**

Create `scripts/lib/mdx-to-pt.test.mjs`:

```js
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
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npx vitest run scripts/lib/mdx-to-pt.test.mjs`
Expected: FAIL，报错是 `Failed to load url ./mdx-to-pt.mjs`（文件还不存在）。

- [ ] **Step 4: 创建 `scripts/lib/mdx-to-pt.mjs`**

先复制原脚本：`cp scripts/convert-mdx.mjs scripts/lib/mdx-to-pt.mjs`。然后在 `scripts/lib/mdx-to-pt.mjs` 里做下面这些修改：

1. 删掉第 1 行 shebang，以及从 `import { readFileSync } ...` 到 `const key = () => ...;` 之间的所有内容（原文件第 13–30 行，包括 3 行 import、`SITE`、`parseArgs`、`keySeq`、`key`）。替换成下面这段，开头的说明注释保留：

```js
import { marked } from "marked";

/** Split on `sep` at the top level only: separators inside (...) or quotes don't count. */
export function splitTopLevel(text, sep = ",") {
	const out = [];
	let depth = 0;
	let quote = null;
	let cur = "";
	for (const ch of text) {
		if (quote) {
			if (ch === quote) quote = null;
		} else if (ch === "'" || ch === '"') {
			quote = ch;
		} else if (ch === "(") {
			depth++;
		} else if (ch === ")") {
			depth--;
		} else if (ch === sep && depth === 0) {
			out.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	if (cur.trim()) out.push(cur);
	return out;
}

/** JSX style object body -> CSS declarations. `{{background: 'linear-gradient(a, b)'}}` keeps its commas. */
export function cssObjectToString(obj) {
	return splitTopLevel(obj)
		.map((pair) => pair.match(/^\s*([\w-]+)\s*:\s*['"]?([\s\S]+?)['"]?\s*$/))
		.filter(Boolean)
		.map(([, k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v}`)
		.join("; ");
}

/** Parse a Docusaurus <Tabs> element. Tabs follow the `values` prop order, as Docusaurus renders them. */
export function parseTabs(jsx) {
	const declared = [...jsx.matchAll(/\{\s*label:\s*['"]([^'"]+)['"],\s*value:\s*['"]([^'"]+)['"]\s*\}/g)].map(
		([, label, value]) => ({ value, label }),
	);
	const items = [...jsx.matchAll(/<TabItem\s+([^>]*)>([\s\S]*?)<\/TabItem>/g)].map(([, attrs, content]) => ({
		value: attrs.match(/value="([^"]+)"/)?.[1],
		label: attrs.match(/label="([^"]+)"/)?.[1],
		content,
	}));
	const byValue = new Map(items.map((it) => [it.value, it]));
	const order = [...declared.map((d) => d.value), ...items.map((it) => it.value).filter((v) => !declared.some((d) => d.value === v))];
	const tabs = order
		.filter((value) => byValue.has(value))
		.map((value) => ({
			value,
			label: declared.find((d) => d.value === value)?.label ?? byValue.get(value).label ?? value,
			content: byValue.get(value).content,
		}));
	const defaultValue = jsx.match(/defaultValue="([^"]+)"/)?.[1];
	return { tabs, defaultIndex: Math.max(0, tabs.findIndex((t) => t.value === defaultValue)) };
}

/**
 * Convert one Docusaurus MDX doc into an EmDash `docs` payload.
 * `site` prefixes /img/... URLs; the default "" keeps them site-relative (served from public/img).
 */
export function convertMdx(src, { path, section = "ai", category = "general", order = 0, lang = "zh", site = "" }) {
	let keySeq = 0;
	const key = () => `k${(keySeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
```

2. 删掉 `const src = readFileSync(positionals[0], "utf8");` 这一行，因为 `src` 现在是函数参数。
3. 删掉原来的 `const cssObjectToString = (obj) => ...` 定义（7 行），模块顶部已经有导出的版本。
4. 在 `convertMdx` 的函数体里，把所有 `SITE` 替换为 `site`，所有 `opts.lang` 替换为 `lang`。
5. 把主循环里整个 `<Tabs` 分支（从 `} else if (/^\s*<Tabs\b/.test(line)) {` 到它的 `blocks.push({ _type: "tabs", ... })`）替换成：

```js
	} else if (/^\s*<Tabs\b/.test(line)) {
		flush();
		const [inner, end] = collectUntil(i, /^\s*<\/Tabs>/);
		i = end;
		const { tabs, defaultIndex } = parseTabs(inner.join("\n"));
		blocks.push({
			_type: "tabs",
			_key: key(),
			tabs: tabs.map((t) => ({ label: t.label, body: mdxToMarkdown(dedent(t.content)) })),
			default_tab: defaultIndex + 1,
			fullscreen,
		});
```

6. 在 slug 计算里，把 `positionals[0]` 换成 `path`。
7. 把文件末尾整个 `process.stdout.write(JSON.stringify(...))` 替换成下面的代码，并闭合函数：

```js
	return {
		collection: "docs",
		slug,
		data: {
			title,
			description: frontmatter.description ?? frontmatter.title ?? "",
			section,
			category,
			sort_order: Number(order),
			body: blocks,
		},
	};
}
```

8. 原文件中间部分（frontmatter 解析、图片 import、`mdxToMarkdown`、`dedent`、`inlineToSpans`、`textBlock`、`listToBlocks`、`tableToCoreTable`、`markdownToBlocks`、`tableToBlock`、主循环）**原样**留在 `convertMdx` 的函数体里，它们通过闭合使用 `key`、`images`、`site`、`lang`。

- [ ] **Step 5: 把 `scripts/convert-mdx.mjs` 改写成薄 CLI**

用下面的内容替换整个文件：

```js
#!/usr/bin/env node
// Convert a Docusaurus MDX doc into an EmDash `docs` payload (logic in ./lib/mdx-to-pt.mjs).
// Usage: node scripts/convert-mdx.mjs <file.mdx> [--section ai] [--category usecase] [--order 1] [--lang zh] [--site ""] > payload.json
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { convertMdx } from "./lib/mdx-to-pt.mjs";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		section: { type: "string", default: "ai" },
		category: { type: "string", default: "general" },
		order: { type: "string", default: "0" },
		lang: { type: "string", default: "zh" },
		site: { type: "string", default: "" },
	},
});
const [path] = positionals;
if (!path) {
	console.error("usage: convert-mdx.mjs <file.mdx> [--section] [--category] [--order] [--lang] [--site]");
	process.exit(2);
}
const payload = convertMdx(readFileSync(path, "utf8"), { path, ...values, order: Number(values.order) });
process.stdout.write(`${JSON.stringify(payload, null, 1)}\n`);
```

- [ ] **Step 6: 运行测试，确认通过；CLI 冒烟**

Run: `npx vitest run scripts/lib/mdx-to-pt.test.mjs`
Expected: 8 个测试全部 PASS。

Run: `node scripts/convert-mdx.mjs legacy/docs/ai/88-usecase/01_ai_hot_tools.mdx --category usecase --order 1 | node -e "const p=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(p.slug,p.data.body.length)"`
Expected: `ai-tools-adhoc 51`

- [ ] **Step 7: 更新 CLAUDE.md 并提交**

在 `CLAUDE.md` 的 `## Commands` 下面加一行：`- Tests: \`npm test\` (vitest; \`*.test.mjs\` under scripts/, packages/, seed/)`。把 `## Layout` 里 `scripts/convert-mdx.mjs` 那一行改成：``- `scripts/lib/mdx-to-pt.mjs` — Docusaurus MDX -> EmDash `docs` payload (`convertMdx`); `scripts/convert-mdx.mjs` is its CLI``。

```bash
git add vitest.config.mjs package.json package-lock.json .gitignore scripts/ CLAUDE.md
git commit -m "test: vitest harness; extract MDX converter into convertMdx()

Fixes two converter bugs: JSX style values with commas inside rgba()/
linear-gradient() were cut, and tabs followed TabItem source order instead
of the values array. Images stay site-relative (/img/...) by default.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 2: Sanitizer 回归测试 + callout tone 白名单

用了 Tailwind 之后，任何能写进 `class` 属性的内容数据都可能变成全屏遮罩。`Callout.astro` 现在直接把 `node.tone` 拼进 class；Block Kit 的 select 只在后台 UI 里限制取值，通过 MCP 写入时可以绕过。

**Files:**
- Create: `packages/web9-blocks/lib/markdown.test.mjs`
- Modify: `packages/web9-blocks/lib/markdown.mjs`（新增导出 `safeTone`）、`packages/web9-blocks/astro/Callout.astro`

**Interfaces:**
- Produces: `safeTone(tone: unknown) → "note"|"tip"|"info"|"warning"|"danger"|"caution"`，不认识的值回落到 `"info"`。

- [ ] **Step 1: 写测试**

Create `packages/web9-blocks/lib/markdown.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { renderInlineMarkdown, renderMarkdown, safeTone } from "./markdown.mjs";

describe("renderMarkdown sanitizer", () => {
	it("keeps cosmetic inline styles, gradients included", () => {
		expect(
			renderMarkdown('<div style="background: linear-gradient(135deg, #9400D3, #4B0082); padding: 20px; color: #E6E6FA">ok</div>'),
		).toBe('<div style="background:linear-gradient(135deg, #9400D3, #4B0082);padding:20px;color:#E6E6FA">ok</div>');
	});
	it("drops positioning so content cannot overlay the page", () => {
		expect(renderMarkdown('<div style="position: fixed; inset: 0; z-index: 9999; background: red">x</div>')).toBe(
			'<div style="background:red">x</div>',
		);
	});
	it("strips Tailwind utility classes that would build an overlay", () => {
		expect(renderMarkdown('<div class="fixed inset-0 z-50 bg-black">x</div>')).toBe("<div>x</div>");
	});
	it("drops url() and CSS escapes", () => {
		expect(renderMarkdown('<div style="background: url(https://evil.example/t.gif)">x</div>')).toBe("<div>x</div>");
		expect(renderMarkdown('<div style="background: u\\72l(https://evil.example)">x</div>')).toBe("<div>x</div>");
	});
	it("removes scripts, event handlers and javascript: links", () => {
		expect(renderMarkdown("<img src=x onerror=alert(1)><script>alert(1)</script>")).toBe('<p><img src="x" /></p>\n');
		expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("javascript:");
	});
	it("forces rel/target on links", () => {
		expect(renderMarkdown("[ok](https://example.com)")).toBe(
			'<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">ok</a></p>\n',
		);
	});
	it("drops arbitrary class and id attributes", () => {
		expect(renderMarkdown('<div class="w9-tabs" id="evil">x</div>')).toBe("<div>x</div>");
	});
	it("renders :::tone admonitions as whitelisted callout markup", () => {
		expect(renderMarkdown(":::tip Title\nbody **bold**\n:::")).toBe(
			'<aside class="callout callout--tip"><p class="callout__title">Title</p><p>body <strong>bold</strong></p>\n</aside>',
		);
	});
	it("renders mermaid fences as escaped <pre class=mermaid>", () => {
		expect(renderMarkdown("```mermaid\ngraph TD; A-->B\n```")).toBe('<pre class="mermaid">graph TD; A--&gt;B</pre>');
	});
	it("keeps language-* classes on code blocks", () => {
		expect(renderMarkdown("```js\nconst a = 1;\n```")).toContain('<code class="language-js">');
	});
	it("sanitizes inline markdown too", () => {
		expect(renderInlineMarkdown('<b onclick="x()">hi</b>')).toBe("<b>hi</b>");
	});
});

describe("safeTone", () => {
	it("passes known tones through", () => {
		expect(safeTone("danger")).toBe("danger");
	});
	it("refuses anything else, so block data cannot inject classes", () => {
		expect(safeTone("x fixed inset-0 z-50")).toBe("info");
		expect(safeTone(undefined)).toBe("info");
	});
});
```

- [ ] **Step 2: 运行测试，确认只有 `safeTone` 失败**

Run: `npx vitest run packages/web9-blocks/lib/markdown.test.mjs`
Expected: sanitizer 的 11 个测试 PASS，因为它们锁定的是现有行为；`safeTone` 的 2 个测试 FAIL，报 `safeTone is not a function`。如果 sanitizer 有测试失败，说明白名单退化了，应该修 `markdown.mjs`，不要改测试。

- [ ] **Step 3: 实现 `safeTone`，并在 Callout 里使用**

在 `packages/web9-blocks/lib/markdown.mjs` 的 `const TONES = new Set([...]);` 后面加：

```js
/** Block data reaches class attributes; only whitelisted tones may (Tailwind makes any class a style). */
export const safeTone = (tone) => (TONES.has(tone) ? tone : "info");
```

在 `packages/web9-blocks/astro/Callout.astro` 的 frontmatter 里：
- 把 import 改成 `import { renderInlineMarkdown, renderMarkdown, safeTone } from "../lib/markdown.mjs";`
- 把 `const tone = node?.tone ?? "info";` 改成 `const tone = safeTone(node?.tone);`

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`
Expected: 全部 PASS（Task 1 的 8 个 + 这里的 13 个）。

- [ ] **Step 5: 提交**

```bash
git add packages/web9-blocks/
git commit -m "test: lock the Markdown sanitizer; whitelist callout tones

Block data that reaches a class attribute is now whitelisted, since with
Tailwind any class name is a style (fixed inset-0 z-50 = overlay).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 3: 把 `docs` collection 写进 seed

背景：现在 `docs` 是在 Node 版的 `data.db` 里通过 MCP 建的，Task 5 切换 runtime 之后这个库就不再使用。另外实测发现，通过 MCP 建的 collection **没有生成全文搜索索引表**：`data.db` 里有 `_emdash_fts_posts` 和 `_emdash_fts_pages`，但没有 `_emdash_fts_docs`。而 seed 建出来的 posts 和 pages 都有。所以 schema 必须放进 seed，由新库首次启动时创建。

**Files:**
- Modify: `seed/seed.json`（`collections` 里新增 `docs`；`meta.name` 改成 `"Web9.AI"`）
- Create: `seed/seed.test.mjs`

**Interfaces:**
- Produces: 新库首次 setup 后存在 `docs` collection，字段和 spec §2 一致。Task 5 会在真实库上核对。

- [ ] **Step 1: 写失败的测试**

Create `seed/seed.test.mjs`:

```js
import { readFileSync } from "node:fs";
import { validateSeed } from "emdash/seed";
import { describe, expect, it } from "vitest";

const seed = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8"));

describe("seed/seed.json", () => {
	it("passes EmDash seed validation", () => {
		const result = validateSeed(seed);
		expect(result.errors).toEqual([]);
		expect(result.valid).toBe(true);
	});
	it("defines the docs collection as spec §2 requires", () => {
		const docs = seed.collections.find((c) => c.slug === "docs");
		expect(docs.supports).toEqual(["drafts", "revisions", "preview", "search", "seo"]);
		const f = Object.fromEntries(docs.fields.map((x) => [x.slug, x]));
		expect(Object.keys(f)).toEqual(["title", "description", "section", "category", "sort_order", "body"]);
		expect(f.title).toMatchObject({ type: "string", required: true, searchable: true });
		expect(f.section).toMatchObject({ type: "select", required: true, translatable: false });
		expect(f.section.validation.options).toEqual(["ai", "dev"]);
		expect(f.sort_order).toMatchObject({ type: "integer", indexed: true, translatable: false });
		expect(f.body).toMatchObject({ type: "portableText", searchable: true });
	});
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run seed/seed.test.mjs`
Expected: 第二个测试 FAIL，报 `Cannot read properties of undefined (reading 'supports')`。

- [ ] **Step 3: 修改 seed**

```bash
node -e '
const f = "seed/seed.json";
const s = JSON.parse(require("fs").readFileSync(f, "utf8"));
s.meta.name = "Web9.AI";
s.meta.description = "Web9.AI knowledge base (docs), blog and landing pages";
s.collections = s.collections.filter((c) => c.slug !== "docs");
s.collections.push({
  slug: "docs",
  label: "Docs",
  labelSingular: "Doc",
  description: "Knowledge base docs (AI / Dev)",
  urlPattern: "/docs/{slug}",
  supports: ["drafts", "revisions", "preview", "search", "seo"],
  fields: [
    { slug: "title", label: "Title", type: "string", required: true, searchable: true },
    { slug: "description", label: "Description", type: "text" },
    { slug: "section", label: "Section", type: "select", required: true, translatable: false, validation: { options: ["ai", "dev"] } },
    { slug: "category", label: "Category", type: "string" },
    { slug: "sort_order", label: "Sort order", type: "integer", indexed: true, translatable: false },
    { slug: "body", label: "Body", type: "portableText", searchable: true },
  ],
});
require("fs").writeFileSync(f, JSON.stringify(s, null, "\t") + "\n");
'
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run seed/seed.test.mjs`
Expected: 2 个测试 PASS。如果 `validateSeed` 报 `indexed` 或 `urlPattern` 相关的错误，删掉报错的那个属性再跑一次，并在 commit message 里写明删了什么、为什么删。

- [ ] **Step 5: 同步 spec，提交**

spec §2 表格里 `docs` 那一行，把最后一格的 `**已定**，已通过 MCP 创建` 改成 `**已定**，在 \`seed/seed.json\` 里定义（通过 MCP 建的 collection 没有全文搜索索引表）`。

```bash
git add seed/ docs/superpowers/specs/
git commit -m "feat(seed): docs collection in the seed

MCP-created collections get no full-text index table (_emdash_fts_docs was
missing while seed-created posts/pages had theirs), so the schema must come
from the seed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 4: 开发工具：MCP client 和页面检查脚本

**Files:**
- Create: `scripts/lib/mcp.mjs`、`scripts/mcp.mjs`、`scripts/lib/markers.mjs`、`scripts/check-page.mjs`、`scripts/lib/mcp.test.mjs`

**Interfaces:**
- Produces（Task 5–10 和计划 2 的迁移脚本都会用到）：
  - `callTool(name: string, args?: object, opts?: { url?, token? }) → Promise<any>`：如果返回的文本是 JSON 就解析，否则返回原文；`isError` 或 JSON-RPC error 会抛异常。
  - `rpc(method: string, params?: object, opts?) → Promise<object>`
  - `parseRpcBody(raw: string) → object`、`unwrapToolResult(name, res) → any`
  - 环境变量：`EMDASH_URL`（默认 `http://localhost:4321`）、`EMDASH_TOKEN`（默认读 `.local/dev-token`）
  - CLI：`node scripts/mcp.mjs <tool> ['<json>' | @file.json]`、`node scripts/mcp.mjs --list`
  - `checkMarkers(html, { present?: string[], absent?: string[] }) → { missing: string[], unexpected: string[] }`
  - CLI：`node scripts/check-page.mjs <url> <marker>... [--absent <marker>...]`。只有在 HTTP 200、所有 marker 都在、`--absent` 的一个都不在时才 exit 0。

- [ ] **Step 1: 写失败的测试**

Create `scripts/lib/mcp.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { checkMarkers } from "./markers.mjs";
import { parseRpcBody, unwrapToolResult } from "./mcp.mjs";

describe("parseRpcBody", () => {
	it("parses plain JSON", () => {
		expect(parseRpcBody('{"jsonrpc":"2.0","id":1,"result":{}}').id).toBe(1);
	});
	it("takes the last data: line of an SSE answer", () => {
		expect(parseRpcBody('event: message\ndata: {"id":1,"result":{"a":1}}\n\ndata: {"id":2,"result":{"a":2}}\n').result.a).toBe(2);
	});
	it("throws on anything else", () => {
		expect(() => parseRpcBody("<html>")).toThrow(/Unexpected MCP response/);
	});
});

describe("unwrapToolResult", () => {
	it("returns parsed JSON text content", () => {
		expect(unwrapToolResult("t", { result: { content: [{ type: "text", text: '{"id":"x"}' }] } })).toEqual({ id: "x" });
	});
	it("returns raw text when it is not JSON", () => {
		expect(unwrapToolResult("t", { result: { content: [{ type: "text", text: "ok" }] } })).toBe("ok");
	});
	it("throws on tool errors and JSON-RPC errors", () => {
		expect(() => unwrapToolResult("t", { result: { isError: true, content: [{ type: "text", text: "nope" }] } })).toThrow("t: nope");
		expect(() => unwrapToolResult("t", { error: { code: -32602, message: "bad args" } })).toThrow("t: bad args");
	});
});

describe("checkMarkers", () => {
	it("reports missing and unexpected markers", () => {
		expect(checkMarkers("<p class=a>hi</p>", { present: ["hi", "bye"], absent: ["class=a", "zzz"] })).toEqual({
			missing: ["bye"],
			unexpected: ["class=a"],
		});
	});
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run scripts/lib/mcp.test.mjs`
Expected: FAIL，报 `Failed to load url ./markers.mjs`。

- [ ] **Step 3: 实现**

Create `scripts/lib/mcp.mjs`:

```js
// Minimal client for the EmDash MCP endpoint (JSON-RPC over Streamable HTTP; stateless, no initialize needed).
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: contents of .local/dev-token).
import { readFileSync } from "node:fs";

/** Streamable HTTP may answer with SSE; the JSON-RPC response is the last `data:` line. */
export function parseRpcBody(raw) {
	if (raw.trimStart().startsWith("{")) return JSON.parse(raw);
	const data = raw
		.split("\n")
		.filter((l) => l.startsWith("data:"))
		.map((l) => l.slice(5).trim());
	if (!data.length) throw new Error(`Unexpected MCP response: ${raw.slice(0, 200)}`);
	return JSON.parse(data.at(-1));
}

/** Unwrap a tools/call answer: JSON-parse its text content when possible; throw on errors. */
export function unwrapToolResult(name, res) {
	if (res.error) throw new Error(`${name}: ${res.error.message ?? JSON.stringify(res.error)}`);
	const text = (res.result?.content ?? [])
		.filter((c) => c.type === "text")
		.map((c) => c.text)
		.join("\n");
	if (res.result?.isError) throw new Error(`${name}: ${text}`);
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function defaultToken() {
	if (process.env.EMDASH_TOKEN) return process.env.EMDASH_TOKEN;
	return readFileSync(new URL("../../.local/dev-token", import.meta.url), "utf8").trim();
}

let nextId = 1;

export async function rpc(method, params = {}, { url = process.env.EMDASH_URL ?? "http://localhost:4321", token = defaultToken() } = {}) {
	const res = await fetch(`${url}/_emdash/api/mcp`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
	});
	return parseRpcBody(await res.text());
}

export async function callTool(name, args = {}, opts) {
	return unwrapToolResult(name, await rpc("tools/call", { name, arguments: args }, opts));
}
```

Create `scripts/mcp.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/mcp.mjs <tool> ['<json>' | @file.json]   prints the tool result as JSON
//        node scripts/mcp.mjs --list                          lists tool names
import { readFileSync } from "node:fs";
import { callTool, rpc } from "./lib/mcp.mjs";

const [tool, arg = "{}"] = process.argv.slice(2);
if (!tool) {
	console.error("usage: mcp.mjs <tool> ['<json>' | @file.json] | --list");
	process.exit(2);
}
if (tool === "--list") {
	const res = await rpc("tools/list");
	for (const t of res.result.tools) console.log(t.name);
} else {
	const args = JSON.parse(arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg);
	const out = await callTool(tool, args);
	console.log(typeof out === "string" ? out : JSON.stringify(out, null, 1));
}
```

Create `scripts/lib/markers.mjs`:

```js
/** Which expected markers are missing from a page, and which forbidden ones appear in it. */
export function checkMarkers(html, { present = [], absent = [] }) {
	return {
		missing: present.filter((m) => !html.includes(m)),
		unexpected: absent.filter((m) => html.includes(m)),
	};
}
```

Create `scripts/check-page.mjs`:

```js
#!/usr/bin/env node
// Usage: node scripts/check-page.mjs <url> <marker>... [--absent <marker>...]
// Exits 1 unless the page returns 200, contains every marker, and none of the --absent ones.
import { checkMarkers } from "./lib/markers.mjs";

const [url, ...rest] = process.argv.slice(2);
const cut = rest.indexOf("--absent");
const present = cut < 0 ? rest : rest.slice(0, cut);
const absent = cut < 0 ? [] : rest.slice(cut + 1);
const res = await fetch(url);
const { missing, unexpected } = checkMarkers(await res.text(), { present, absent });
console.log(JSON.stringify({ url, status: res.status, missing, unexpected }, null, 1));
process.exit(res.status === 200 && !missing.length && !unexpected.length ? 0 : 1);
```

- [ ] **Step 4: 运行测试，确认通过；再对正在运行的 dev server 冒烟**

Run: `npm test`
Expected: 全部 PASS。

当前的 Node dev server 用 POC 阶段的 token。临时用一下它，验证 client 能连通：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/ || (npm run dev -- --port 4321 && sleep 8)
EMDASH_TOKEN=$(cat /private/tmp/claude-502/-Users-john-git-web9ai/dcc1dbd1-cf48-4c18-b5dd-566a4f0a0b9c/scratchpad/token.txt) node scripts/mcp.mjs --list | head -3
node scripts/check-page.mjs http://localhost:4321/ '<html' --absent 'Internal Server Error'
```

Expected: 第二条命令输出 3 个工具名（如 `content_list`）；第三条 exit 0，输出里 `"status": 200`。如果 scratchpad 里的 token 文件已经不存在，跳过第二条，在报告里说明。

- [ ] **Step 5: 提交**

```bash
git add scripts/
git commit -m "feat(scripts): MCP client/CLI and page marker checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 5: 切到 Cloudflare runtime（本地 dev 跑在 workerd）🚦

回答 spec §1 的待验证项：`sanitize-html` 和 `marked` 能否在 Workers runtime 里运行。同时核对 seed 建出来的 `docs` 带有搜索索引表。

**Files:**
- Modify: `astro.config.mjs`、`package.json`、`tsconfig.json`、`.gitignore`、`CLAUDE.md`、spec §1
- Create: `wrangler.jsonc`、`src/worker.ts`、`worker-configuration.d.ts`（由 wrangler 生成并提交）、`.dev.vars`（gitignored）

**Interfaces:**
- Consumes: Task 3 的 seed、Task 4 的 `scripts/mcp.mjs` 和 `scripts/check-page.mjs`
- Produces:
  - `npm run dev` 在 workerd 里运行，地址 `http://localhost:4321`；
  - `.local/dev-token` 存着 admin PAT；
  - 本地 D1 里有 `docs` collection，并且带 `_emdash_fts_docs` 表；
  - 已发布的冒烟 doc `/docs/smoke-workerd`，Task 6 会继续使用。

- [ ] **Step 1: 停掉 Node dev server，切换依赖**

```bash
npx astro dev stop
npm rm @astrojs/node
npm i @astrojs/cloudflare@^14.4.0 @emdash-cms/cloudflare@~1.3.0 emdash@~1.3.0
npm i -D wrangler@^4.151.0 @cloudflare/workers-types@^5.20261015.1
node -e "const f='package.json';const p=JSON.parse(require('fs').readFileSync(f,'utf8'));delete p.scripts.start;require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
```

- [ ] **Step 2: 改写 `astro.config.mjs`**

用下面的内容替换整个文件：

```js
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { web9Blocks } from "@web9/blocks";

export default defineConfig({
	// Canonical origin for absolute URLs (RSS, OG, SEO). Never derive it from the request Host header.
	site: "https://www.web9.ai",
	output: "server",
	i18n: {
		defaultLocale: "en",
		locales: ["en", "zh-CN"],
		fallback: { "zh-CN": "en" },
		routing: { prefixDefaultLocale: false },
	},
	// Dev and production both run in workerd; locally D1/R2 are simulated under .wrangler/state.
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [web9Blocks()],
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});
```

- [ ] **Step 3: 加 wrangler 配置、worker 入口、本地 secrets**

Create `wrangler.jsonc`:

```jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "web9-ai",
	"main": "./src/worker.ts",
	"compatibility_date": "2026-02-24",
	"compatibility_flags": ["nodejs_compat"],
	"d1_databases": [{ "binding": "DB", "database_name": "web9-ai" }],
	"r2_buckets": [{ "binding": "MEDIA", "bucket_name": "web9-ai-media" }],
	// Scheduled publishing + maintenance; ~1440 invocations/day, inside the free tier (spec §9)
	"triggers": { "crons": ["* * * * *"] },
}
```

Create `src/worker.ts`:

```ts
import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";

export { PluginBridge };

export default {
	...handler,
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
```

```bash
printf '.wrangler\n.dev.vars\n.dev.vars.*\n' >> .gitignore
cp .env .dev.vars            # EMDASH_ENCRYPTION_KEY for workerd; both files are gitignored
npx wrangler types           # writes worker-configuration.d.ts
node -e "const f='tsconfig.json';const t=JSON.parse(require('fs').readFileSync(f,'utf8'));t.include.push('worker-configuration.d.ts');require('fs').writeFileSync(f,JSON.stringify(t,null,'\t')+'\n')"
rm -f data.db data.db-* && rm -rf uploads    # POC-only Node/SQLite state (gitignored); the schema now lives in the seed
```

- [ ] **Step 4: 类型检查和构建**

Run: `npm run typecheck && npm run build`
Expected: `0 errors`，并且输出 `[build] Complete!`。

- [ ] **Step 5: 启动 dev server，headless 完成 setup，保存 token**

```bash
npm run dev -- --port 4321
for i in $(seq 1 60); do c=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/); [ "$c" != "000" ] && break; sleep 1; done; echo "first response: $c"
curl -s -X POST 'http://localhost:4321/_emdash/api/setup/dev-bypass?token=1&content=0' > .local/bypass.json
node -e "const d=require('./.local/bypass.json');if(!d.data?.token){console.error(JSON.stringify(d));process.exit(1)};require('fs').writeFileSync('.local/dev-token',d.data.token);console.log('token saved for',d.data.user.email)"
```

Expected: 最后一行输出 `token saved for dev@emdash.local`。

- [ ] **Step 6: 🚦 证明 dev 真的跑在 workerd 里**

创建一个临时路由 `src/pages/runtime.txt.ts`：

```ts
import type { APIRoute } from "astro";

export const GET: APIRoute = () => new Response(String(globalThis.navigator?.userAgent));
```

Run: `curl -s http://localhost:4321/runtime.txt; echo; rm src/pages/runtime.txt.ts`
Expected: 输出 `Cloudflare-Workers`。如果输出 `Node.js/...` 或 `undefined`，说明 dev 没有跑在 workerd 里，**停下来报告**（spec §1 的修订前提不成立）。

- [ ] **Step 7: 🚦 核对 seed 建出来的 schema 和搜索索引**

```bash
node scripts/mcp.mjs schema_get_collection '{"slug":"docs"}' | node -e "
const c = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const f = Object.fromEntries(c.fields.map((x) => [x.slug, x]));
const ok = f.title?.searchable && f.body?.searchable && f.body.type === 'portableText' && f.section?.translatable === false && f.sort_order?.indexed && c.supports.includes('search');
console.log(ok ? 'docs schema OK' : 'docs schema MISMATCH', Object.keys(f));
process.exit(ok ? 0 : 1);"
npx wrangler d1 execute web9-ai --local --command "SELECT name FROM sqlite_master WHERE name LIKE '_emdash_fts_%'"
```

Expected: 第一条输出 `docs schema OK`；第二条输出的表名里有 `_emdash_fts_docs`。如果 `wrangler d1 execute --local` 读到的是空库（只有 `_cf_` 开头的表），说明 Astro dev 的本地状态目录不是 `.wrangler/state`。这时执行 `find .wrangler -name '*.sqlite'`，对找到的文件用 `sqlite3 <file> ".tables"` 再查。如果确实没有 `_emdash_fts_docs`，**停下来报告**。

- [ ] **Step 8: 🚦 在 workerd 里渲染一个经过 sanitizer 的块**

Create `.local/smoke.json`:

```json
{
	"collection": "docs",
	"slug": "smoke-workerd",
	"status": "published",
	"data": {
		"title": "Smoke: workerd rendering",
		"section": "dev",
		"sort_order": 0,
		"body": [
			{
				"_type": "callout",
				"_key": "c1",
				"tone": "tip",
				"title": "Workerd",
				"body": "<div style=\"background: linear-gradient(90deg, #fff, #000); position: fixed\">styled</div>\n\n**bold** <img src=x onerror=alert(1)>"
			}
		]
	}
}
```

```bash
node scripts/mcp.mjs content_create @.local/smoke.json > /dev/null
node scripts/check-page.mjs http://localhost:4321/docs/smoke-workerd \
  'class="callout callout--tip"' \
  '<div style="background:linear-gradient(90deg, #fff, #000)">styled</div>' \
  '<strong>bold</strong>' \
  --absent 'alert(1)'
```

Expected: exit 0。这说明 marked、sanitize-html（包括它依赖的 postcss 样式解析）都在 workerd 里正常运行，`position: fixed` 被去掉，事件属性也被去掉。如果页面返回 500，或者 dev 日志里出现模块加载错误（`fs`、`path`、`source-map-js` 等），**停下来报告**，把 `npx astro dev logs` 的输出原样附上（命令不存在的话，附上启动 dev 的那个终端的输出）。

- [ ] **Step 9: 把结论写回 spec，更新 CLAUDE.md，提交**

spec §1：把最后一条 `- **待验证**：\`sanitize-html\`...` 改成 `- **已验证（计划 1 Task 5）**：本地 dev 跑在 workerd 里（\`navigator.userAgent\` 为 \`Cloudflare-Workers\`），\`marked\` 和 \`sanitize-html\`（包括它依赖的 postcss 样式解析）都能正常渲染和过滤。`

CLAUDE.md 的 `## Commands` 改成下面这样：

```markdown
## Commands

- Dev server: `npm run dev -- --port 4321` (daemon, runs in workerd like production; stop with `npx astro dev stop`)
- First run on an empty local DB: `curl -X POST 'http://localhost:4321/_emdash/api/setup/dev-bypass?token=1&content=0'`, save `data.token` to `.local/dev-token`
- Browser login (dev only): open `/_emdash/api/auth/dev-bypass?redirect=/_emdash/admin`
- MCP from the shell: `node scripts/mcp.mjs <tool> '<json>'`; page assertions: `node scripts/check-page.mjs <url> <marker>...`
- Tests: `npm test` (vitest; `*.test.mjs` under scripts/, packages/, seed/)
- Build: `npm run build` · Type check: `npm run typecheck` · Content types: `npx emdash types`
- Local D1/R2 state lives in `.wrangler/state` (delete it to start over); secrets in `.dev.vars`
```

```bash
git add astro.config.mjs package.json package-lock.json tsconfig.json .gitignore wrangler.jsonc src/worker.ts worker-configuration.d.ts CLAUDE.md docs/superpowers/specs/
git commit -m "feat: run dev and production on the Cloudflare adapter (workerd, D1, R2)

Verified in workerd: marked + sanitize-html render and filter correctly;
the seed creates docs with its full-text index table.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 6: Tailwind（spec §11）

**Files:**
- Create: `src/styles/global.css`
- Modify:
  - `astro.config.mjs`、`package.json`
  - `src/styles/tokens.css`（删掉 12 个颜色 token）、`src/layouts/Base.astro`（第一个 import `global.css`）
  - `packages/web9-blocks/package.json`（导出 `./styles.css`）、`packages/web9-blocks/astro/blocks.css`（重写）
  - `packages/web9-blocks/astro/{Callout,Tabs,Details,ToolGrid,InvestmentWarning,Mermaid}.astro`
  - `src/components/DocsPage.astro`、`CLAUDE.md`

**Interfaces:**
- Consumes: Task 2 的 `safeTone`，Task 5 的冒烟 doc
- Produces:
  - 可用的颜色 utility：`bg-bg`、`bg-surface`、`text-text`、`text-text-secondary`、`text-muted`、`border-border`、`border-border-subtle`、`text-brand`、`border-brand`、`ring-brand`；
  - 块根元素上的数据属性 `data-w9-tabs`、`data-w9-details`、`data-w9-tools`，Task 7 会用来检查渲染结果。

- [ ] **Step 1: 安装并接入 Vite plugin**

```bash
npm i tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 @tailwindcss/typography@0.5.20
```

在 `astro.config.mjs` 里：
- 在 import 区加 `import tailwindcss from "@tailwindcss/vite";`
- 在 `devToolbar: { enabled: false },` 前面加一行 `vite: { plugins: [tailwindcss()] },`

- [ ] **Step 2: 创建 `src/styles/global.css`**

```css
/* Tailwind entry, imported first by src/layouts/Base.astro (spec §11). */
@import "tailwindcss";
@import "@web9/blocks/styles.css";
@plugin "@tailwindcss/typography";

/* legacy/ (Docusaurus sources) and docs/ (specs, plans) are prose, not markup: don't mine them for classes. */
@source not "../../legacy";
@source not "../../docs";
@source "../../packages/web9-blocks";

/*
 * Template color tokens, names unchanged, exposed as utilities (bg-surface, text-muted, border-border...).
 * light-dark() follows the template's theme toggle, so never use the `dark:` variant.
 * `static` keeps every variable on :root because template CSS outside Tailwind reads them too.
 */
@theme static {
	--color-bg: light-dark(#ffffff, #0d0d0d);
	--color-bg-subtle: light-dark(#fafafa, #141414);
	--color-text: light-dark(#1a1a1a, #ededed);
	--color-text-secondary: light-dark(#525252, #a0a0a0);
	--color-muted: light-dark(#8b8b8b, #6b6b6b);
	--color-border: light-dark(#e5e5e5, #2a2a2a);
	--color-border-subtle: light-dark(#f0f0f0, #1f1f1f);
	--color-surface: light-dark(#f7f7f7, #181818);
	--color-brand: light-dark(#0066cc, #4d9fff);
	--color-brand-hover: light-dark(#0052a3, #6eb0ff);
	--color-on-brand: white;
	--color-brand-ring: color-mix(in srgb, var(--color-brand) 25%, transparent);
}

/* (If the build cannot resolve "@web9/blocks/styles.css", use @import "../../packages/web9-blocks/astro/blocks.css"
   instead and drop the "./styles.css" export added in Step 4.) */

/* prose colors follow the same tokens, so prose-invert is never needed. */
@layer utilities {
	.prose {
		--tw-prose-body: var(--color-text);
		--tw-prose-headings: var(--color-text);
		--tw-prose-lead: var(--color-text-secondary);
		--tw-prose-links: var(--color-brand);
		--tw-prose-bold: var(--color-text);
		--tw-prose-counters: var(--color-muted);
		--tw-prose-bullets: var(--color-muted);
		--tw-prose-hr: var(--color-border);
		--tw-prose-quotes: var(--color-text-secondary);
		--tw-prose-quote-borders: var(--color-border);
		--tw-prose-captions: var(--color-muted);
		--tw-prose-code: var(--color-text);
		--tw-prose-pre-code: var(--color-text);
		--tw-prose-pre-bg: var(--color-surface);
		--tw-prose-th-borders: var(--color-border);
		--tw-prose-td-borders: var(--color-border-subtle);
	}
}
```

- [ ] **Step 3: 把颜色 token 挪走，接入 Base**

在 `src/styles/tokens.css` 里，删掉 `:root {` 里从 `/* Colors */` 到 `--color-brand-ring: ...;` 的 13 行（1 行注释加 12 个变量）。`color-scheme`、EmDash search 变量和后面的 `@supports not (color: light-dark(...))` 回退块**保留**。可以用这条命令删：

```bash
python3 - <<'EOF'
import re
p = "src/styles/tokens.css"
s = open(p).read()
s2 = re.sub(r"\n\t\t/\* Colors \*/\n(?:\t\t--color-[\w-]+: [^\n]+\n){12}", "\n", s, count=1)
assert s2 != s, "color block not found"
open(p, "w").write(s2)
EOF
```

在 `src/layouts/Base.astro` 的 `import "../styles/tokens.css";` **前面**加一行 `import "../styles/global.css";`。

- [ ] **Step 4: 块的 CSS 改成 Tailwind，并从包里导出**

在 `packages/web9-blocks/package.json` 的 `exports` 里加 `"./styles.css": "./astro/blocks.css"`。

用下面的内容替换整个 `packages/web9-blocks/astro/blocks.css`：

```css
/*
 * Styles for HTML produced by renderMarkdown(). Sanitized content cannot carry utility classes
 * (the sanitizer strips them on purpose, spec §10/§11), so whitelisted classes are styled here.
 * Imported by src/styles/global.css; never import this file from a component (@apply needs the
 * Tailwind entry).
 *
 * Utilities layer, not components: @tailwindcss/typography puts .prose in the utilities layer and
 * layer order beats specificity, so components-layer rules would lose to prose margins.
 */
@layer utilities {
	.callout {
		--tone: #4b8bf5;
		@apply my-5 rounded-md border-l-4 px-4 py-3;
		border-left-color: var(--tone);
		background: color-mix(in srgb, var(--tone) 10%, transparent);
	}
	.callout--note { --tone: #8a8f98; }
	.callout--tip { --tone: #2e9e5b; }
	.callout--info { --tone: #4b8bf5; }
	.callout--warning,
	.callout--caution { --tone: #d9a400; }
	.callout--danger { --tone: #d6443a; }
	.callout > :first-child,
	.callout > div > :first-child { @apply mt-0; }
	.callout > :last-child,
	.callout > div > :last-child { @apply mb-0; }
	.callout .callout__title { @apply mt-0 mb-1.5 font-bold; }
	pre.mermaid { @apply bg-transparent text-center; }
}
```

把 `Callout.astro`、`Tabs.astro`、`Details.astro`、`ToolGrid.astro`、`InvestmentWarning.astro`、`Mermaid.astro` 里的 `import "./blocks.css";` 全部删掉：

```bash
python3 - <<'EOF'
import pathlib
for p in pathlib.Path("packages/web9-blocks/astro").glob("*.astro"):
    s = p.read_text()
    p.write_text(s.replace('import "./blocks.css";\n', ""))
EOF
command grep -rn 'blocks.css' packages/web9-blocks/astro/ || echo "no component imports blocks.css"
```

- [ ] **Step 5: 块组件的 markup 改用 utilities**

`Tabs.astro`：frontmatter 和 `<script>` 不变，把 markup 部分（从 `<div class="w9-tabs" data-w9-tabs>` 到它对应的 `</div>`）替换成：

```astro
<div class="relative my-6 rounded-lg border border-border px-4 pb-4 [&:fullscreen]:overflow-auto [&:fullscreen]:bg-bg [&:fullscreen]:p-8" data-w9-tabs>
	{
		node?.fullscreen && (
			<button class="absolute top-1.5 right-2 cursor-pointer text-lg opacity-70 hover:opacity-100" type="button" data-fs aria-label="Toggle fullscreen">
				⛶
			</button>
		)
	}
	<div class="-mx-4 mb-4 flex flex-wrap gap-1 border-b border-border px-3" role="tablist">
		{
			tabs.map((tab, i) => (
				<button
					type="button"
					role="tab"
					class="cursor-pointer border-b-2 border-transparent px-3 py-2.5 opacity-70 aria-selected:border-brand aria-selected:font-semibold aria-selected:opacity-100"
					id={`${uid}-tab-${i}`}
					aria-controls={`${uid}-panel-${i}`}
					aria-selected={i === active ? "true" : "false"}
					tabindex={i === active ? 0 : -1}
				>
					{tab.label}
				</button>
			))
		}
	</div>
	{
		tabs.map((tab, i) => (
			<div
				role="tabpanel"
				id={`${uid}-panel-${i}`}
				aria-labelledby={`${uid}-tab-${i}`}
				hidden={i !== active}
				set:html={renderMarkdown(tab.body)}
			/>
		))
	}
</div>
```

`Details.astro`：把 `<details ...>` 到 `</details>` 替换成：

```astro
<details class="my-4 rounded-lg border border-border px-4 py-2 [&[open]>summary]:mb-3" data-w9-details>
	<summary class="cursor-pointer font-semibold" set:html={renderInlineMarkdown(node?.summary ?? "Details")} />
	<div set:html={renderMarkdown(node?.body)} />
</details>
```

`ToolGrid.astro`：frontmatter 之后的全部 markup 替换成：

```astro
{node?.title && <h4 class="mt-4 mb-2">{node.title}</h4>}
<div class="not-prose my-4 mb-6 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3" data-w9-tools>
	{
		tools.map((tool) => (
			<a
				class:list={[
					"flex flex-col items-center gap-1.5 rounded-xl border px-2.5 py-3.5 text-center text-inherit no-underline hover:border-brand",
					tool.featured ? "border-brand ring-1 ring-brand ring-inset" : "border-border",
				]}
				href={tool.url ? sanitizeHref(tool.url) : undefined}
				target="_blank"
				rel="noopener noreferrer"
			>
				{tool.logo && (
					<img class="max-w-full object-contain" src={sanitizeHref(tool.logo)} alt={tool.name ?? ""} width={size} height={size} loading="lazy" />
				)}
				<strong>{tool.name}</strong>
				{tool.tagline && (
					<span class="text-[0.85em] opacity-80" set:html={renderInlineMarkdown(tool.tagline.replace(/\n/g, "<br>"))} />
				)}
			</a>
		))
	}
</div>
```

`Callout.astro`、`InvestmentWarning.astro`、`Mermaid.astro` 的 markup 不变，它们用的是 `blocks.css` 里白名单 class 的选择器。

- [ ] **Step 6: DocsPage 改用 utilities 和 `prose`**

把 `src/components/DocsPage.astro` 里 frontmatter 之后的全部内容（`<Base ...>` 到文件末尾，包括 `<style>` 块）替换成：

```astro
<Base title={doc.data.title} description={doc.data.description} content={{ collection: "docs", id: doc.data.id, slug: doc.data.slug }}>
	<div class="mx-auto my-8 grid max-w-[1200px] grid-cols-1 gap-10 px-4 md:grid-cols-[240px_minmax(0,1fr)]">
		<nav class="text-[0.92rem] md:sticky md:top-4 md:self-start" aria-label="Docs">
			{
				[...groups].map(([group, items]) => (
					<div>
						<p class="mt-4 mb-1.5 text-xs tracking-wider text-muted uppercase">{group}</p>
						<ul class="m-0 list-none p-0">
							{items.map((e) => (
								<li>
									<a
										class="block py-1 text-text-secondary hover:text-text aria-[current=page]:font-semibold aria-[current=page]:text-text"
										href={`${prefix}/docs/${e.data.slug}`}
										aria-current={e.data.slug === doc.data.slug ? "page" : undefined}
									>
										{e.data.title}
									</a>
								</li>
							))}
						</ul>
					</div>
				))
			}
		</nav>
		<article class="prose max-w-none min-w-0">
			{
				fallbackLocale && (
					<p class="rounded-md bg-[color-mix(in_srgb,#d9a400_15%,transparent)] px-3 py-2">
						This page is not translated yet; showing {fallbackLocale}.
					</p>
				)
			}
			{
				translations.length > 1 && (
					<p class="flex gap-3 text-sm">
						{translations.map((t) => (
							<a class="aria-[current=true]:font-bold" href={`${t.locale === "en" ? "" : `/${t.locale}`}/docs/${t.slug}`} aria-current={t.locale === locale ? "true" : undefined}>
								{t.locale}
							</a>
						))}
					</p>
				)
			}
			<h1 {...doc.edit.title}>{doc.data.title}</h1>
			{doc.data.description && <p class="lead">{doc.data.description}</p>}
			<div {...doc.edit.body}>
				<PortableText value={doc.data.body} />
			</div>
		</article>
	</div>
</Base>
```

- [ ] **Step 7: 构建，并验证扫描范围排除生效（用 canary 对照）**

```bash
npm test && npm run typecheck
printf '<div class="skew-x-12"></div>\n' > legacy/tw-canary.html
npm run build
command grep -rl 'skew-x-12' dist && echo "FAIL: legacy/ was scanned" || echo "OK: legacy/ excluded"
command grep -rl 'callout--tip' dist --include='*.css' >/dev/null && echo "OK: blocks.css bundled" || echo "FAIL: blocks.css missing"
command grep -rlE -- '--tw-prose-body: ?var\(--color-text\)' dist --include='*.css' >/dev/null && echo "OK: prose tokens" || echo "FAIL: prose tokens missing"
rm legacy/tw-canary.html
```

Expected: 三行都是 `OK`；前面的测试全部通过，typecheck 0 errors。

- [ ] **Step 8: 在页面上检查**

```bash
npx astro dev stop; npm run dev -- --port 4321; sleep 8
node scripts/check-page.mjs http://localhost:4321/docs/smoke-workerd 'class="prose' 'class="callout callout--tip"' --absent 'class="docs-nav'
```

Expected: exit 0。`prose` 容器已经渲染出来，旧的 scoped CSS class 已经不存在。

- [ ] **Step 9: 写规则，提交**

在 CLAUDE.md 的 `## Rules` 末尾加：

```markdown
- Styling is Tailwind 4 (`src/styles/global.css`, spec §11). Colors are the template tokens (`bg-surface`, `text-muted`, `border-border`, `text-brand`); never use the `dark:` variant, `light-dark()` already follows the theme toggle.
- Content HTML never carries classes. Markdown output is styled only by `prose` on the container and by the whitelisted-class selectors in `packages/web9-blocks/astro/blocks.css` (utilities layer). Never widen the sanitizer's class/style whitelist; any block prop that reaches a `class` attribute must be whitelisted (see `safeTone`).
```

```bash
git add -A src/ packages/ astro.config.mjs package.json package-lock.json CLAUDE.md
git status --short   # must not list .local/, .dev.vars, .wrangler/
git commit -m "feat: Tailwind 4 for docs pages and Web9 blocks

Template color tokens become Tailwind theme colors (light-dark, no dark:
variant); Markdown output is styled via prose and whitelisted-class rules in
the utilities layer, so the sanitizer whitelist stays as narrow as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 7: 推送 hot-tools 页面，第一次真实渲染所有块 🚦

**Files:** 不改代码。产出写进 spec §3。

**Interfaces:**
- Consumes: Task 1 的 CLI、Task 4 的脚本、Task 6 的 `data-w9-*` 属性
- Produces: 已发布的 `/docs/ai-tools-adhoc`。Task 10 和 Task 11 会接着用。

- [ ] **Step 1: 转换并发布**

```bash
node scripts/convert-mdx.mjs legacy/docs/ai/88-usecase/01_ai_hot_tools.mdx --section ai --category usecase --order 1 --lang zh > .local/hot-tools.json
node -e "const f='.local/hot-tools.json';const p=JSON.parse(require('fs').readFileSync(f,'utf8'));p.status='published';require('fs').writeFileSync(f,JSON.stringify(p))"
node scripts/mcp.mjs content_create @.local/hot-tools.json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(r.item.id,r.item.slug,r.item.status,r.item.data.body.length)"
```

Expected: 输出 `<id> ai-tools-adhoc published 51`。

- [ ] **Step 2: 🚦 每种块都渲染出来了**

```bash
node scripts/check-page.mjs http://localhost:4321/docs/ai-tools-adhoc \
  'data-w9-tabs' 'role="tablist"' 'data-w9-tools' 'data-w9-details' \
  'class="callout callout--' '<pre class="mermaid">' '<table' \
  '请注意，本站一切内容并不构成投资指导或建议' 'src="/img/' \
  --absent 'https://www.web9.ai/img/' 'Internal Server Error'
curl -s http://localhost:4321/docs/ai-tools-adhoc | node -e "
const h = require('fs').readFileSync(0, 'utf8');
const labels = [...h.matchAll(/role=\"tab\"[^>]*>\s*([^<]+?)\s*</g)].map((m) => m[1]);
const want = ['为啥学AI', '概念强化', '大模型', 'LLM使用心法', '幻相', '神通'];
console.log(JSON.stringify(labels) === JSON.stringify(want) ? 'tab order OK' : 'tab order WRONG ' + JSON.stringify(labels));"
curl -s -o /dev/null -w 'logo %{http_code}\n' http://localhost:4321/img/rag/ima.png
```

Expected: 第一条 exit 0；第二条输出 `tab order OK`；第三条输出 `logo 200`。如果某种块缺失或者页面返回 500，**停下来报告**，附上缺了哪个 marker 和 dev 日志。

- [ ] **Step 3: 记录，提交**

在 spec §3 末尾加一条：`- **已验证（计划 1 Task 7）**：\`ai-tools-adhoc\` 的 51 个块（9 callout、8 tool_grid、5 details、1 tabs、1 table、1 mermaid、2 investment_warning）在 workerd dev 里全部渲染出来；tab 顺序正确；图片走站内的 \`/img/\`。`

```bash
git add docs/superpowers/specs/
git commit -m "docs(spec): all Web9 blocks render in workerd (plan 1 task 7)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 8: 搜索能不能搜到块里的文字 🚦

回答 spec §4 的待验证项。结论决定 Task 9 做不做。

**Files:** 不改代码。产出写进 spec §4。

- [ ] **Step 1: 创建探针 doc。每个位置放一个独一无二的词**

Create `.local/search-probe.json`:

```json
{
	"collection": "docs",
	"slug": "search-probe",
	"status": "published",
	"data": {
		"title": "Search probe",
		"section": "dev",
		"sort_order": 0,
		"body": [
			{ "_type": "block", "_key": "p1", "style": "normal", "markDefs": [], "children": [{ "_type": "span", "_key": "s1", "text": "prose zqxproseaaa", "marks": [] }] },
			{ "_type": "callout", "_key": "c1", "tone": "info", "title": "t", "body": "callout zqxcalloutbbb" },
			{ "_type": "tabs", "_key": "t1", "default_tab": 1, "fullscreen": false, "tabs": [{ "label": "L", "body": "tab zqxtabccc" }] },
			{ "_type": "tool_grid", "_key": "g1", "tools": [{ "name": "zqxtoolddd", "url": "https://example.com", "featured": false }] },
			{
				"_type": "table", "_key": "tb1", "hasHeaderRow": true,
				"rows": [
					{ "_type": "tableRow", "_key": "r1", "cells": [{ "_type": "tableCell", "_key": "h1", "isHeader": true, "markDefs": [], "content": [{ "_type": "span", "_key": "x1", "text": "head", "marks": [] }] }] },
					{ "_type": "tableRow", "_key": "r2", "cells": [{ "_type": "tableCell", "_key": "d1", "isHeader": false, "markDefs": [], "content": [{ "_type": "span", "_key": "x2", "text": "zqxtableeee", "marks": [] }] }] }
				]
			}
		]
	}
}
```

```bash
node scripts/mcp.mjs content_create @.local/search-probe.json > .local/search-probe.created.json
```

- [ ] **Step 2: 🚦 逐个搜索**

```bash
for q in zqxproseaaa zqxcalloutbbb zqxtabccc zqxtoolddd zqxtableeee; do
  printf '%s ' $q
  node scripts/mcp.mjs search "{\"query\":\"$q\",\"collections\":[\"docs\"]}" | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log((r.items??[]).length)"
done
```

按结果决定下一步：

| `zqxproseaaa` | 块里的词（bbb/ccc/ddd/eee） | 结论 | 下一步 |
|---|---|---|---|
| 0 | — | 连正文都搜不到，是搜索本身坏了 | 🚦 **停下来报告**，附上 `_emdash_fts_docs` 表的检查结果（方法见 Task 5 Step 7） |
| ≥1 | 全部 ≥1 | core 已经索引了块里的文字 | 跳过 Task 9 |
| ≥1 | 有 0 的 | 块里的文字不进索引 | 做 Task 9；为 0 的那些块就是 Task 9 要覆盖的类型 |

- [ ] **Step 3: 记录，提交**

在 spec §4 把 `**待验证，结果会影响架构**：...` 这一条改成 `**已验证（计划 1 Task 8）**：` 加上实测结果，写明每个位置是否命中，以及是否需要 Task 9。

```bash
git add docs/superpowers/specs/
git commit -m "docs(spec): search coverage of block text measured (plan 1 task 8)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 9（条件执行：仅当 Task 8 判定块里的文字不进索引）：`search_text` hook

已经从源码确认的事实：
- native plugin 用 `definePlugin({ capabilities, hooks })` 声明 hook；
- `content:beforeSave` 需要 `content:write` 这个 capability，缺了 hook 会被静默跳过；
- **更新时 hook 只收到这次改动的字段**（`emdash-runtime.ts` 把 `bodyWithoutRev.data` 传给 hook），所以 body 没变的时候必须保持 `search_text` 不动；
- 字段定义没有 hidden 选项，所以在 label 里注明这是自动生成的。

**Files:**
- Create: `packages/web9-blocks/lib/search-text.mjs`、`packages/web9-blocks/lib/search-text.test.mjs`
- Modify: `packages/web9-blocks/index.mjs`、`seed/seed.json`、`seed/seed.test.mjs`、spec §4

**Interfaces:**
- Produces: `extractBlockText(body: unknown) → string`。参数可以是 PT 数组，也可以是 Markdown 字符串；`docs.search_text`（text, searchable）由 hook 写入。

- [ ] **Step 1: 写失败的测试**

Create `packages/web9-blocks/lib/search-text.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { extractBlockText } from "./search-text.mjs";

describe("extractBlockText", () => {
	it("collects text from non-core blocks and skips core blocks and non-text props", () => {
		const body = [
			{ _type: "block", _key: "p", children: [{ _type: "span", text: "core prose" }] },
			{ _type: "callout", _key: "c", tone: "tip", title: "Heads up", body: "callout **body**" },
			{ _type: "tabs", _key: "t", default_tab: 1, tabs: [{ label: "One", body: "tab body" }] },
			{ _type: "tool_grid", _key: "g", tools: [{ name: "Tool", tagline: "does things", url: "https://x", logo: "/img/x.png", featured: true }] },
		];
		expect(extractBlockText(body)).toBe("Heads up\ncallout **body**\nOne\ntab body\nTool\ndoes things");
	});
	it("reads table cell spans but not their marks", () => {
		const table = { _type: "table", _key: "tb", rows: [{ _type: "tableRow", _key: "r", cells: [{ _type: "tableCell", _key: "c", markDefs: [], content: [{ _type: "span", _key: "s", text: "cell", marks: ["strong"] }] }] }] };
		expect(extractBlockText([table])).toBe("cell");
	});
	it("passes Markdown bodies through (MCP accepts Markdown)", () => {
		expect(extractBlockText("# Title\n\ntext")).toBe("# Title\n\ntext");
	});
	it("returns an empty string for missing bodies", () => {
		expect(extractBlockText(undefined)).toBe("");
	});
});
```

Run: `npx vitest run packages/web9-blocks/lib/search-text.test.mjs`
Expected: FAIL，报 `Failed to load url ./search-text.mjs`。

- [ ] **Step 2: 实现 `extractBlockText`**

Create `packages/web9-blocks/lib/search-text.mjs`:

```js
// Flatten text inside non-core Portable Text blocks so full-text search can see it (spec §4).
// Core "block" nodes are skipped: EmDash indexes them already.
const SKIP_KEYS = new Set(["_type", "_key", "_version", "url", "logo", "tone", "lang", "marks", "markDefs"]);

function collect(value, out) {
	if (typeof value === "string") {
		if (value.trim()) out.push(value.trim());
	} else if (Array.isArray(value)) {
		for (const v of value) collect(v, out);
	} else if (value && typeof value === "object") {
		for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) collect(v, out);
	}
}

/** @param {unknown} body Portable Text array, or a Markdown string (MCP accepts both) */
export function extractBlockText(body) {
	if (typeof body === "string") return body;
	if (!Array.isArray(body)) return "";
	const out = [];
	for (const node of body) if (node && node._type !== "block") collect(node, out);
	return out.join("\n");
}
```

Run: `npx vitest run packages/web9-blocks/lib/search-text.test.mjs`
Expected: 4 个测试 PASS。

- [ ] **Step 3: 注册 hook，加字段**

在 `packages/web9-blocks/index.mjs` 顶部加 `import { extractBlockText } from "./lib/search-text.mjs";`，并把 `createPlugin` 替换成：

```js
export function createPlugin() {
	return definePlugin({
		id: ID,
		version: VERSION,
		// content:beforeSave is skipped without this capability
		capabilities: ["content:write"],
		hooks: {
			// Spec §4: core search does not index custom-block text; mirror it into docs.search_text.
			"content:beforeSave": async ({ content, collection }) => {
				// Updates pass only the changed fields; when body didn't change, keep search_text as is.
				if (collection !== "docs" || content.body === undefined) return content;
				return { ...content, search_text: extractBlockText(content.body) };
			},
		},
		admin: { portableTextBlocks: BLOCKS },
	});
}
```

在 seed 的 `docs.fields` 末尾追加字段，并让测试跟着改：

```bash
node -e '
const f = "seed/seed.json";
const s = JSON.parse(require("fs").readFileSync(f, "utf8"));
const docs = s.collections.find((c) => c.slug === "docs");
docs.fields = docs.fields.filter((x) => x.slug !== "search_text");
docs.fields.push({ slug: "search_text", label: "Search text (auto-generated, do not edit)", type: "text", searchable: true });
require("fs").writeFileSync(f, JSON.stringify(s, null, "\t") + "\n");
'
python3 - <<'EOF'
p = "seed/seed.test.mjs"
s = open(p).read()
old = '["title", "description", "section", "category", "sort_order", "body"]'
assert old in s
s = s.replace(old, '["title", "description", "section", "category", "sort_order", "body", "search_text"]')
s = s.replace('expect(f.body).toMatchObject({ type: "portableText", searchable: true });',
              'expect(f.body).toMatchObject({ type: "portableText", searchable: true });\n\t\texpect(f.search_text).toMatchObject({ type: "text", searchable: true });')
open(p, "w").write(s)
EOF
npm test
```

Expected: 全部 PASS。

在现有的本地库上建这个字段（seed 只在空库上生效），然后重启 dev，让插件代码生效：

```bash
node scripts/mcp.mjs schema_create_field '{"collection":"docs","slug":"search_text","label":"Search text (auto-generated, do not edit)","type":"text","searchable":true}'
npx astro dev stop; npm run dev -- --port 4321; sleep 8
```

- [ ] **Step 4: 🚦 重新保存探针 doc，再搜一次**

```bash
node scripts/mcp.mjs content_get '{"collection":"docs","id":"search-probe"}' > .local/probe-get.json
node -e "
const g = JSON.parse(require('fs').readFileSync('.local/probe-get.json', 'utf8'));
require('fs').writeFileSync('.local/probe-update.json', JSON.stringify({ collection: 'docs', id: g.item.id, _rev: g._rev, data: { body: g.item.data.body } }));"
node scripts/mcp.mjs content_update @.local/probe-update.json > /dev/null
node scripts/mcp.mjs content_get '{"collection":"docs","id":"search-probe"}' | node -e "
const g = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log('status', g.item.status, '| search_text:', JSON.stringify(g.item.data.search_text));"
for q in zqxcalloutbbb zqxtabccc zqxtoolddd zqxtableeee; do
  printf '%s ' $q
  node scripts/mcp.mjs search "{\"query\":\"$q\",\"collections\":[\"docs\"]}" | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log((r.items??[]).length)"
done
```

Expected: `search_text` 里包含 4 个探针词，4 次搜索都 ≥1。

如果 `status` 显示有待发布的草稿（`content_update` 在支持 drafts 的 collection 上可能只更新草稿），先发布再搜：`node scripts/mcp.mjs content_publish "{\"collection\":\"docs\",\"id\":\"search-probe\",\"_rev\":\"<content_get 返回的 _rev>\"}"`。把这个行为记进 Task 10 的 skill。

如果发布之后还是搜不到，先排除一个已知的坑：通过 MCP 在已有的库上加字段，可能不会扩展全文索引表（同一个原因下，MCP 建的 collection 连索引表都没有，见 Task 3）。`search_text` 已经写进 seed，所以正确的做法是用 seed 重建本地库：

```bash
npx astro dev stop; rm -rf .wrangler/state; npm run dev -- --port 4321; sleep 8
curl -s -X POST 'http://localhost:4321/_emdash/api/setup/dev-bypass?token=1&content=0' > .local/bypass.json
node -e "const d=require('./.local/bypass.json');require('fs').writeFileSync('.local/dev-token',d.data.token)"
node scripts/mcp.mjs content_create @.local/search-probe.json > /dev/null
```

然后重跑上面的 4 次搜索，不需要再走 `content_update`，因为 create 也会触发 hook。由 seed 建的库仍然搜不到时，才**停下来报告**。重建之后，Task 5 的冒烟 doc 和 Task 7 的 hot-tools 页面都没了（Task 11 还要用 hot-tools），按 Task 5 Step 8 和 Task 7 Step 1 的命令重新推一次。

- [ ] **Step 5: 记录，提交**

在 spec §4 的结论下面补一句：`search_text` hook 已实现并验证；已有内容需要重新保存一次才会生成 `search_text`（计划 2 的迁移会自然覆盖）。

```bash
git add packages/web9-blocks/ seed/ docs/superpowers/specs/
git commit -m "feat(blocks): mirror custom-block text into docs.search_text

Core search does not index custom-block text (plan 1 task 8); a
content:beforeSave hook flattens it into a searchable field. Partial updates
without body leave search_text unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 10: AI 只靠 MCP 写一篇 doc 并发布 → `web9-blocks` skill 🚦

回答 spec §8 的待验证项。实测结果写成 AI 以后照着用的 cookbook。

计划阶段已经观察到（Node 版 POC，2026-10-15）：Markdown 里不带 `_key` 的 `<!--ec:block {...} -->` 会**原样**存进去，存下来的块也没有 `_key`，但页面能正常渲染。下面的 Step 2 在 workerd 上复测，并检查后台编辑器是否需要 `_key`（Task 11）。

**Files:**
- Create: `.agents/skills/web9-blocks/SKILL.md`
- Modify: spec §8、`AGENTS.md`（加一行指向这个 skill）

- [ ] **Step 1: 用 Markdown 加 `ec:block` 写一篇**

Create `.local/ai-e2e.md`（这就是 AI 实际会发出去的正文）:

```markdown
## 为什么要用 AI 写文档

这一段是普通 Markdown，带 **粗体** 和 [链接](https://www.web9.ai)。

- 列表项一
- 列表项二

<!--ec:block {"_type":"callout","_key":"e2e-callout","tone":"tip","title":"提示","body":"callout 正文支持 **Markdown**。"} -->

<!--ec:block {"_type":"callout","tone":"warning","title":"没有 _key 的块","body":"测试 runtime 会不会补 key。"} -->

<!--ec:block {"_type":"tabs","_key":"e2e-tabs","default_tab":1,"fullscreen":false,"tabs":[{"label":"Claude","body":"第一个 tab"},{"label":"Gemini","body":"第二个 tab"}]} -->

<!--ec:block {"_type":"table","_key":"e2e-table","hasHeaderRow":true,"rows":[{"_type":"tableRow","_key":"r1","cells":[{"_type":"tableCell","_key":"c11","isHeader":true,"markDefs":[],"content":[{"_type":"span","_key":"s11","text":"工具","marks":[]}]},{"_type":"tableCell","_key":"c12","isHeader":true,"markDefs":[],"content":[{"_type":"span","_key":"s12","text":"用途","marks":[]}]}]},{"_type":"tableRow","_key":"r2","cells":[{"_type":"tableCell","_key":"c21","isHeader":false,"markDefs":[],"content":[{"_type":"span","_key":"s21","text":"Claude","marks":[]}]},{"_type":"tableCell","_key":"c22","isHeader":false,"markDefs":[],"content":[{"_type":"span","_key":"s22","text":"写作","marks":[]}]}]}]} -->

结尾段落。
```

```bash
node -e "
const body = require('fs').readFileSync('.local/ai-e2e.md', 'utf8');
require('fs').writeFileSync('.local/ai-e2e.json', JSON.stringify({ collection: 'docs', slug: 'ai-e2e', status: 'published',
  data: { title: 'AI e2e', description: 'Written by an agent over MCP', section: 'dev', category: 'meta', sort_order: 99, body } }));"
node scripts/mcp.mjs content_create @.local/ai-e2e.json > .local/ai-e2e.created.json
```

- [ ] **Step 2: 🚦 检查存下来的结构和页面**

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('.local/ai-e2e.created.json', 'utf8'));
for (const b of r.item.data.body) console.log(b._type.padEnd(10), '_key=' + (b._key ?? '(none)'), b.style ?? b.listItem ?? '');
console.log('status', r.item.status);"
node scripts/check-page.mjs http://localhost:4321/docs/ai-e2e \
  '<h2' '<strong>粗体</strong>' '<li' 'class="callout callout--tip"' 'class="callout callout--warning"' \
  'data-w9-tabs' '<table' '>写作<' '结尾段落' --absent 'ec:block'
```

Expected:
- 第一条列出 `block`（h2、正文、列表）、`callout` ×2、`tabs`、`table`，`status published`；
- 第二条 exit 0。

记下两件事，Step 3 要用：
- (a) 没写 `_key` 的 callout，存下来有没有 `_key`；
- (b) table 能不能通过 `ec:block` 写进去。

如果 table 或任何一个块没有出现在页面上，**停下来报告**。

- [ ] **Step 3: 写 skill**

Create `.agents/skills/web9-blocks/SKILL.md`。下面是完整内容。`{{KEY_RULE}}` 按 Step 2 的 (a) 选一句替换：
- 存下来没有 `_key`：`Always include a unique "_key" in every ec:block JSON: keyless blocks are stored without one, and the admin editor relies on keys.`
- 存下来自动补了 `_key`：`"_key" is optional (the runtime assigns one), but include it when you will later update that block by key.`

````markdown
---
name: web9-blocks
description: Write and publish Web9.AI docs through the EmDash MCP server, including Web9 custom blocks (callout, tabs, details, mermaid, tool_grid, investment_warning) and core tables. Use whenever an agent creates or edits site content.
---

# Writing Web9.AI content over MCP

Endpoint: `<site>/_emdash/api/mcp` with `Authorization: Bearer <token>`. In this repo: `node scripts/mcp.mjs <tool> '<json>'`.

## Create and publish a doc

`content_create` stores a **draft** unless you pass `"status": "published"`.

```json
{ "collection": "docs", "slug": "my-doc", "status": "published", "locale": "en",
  "data": { "title": "…", "description": "…", "section": "ai", "category": "usecase", "sort_order": 10, "body": "<markdown>" } }
```

- `section` is `ai` or `dev`. `sort_order` orders the sidebar within a category.
- Chinese translation of an existing doc: same payload with `"locale": "zh-CN"` and `"translationOf": "<id of the en doc>"`.
- Updating: `content_get` (accepts the slug as `id`) → `content_update` with `id`, `_rev` from the get, and only the changed `data` fields. If the doc keeps a pending draft afterwards, call `content_publish` with the new `_rev`.
- Undo: `revision_list` → `revision_restore`.

## Body = Markdown + block lines

`body` may be a Markdown string. Headings, paragraphs, bold/italic, links, lists and code fences convert automatically. Markdown **tables and `:::` admonitions do not**: use blocks.

Insert a block with its own line, JSON on one line:

```
<!--ec:block {"_type":"callout","_key":"tip-1","tone":"tip","title":"…","body":"Markdown here"} -->
```

{{KEY_RULE}}

## Block reference

Markdown-valued fields (`body`, tab `body`, `tagline`) support GFM, `:::tip Title … :::` admonitions and ```` ```mermaid ```` fences. Raw HTML is sanitized: inline `style` keeps only cosmetic properties (no `position`, no `url()`), and `class`/`id` are removed. Do not try to style content with classes.

| Block | JSON |
|---|---|
| callout | `{"_type":"callout","_key":"…","tone":"note\|tip\|info\|warning\|danger\|caution","title":"…","body":"md"}` |
| tabs | `{"_type":"tabs","_key":"…","default_tab":1,"fullscreen":false,"tabs":[{"label":"…","body":"md"}]}` |
| details | `{"_type":"details","_key":"…","summary":"…","body":"md"}` |
| mermaid | `{"_type":"mermaid","_key":"…","code":"graph TD; A-->B"}` |
| tool_grid | `{"_type":"tool_grid","_key":"…","title":"…","logo_size":72,"tools":[{"name":"…","tagline":"md","logo":"/img/…png","url":"https://…","featured":false}]}` |
| investment_warning | `{"_type":"investment_warning","_key":"…","lang":"zh\|en"}` |
| table (core) | `{"_type":"table","_key":"…","hasHeaderRow":true,"rows":[{"_type":"tableRow","_key":"…","cells":[{"_type":"tableCell","_key":"…","isHeader":true,"markDefs":[],"content":[{"_type":"span","_key":"…","text":"…","marks":[]}]}]}]}` |

- Table cells hold text spans only (marks: `strong`, `em`, `code`, `strike-through`, or a `link` markDef key). Put logos in a `tool_grid`, not a table.
- Images: site images are `/img/...` paths; new uploads go through `media_upload` and are referenced by the returned URL.

## Checks after publishing

Open `<site>/docs/<slug>` (or `/zh-CN/docs/<slug>`) and confirm every block rendered. `search` with `{"query":"…","collections":["docs"]}` should find the doc.
````

如果 Step 2 发现 table **不能**通过 `ec:block` 写入，就把 skill 里 table 那一行改成："tables: send `body` as a Portable Text JSON array instead of Markdown"，并附上 Task 8 探针里那份 table JSON 作为例子。

在 `AGENTS.md` 末尾加：`- Writing or editing site content over MCP: read \`.agents/skills/web9-blocks/SKILL.md\` first.`

- [ ] **Step 4: 记录，提交**

spec §8：把 `- **待验证**：让 agent 只通过 MCP...` 改成 `- **已验证（计划 1 Task 10）**：` 加上实测结果，写明 (a) 和 (b) 的结论，并注明 cookbook 在 `.agents/skills/web9-blocks/SKILL.md`。

```bash
git add .agents/skills/web9-blocks/ AGENTS.md docs/superpowers/specs/
git commit -m "docs(skill): web9-blocks cookbook for MCP authoring, verified end to end

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

### Task 11: 后台编辑 repeater 里的多行字段（需要浏览器）🚦

回答 spec §3 的待验证项。这一步需要用户在 ChromeDev 里打开一个标签页，所以放在最后，前面的任务都能无人值守地跑完。

**Files:** 不改代码。产出写进 spec §3，必要时补进 skill。

- [ ] **Step 1: 连接用户已经打开的 Chrome**

先通过 ToolSearch 加载 `mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_pages`、`select_page`、`navigate_page`、`take_snapshot`、`take_screenshot`、`click`、`fill`、`press_key`。

调用 `list_pages`。如果没有可以使用的标签页（比如一个空白页，或者 localhost 的页面），**请用户在 ChromeDev（端口 9222）里打开一个空白标签页**，然后等用户确认。不要调用 `new_page`。

- [ ] **Step 2: 登录后台，打开 hot-tools doc**

1. `select_page` 选中那个标签页；
2. `navigate_page` 打开 `http://localhost:4321/_emdash/api/auth/dev-bypass?redirect=/_emdash/admin`；
3. `take_snapshot` 确认已经进入后台；
4. 在内容列表里进入 Docs，打开 `ai-tools-adhoc`（标题是 "Adhoc GenAI Tools"）。

- [ ] **Step 3: 🚦 修改一个 tool_grid 工具的多行 tagline**

1. 在编辑器里找到第一个 `tool_grid` 块，打开它的编辑弹窗；
2. 展开第一个工具（"IMA知识库"），把 tagline 改成两行：`第一行` 回车 `第二行`；
3. 保存弹窗，再保存或发布文档；
4. 每一步都 `take_screenshot`。

然后核对：

```bash
node scripts/mcp.mjs content_get '{"collection":"docs","id":"ai-tools-adhoc"}' | node -e "
const g = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const t = g.item.data.body.find((b) => b._type === 'tool_grid').tools[0];
console.log(JSON.stringify(t.tagline));"
```

Expected: 输出 `"第一行\n第二行"`；页面上这个工具的 tagline 显示为两行（ToolGrid 会把 `\n` 渲染成 `<br>`）。

另外检查 Task 10 里那个没有 `_key` 的 callout：在后台打开 `ai-e2e`，看看它能不能正常编辑并保存。把结果补进 skill 的 `_key` 规则。

如果弹窗里没有多行输入框、回车直接提交了表单，或者保存后换行丢了，这不是阻断性问题，但会影响编辑体验。记录下来，在计划 2 里决定怎么处理，比如改成用 `details` 块，或者等上游修复。只有后台**完全不能编辑**这个块时，才**停下来报告**。

- [ ] **Step 4: 记录，提交**

spec §3：把 `- **待验证**：repeater 里的多行 \`text_input\`...` 改成 `- **已验证（计划 1 Task 11）**：` 加上结果（附截图描述）。

```bash
git add docs/superpowers/specs/ .agents/skills/web9-blocks/
git commit -m "docs(spec): admin editing of repeater multiline fields checked (plan 1 task 11)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011CM2M8CtmWZL78rmqfc7gB"
```

---

## 计划 1 完成标准

- `npm test`、`npm run typecheck`、`npm run build` 全部通过；
- spec 里 §1、§3（两处）、§4、§8 的待验证项都改成了"已验证"，并写明实测结果；
- 所有关口都通过。如果有没通过的，已经停下来向用户报告，并得到了决定。

完成后**不要直接开始计划 2**：先向用户汇报关口结果，再按结果写计划 2。

## 计划 2 路线图（不在本计划内，等关口结果出来再写）

1. **迁移 runner** `scripts/migrate.mjs`：
   - 用 `convertMdx` 加 `callTool`，遍历 `legacy/docs/**` 和 `legacy/i18n/zh-CN/docusaurus-plugin-content-docs/current/**`；
   - 先写 en，再写 zh-CN，用 `translationOf` 关联；
   - 按 slug 用 `content_get` 判断条目是否已存在：存在就带 `_rev` 调 `content_update`，不存在就 `content_create`，保证可以重复运行；
   - slug 重名时加前缀；
   - 跑完后批量检查页面（`check-page`）。
2. **Blog** 迁到 `posts`：`draft: true` 的保持草稿；tags 映射到 `tag` taxonomy。
3. **首页**：
   - seed 里加 `blockTypes`（`hero`、`feature_grid`）和 `pages.layout` 字段；
   - 写 `src/components/blocks/` 下的渲染组件；
   - `/` 读取 `pages/home`。
4. **模板页面改成 Tailwind**：`Base.astro`、blog 列表、文章页；去掉 `tokens.css` 里剩下的 token。
5. **给 AI 读的入口**：`/llms.txt`；可选 `/docs/{slug}.md`；在布局里加 core 的 `WebMcpSearch`（spec §4 建议）。
6. **部署**：
   - 在 Workers Builds 连接仓库，生产分支用 `emdash`；
   - 确认 D1 和 R2 是由 wrangler 自动创建，还是需要先手动创建；
   - 首次部署前备份 `EMDASH_ENCRYPTION_KEY`；
   - 在 `*.workers.dev` 上验证；
   - 对生产跑迁移；
   - 合并到 `main`，生产分支改成 `main`，绑定 `www.web9.ai`；
   - 确认预览环境是否和生产共用 binding。
7. **AI 账号**：owner 在后台邀请一个 Editor 账号，用 passkey 注册，再创建 PAT（spec §8）。

### 计划 1 遗留，计划 2 必须处理

- **安全关口（建 AI Editor 账号之前）**：web9 自己的 `htmlBlock` renderer（去掉 class/id，`isolated` 交给 core）；构建后扫描公开页面加载的 CSS 的 denylist（`.fixed{`、`.inset-`、`.z-[0-9]`、`-screen{`、`-dvh{`）。不能直接扫 `dist/client/_astro/*.css`：emdash 后台的 `styles.*.css` 也在那里，自带这些类，只给 `/_emdash/admin` 用，第一次跑就会失败；计划 2 的模板改造如果在 `src/` 里合法用到 `fixed`（或 `inset-`、`z-`、`-screen`、`-dvh` 这类；`sticky` 不在 denylist 里，`DocsPage.astro` 已经在用 `md:sticky`），denylist 要配一个显式 allowlist，而 allowlist 里的类只剩 `htmlBlock` renderer 覆盖这一道防线；renderer 覆盖也要管住迁移产生的 `htmlBlock`：`convertMdx` 会把 legacy MDX 里的原始 HTML 转成 `htmlBlock`，带着原来的 class；收紧 `SAFE_VALUE`（函数名 allowlist，拒绝 `//`，覆盖 `image-set()`、超大 `box-shadow`/负 `margin`）。
- **明暗切换**：生产构建把 `light-dark()` 降级，手动切换失效。两种修法：调高 `build.cssTarget`/lightningcss targets（Chrome 123、Safari 17.5、Firefox 120，放弃旧浏览器，由 owner 决定），或改成 `:root.light`/`.dark` 显式 token。验收：构建产物里 `--lightningcss-light` 为 0。
- **部署绑定**：D1 `database_id`、R2、adapter 注入的 KV `SESSION` 和 `IMAGES`；构建产物的 worker 体积对照免费额度；用 workerd 跑一次构建产物。
- **已有库加字段的顺序**：如果生产库不是用 seed 从空库建的，先 `schema_create_field search_text`，再上线带 hook 的插件（hook 的 `errorPolicy` 是 abort）。
- **迁移 runner**：`convertMdx` 对 35 个 legacy 文件会产出 14 个 `htmlBlock`，多数是没转换的 JSX 组件（`<MDXTemplate>`、`<YouTube … />`、`<AlignedText>` 和它的闭合标签），另外 9 个来自 `01_tools-summary.mdx`，带 JSX 的 `className=`（不是 `class=`）。converter 要么把这些组件转成对应的块，要么明确报出来，不能悄悄存成 `htmlBlock`；`_key` 改成确定性（slug + 位置的 hash），否则每次重跑都产生新 revision；`section`/`category`/`sort_order` 从 `legacy/docs/{ai,dev}/NN-dir/NN_file` 路径推导（只有 2/28 个文件有 `sidebar_position`；现在的 converter 把 `legacy/docs/dev/00_overview.md` 算成 `section: "ai"`，是错的）；行内 HTML token 会变成字面文字（`01_tools-summary.mdx` 里 27 个 `<span>`）；`:::`、`<details>`、`<Tabs>` 内部的 `collectUntil` 还不识别代码块（块里的代码块含 `:::` 会提前结束）；迁移完成后通过 MCP 给 `primary` 菜单加 AI、Dev 两项（seed 里只放了 Blog、GitHub，因为 doc slug 要等 runner 定下来）；`23_learn_ai_coding.mdx` 里 `<details>` 套 `<Tabs>` 的转换；golden test 不再读 `legacy/`（cutover 删掉它之前换成 fixture）。
- **搜索**：头部 LiveSearch 和 `/search` 都只搜当前语言的条目（`Astro.currentLocale`），所以 zh-CN 页面上搜不到还没翻译的 en doc；要么传 `locale={null}` 并按 translation group 去重，要么接受；`htmlBlock` 的文字 core 和 hook 都不索引；`posts` 里的 `:::` callout 文字不进搜索（决定给 `posts` 加 `search_text` 还是接受）；core `snippet()` 固定取第 2 列，块里命中时摘要显示标题。
- **样式小问题**：`prose` 给行内 `code` 加反引号；docs 侧栏分组标签 `text-muted` 对比度不够 AA；ToolGrid 的 `object-contain` 被 preflight 的 `height:auto` 抵消；callout/tabs 里的站内链接也被强制 `target="_blank"`。
- **SEO**：docs 页面没有 `rel="canonical"`，zh-CN fallback 页（200，正文是 en）和 en URL 内容重复；有 `fallbackLocale` 时让 `DocsPage` 把 en URL 作为 `canonical` 传给 `Base`。`/pages/<不存在>` 仍然 302 到 `/404`，改成 `Astro.rewrite`。
- **依赖清理**：`astro` 版本下限提到 `^7.4.0`（adapter 的 peer）；删掉没用到的 `@cloudflare/workers-types`。
