import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { guardPortableText } from "../../packages/web9-blocks/lib/pt-guard.mjs";
import { convertMdx } from "./mdx-to-pt.mjs";
import { numberPrefix, readLegacyTree } from "./legacy-tree.mjs";

describe("numberPrefix", () => {
	it.each([
		["08-cloud", 8, "cloud"],
		["00_guide", 0, "guide"],
		["01-run_diffusion", 1, "run_diffusion"],
		["01_3d", undefined, "01_3d"],
		["model", undefined, "model"],
	])("%s", (name, position, rest) => expect(numberPrefix(name)).toEqual({ position, name: rest }));
});

describe("readLegacyTree on a small tree", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "legacy-tree-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));
	const write = (rel, text) => {
		mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		writeFileSync(path.join(dir, rel), text);
	};
	write("en/ai/intro.md", "---\nsidebar_position: 1\n---\n# Intro\n");
	write("en/ai/guide.md", "# Guide\n");
	write("en/ai/05-cloud/_category_.yml", "position: 100 # comment\nlabel: 'Cloud'\n");
	write("en/ai/05-cloud/02-b.mdx", "# B\n[a](./a)\n");
	write("en/ai/05-cloud/01-a.mdx", "---\nslug: /a-top\n---\n# A\n");
	write("en/ai/07-misc/x.mdx", "# X\n");
	write("en/ai/07-misc/x.mdx.bak", "not a doc\n");
	write("en/dev/guide.md", "# Dev guide\n");
	write("zh/ai/05-cloud/02-b.mdx", "# 乙\n");
	write("zh/ai/05-cloud/_category_.yml", "label: 云\n");
	const tree = readLegacyTree({ enRoot: path.join(dir, "en"), zhRoot: path.join(dir, "zh") });
	const by = (locale, rel) => tree.docs.find((d) => d.locale === locale && d.rel === rel);

	it("orders like the Docusaurus sidebar and encodes it in sort_order", () => {
		expect(tree.docs.filter((d) => d.locale === "en").map((d) => `${d.rel}=${d.sortOrder}`)).toEqual([
			"ai/intro.md=1000", // sidebar_position 1
			"ai/07-misc/x.mdx=2001", // folder prefix 7
			"ai/05-cloud/01-a.mdx=3001", // _category_ position 100
			"ai/05-cloud/02-b.mdx=3002",
			"ai/guide.md=4000", // no position: last
			"dev/guide.md=1001000",
		]);
	});
	it("derives category, slugs (de-duplicated), old and new URLs", () => {
		expect(by("en", "ai/guide.md")).toMatchObject({ section: "ai", category: "general", slug: "ai-guide", oldUrl: "/ai/guide" });
		expect(by("en", "dev/guide.md")).toMatchObject({ section: "dev", slug: "dev-guide", newUrl: "/docs/dev-guide" });
		expect(by("en", "ai/05-cloud/01-a.mdx")).toMatchObject({ category: "cloud", slug: "a-top", oldUrl: "/a-top" });
		expect(by("en", "ai/05-cloud/02-b.mdx")).toMatchObject({ slug: "b", oldUrl: "/ai/cloud/b" });
		expect(by("zh-CN", "ai/05-cloud/02-b.mdx")).toMatchObject({ slug: "b", sortOrder: 3002, oldUrl: "/zh-CN/ai/cloud/b", newUrl: "/zh-CN/docs/b" });
		expect(tree.categories).toEqual({ cloud: { label: "Cloud", zhLabel: "云" }, misc: { label: "misc" } });
		expect(tree.docs.some((d) => d.rel.endsWith(".bak"))).toBe(false);
	});
	it("resolves links by URL, by file path and per locale", () => {
		const b = by("en", "ai/05-cloud/02-b.mdx");
		// a relative URL resolves against the page URL /ai/cloud/b: /ai/cloud/a is not a page (a lives at /a-top)
		expect(tree.resolveLink("./a", b)).toBe("./a");
		expect(tree.unresolved).toEqual(["ai/05-cloud/02-b.mdx: ./a"]);
		tree.unresolved.length = 0;
		expect(tree.resolveLink("../07-misc/x.mdx#top", b)).toBe("/docs/x#top");
		expect(tree.resolveLink("/a-top", b)).toBe("/docs/a-top");
		expect(tree.resolveLink("/ai/cloud/b", by("zh-CN", "ai/05-cloud/02-b.mdx"))).toBe("/zh-CN/docs/b");
		for (const href of ["https://x.example/a", "#anchor", "/img/a.png", "mailto:a@b.c"]) expect(tree.resolveLink(href, b)).toBe(href);
		expect(tree.unresolved).toEqual([]);
	});
});

describe("link fragments and queries", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "legacy-tree-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));
	const write = (rel, text) => {
		mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		writeFileSync(path.join(dir, rel), text);
	};
	write("en/ai/05-cloud/01-a.mdx", "# A\n");
	write("en/ai/05-cloud/02-b.mdx", "# B\n");
	write("en/ai/16-prompt/01-p.mdx", "---\nslug: guides\n---\n# P\n");
	write("zh/ai/05-cloud/02-b.mdx", "# 乙\n");
	const tree = readLegacyTree({ enRoot: path.join(dir, "en"), zhRoot: path.join(dir, "zh") });
	const b = tree.docs.find((d) => d.locale === "en" && d.slug === "b");
	const zhB = tree.docs.find((d) => d.locale === "zh-CN" && d.slug === "b");

	it("keeps the fragment on a relative URL link", () => {
		expect(tree.resolveLink("./a#x", b)).toBe("/docs/a#x");
		expect(tree.resolveLink("./a/#x", b)).toBe("/docs/a#x");
		expect(tree.resolveLink("./a#x", zhB)).toBe("/zh-CN/docs/a#x");
	});
	it("keeps the fragment on a relative file link", () => {
		expect(tree.resolveLink("../16-prompt/01-p.mdx#y", b)).toBe("/docs/guides#y");
		expect(tree.resolveLink("../16-prompt/01-p.mdx#y", zhB)).toBe("/zh-CN/docs/guides#y");
	});
	it("keeps the fragment on an absolute link", () => {
		expect(tree.resolveLink("/ai/cloud/a#x", b)).toBe("/docs/a#x");
	});
	it("keeps a query and a fragment, and cuts at the first # only", () => {
		expect(tree.resolveLink("./a?tab=1#x", b)).toBe("/docs/a?tab=1#x");
		expect(tree.resolveLink("../16-prompt/01-p.mdx?tab=1", b)).toBe("/docs/guides?tab=1");
		expect(tree.resolveLink("./a#x#y", b)).toBe("/docs/a#x#y");
	});
	it("reports an unknown target with its fragment", () => {
		expect(tree.resolveLink("./nope#x", b)).toBe("./nope#x");
		expect(tree.unresolved).toEqual(["ai/05-cloud/02-b.mdx: ./nope#x"]);
	});
});

describe.skipIf(!existsSync("legacy/docs"))("readLegacyTree on legacy/", () => {
	const tree = readLegacyTree();
	const en = tree.docs.filter((d) => d.locale === "en");
	const zh = tree.docs.filter((d) => d.locale === "zh-CN");

	it("lists 26 en docs in sidebar order and 9 zh-CN translations", () => {
		expect(en.map((d) => `${d.slug}:${d.section}/${d.category}:${d.sortOrder}`)).toEqual([
			"intro:ai/general:1000",
			"guide:ai/usecase:2001",
			"ai-tools-adhoc:ai/usecase:2002",
			"tools-summary:ai/usecase:2003",
			"ai-product-ideas:ai/article:3001",
			...["rundiffusion", "replicate", "qblock", "monster_api", "lambda", "javis", "paperspace", "latitude", "baseten", "banana", "modal", "datacrunch", "ovhcloud", "runpod", "huggingface", "fullstack"].map(
				(s, i) => `${s}:ai/cloud:${4001 + i}`,
			),
			"prompt-guides:ai/prompt:5001",
			"llm:ai/model:6001",
			"3d:ai/model:6002",
			"overview:dev/general:1001000",
			"learn_ai_coding:dev/general:1002000",
		]);
		expect(zh.map((d) => d.slug).sort()).toEqual(["ai-product-ideas", "guide", "intro", "learn_ai_coding", "monster_api", "prompt-guides", "qblock", "replicate", "rundiffusion"]);
		for (const d of zh) expect(en.find((e) => e.rel === d.rel)).toMatchObject({ slug: d.slug, sortOrder: d.sortOrder });
	});
	it("knows the old URLs, including absolute and relative frontmatter slugs and 01_3d", () => {
		const old = Object.fromEntries(en.map((d) => [d.slug, d.oldUrl]));
		expect(old).toMatchObject({
			rundiffusion: "/rundiffusion",
			qblock: "/ai/cloud/qblock",
			"prompt-guides": "/ai/prompt/prompt-guides",
			"ai-tools-adhoc": "/ai/usecase/ai-tools-adhoc",
			"3d": "/ai/model/01_3d",
			intro: "/ai/intro",
			overview: "/dev/overview",
		});
		expect(new Set(en.map((d) => d.oldUrl)).size).toBe(en.length);
	});
	it("has the category labels, including the intended zh label", () => {
		expect(tree.categories).toEqual({
			usecase: { label: "Use Case", zhLabel: "神兵利器" },
			article: { label: "Articles" },
			cloud: { label: "Cloud" },
			prompt: { label: "Prompt Engineering" },
			model: { label: "Model" },
		});
	});
	it("resolves every internal link in the corpus", () => {
		for (const d of tree.docs) {
			const { data } = convertMdx(readFileSync(d.file, "utf8"), { path: d.file, slug: d.slug, rewriteHref: (h) => tree.resolveLink(h, d) });
			expect(guardPortableText(data.body)).toEqual([]);
		}
		expect(tree.unresolved).toEqual([]);
		const qblock = tree.docs.find((d) => d.locale === "zh-CN" && d.slug === "monster_api");
		expect(tree.resolveLink("./qblock", qblock)).toBe("/zh-CN/docs/qblock");
		expect(tree.resolveLink("/ai/usecase/ai-tools-adhoc", { rel: "blog/x/index.mdx", locale: "en" })).toBe("/docs/ai-tools-adhoc");
	});
});
