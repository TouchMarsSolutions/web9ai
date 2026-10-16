import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { guardPortableText } from "../../packages/web9-blocks/lib/pt-guard.mjs";
import { convertMdx } from "./mdx-to-pt.mjs";
import { numberPrefix, readLegacyTree } from "./legacy-tree.mjs";

/** Temp en/zh roots holding `{ "en/ai/x.md": "text" }` files, removed after the file's tests (call it inside a describe). */
function fixture(files) {
	const dir = mkdtempSync(path.join(tmpdir(), "legacy-tree-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		writeFileSync(path.join(dir, rel), text);
	}
	return { enRoot: path.join(dir, "en"), zhRoot: path.join(dir, "zh") };
}
const message = (fn) => {
	try {
		fn();
	} catch (e) {
		return e.message;
	}
};

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
		// its own tree: `unresolved` is per tree, so the other tests cannot leave entries behind
		const own = readLegacyTree({ enRoot: path.join(dir, "en"), zhRoot: path.join(dir, "zh") });
		const pick = (locale, rel) => own.docs.find((d) => d.locale === locale && d.rel === rel);
		const b = pick("en", "ai/05-cloud/02-b.mdx");
		// a relative URL resolves against the page URL /ai/cloud/b: /ai/cloud/a is not a page (a lives at /a-top)
		expect(own.resolveLink("./a", b)).toBe("./a");
		expect(own.unresolved).toEqual(["ai/05-cloud/02-b.mdx: ./a"]);
		own.unresolved.length = 0;
		expect(own.resolveLink("../07-misc/x.mdx#top", b)).toBe("/docs/x#top");
		expect(own.resolveLink("/a-top", b)).toBe("/docs/a-top");
		expect(own.resolveLink("/ai/cloud/b", pick("zh-CN", "ai/05-cloud/02-b.mdx"))).toBe("/zh-CN/docs/b");
		for (const href of ["https://x.example/a", "#anchor", "/img/a.png", "mailto:a@b.c"]) expect(own.resolveLink(href, b)).toBe(href);
		expect(own.unresolved).toEqual([]);
	});
});

describe("readLegacyTree errors and slug context", () => {
	const zhOnly = fixture({ "en/ai/intro.md": "# Intro\n", "zh/ai/only-zh.md": "# 只有中文\n" });
	const nested = fixture({ "en/ai/05-cloud/sub/x.md": "# X\n" });
	const duplicate = fixture({ "en/ai/05-cloud/01-a.mdx": "# A\n", "en/ai/05-cloud/a.mdx": "# A again\n" });
	const context = fixture({
		"en/ai/05-cloud/x.md": "# X\n",
		"en/dev/05-cloud/x.md": "# X\n",
		"en/ai/z.md": "# Z\n",
		"en/dev/01-ai/z.md": "# Z\n",
	});

	it("rejects a zh-CN file that has no en original", () => {
		expect(message(() => readLegacyTree(zhOnly))).toBe(`${zhOnly.zhRoot}/ai/only-zh.md has no en original; Docusaurus ignored it, so does the migration`);
	});
	it("rejects categories nested more than one level", () => {
		expect(message(() => readLegacyTree(nested))).toBe("ai/05-cloud/sub/x.md: categories nested more than one level are not supported");
	});
	it("rejects a slug that is still a duplicate after the category and section prefixes", () => {
		expect(message(() => readLegacyTree(duplicate))).toBe('slug "ai-cloud-a" is still not unique; rename a file or set a frontmatter slug');
	});
	it("adds category and section context to a colliding group, never to a unique slug", () => {
		const slugs = readLegacyTree(context).docs.map((d) => `${d.rel}=${d.slug}`);
		expect(slugs.sort()).toEqual(["ai/05-cloud/x.md=ai-cloud-x", "ai/z.md=ai-root-z", "dev/01-ai/z.md=dev-ai-z", "dev/05-cloud/x.md=dev-cloud-x"]);
	});
});

describe("link fragments and queries", () => {
	const tree = readLegacyTree(
		fixture({
			"en/ai/05-cloud/01-a.mdx": "# A\n",
			"en/ai/05-cloud/02-b.mdx": "# B\n",
			"en/ai/16-prompt/01-p.mdx": "---\nslug: guides\n---\n# P\n",
			"zh/ai/05-cloud/02-b.mdx": "# 乙\n",
		}),
	);
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
	it("knows every old and new URL, including absolute and relative frontmatter slugs and 01_3d", () => {
		// [rel, old URL, new URL]; verified against the live sitemaps. Task 10 builds its redirects from these.
		const table = (docs) => docs.map((d) => [d.rel, d.oldUrl, d.newUrl]);
		expect(table(en)).toEqual([
			["ai/intro.md", "/ai/intro", "/docs/intro"],
			["ai/88-usecase/00_guide.mdx", "/ai/usecase/guide", "/docs/guide"],
			["ai/88-usecase/01_ai_hot_tools.mdx", "/ai/usecase/ai-tools-adhoc", "/docs/ai-tools-adhoc"], // relative frontmatter slug
			["ai/88-usecase/01_tools-summary.mdx", "/ai/usecase/tools-summary", "/docs/tools-summary"],
			["ai/99-article/ai-product-ideas.mdx", "/ai/article/ai-product-ideas", "/docs/ai-product-ideas"],
			["ai/08-cloud/01-run_diffusion.mdx", "/rundiffusion", "/docs/rundiffusion"], // absolute frontmatter slug
			["ai/08-cloud/02-replicate.mdx", "/replicate", "/docs/replicate"],
			["ai/08-cloud/03-qblock.mdx", "/ai/cloud/qblock", "/docs/qblock"],
			["ai/08-cloud/04-monster_api.mdx", "/ai/cloud/monster_api", "/docs/monster_api"],
			["ai/08-cloud/05-lambda.mdx", "/ai/cloud/lambda", "/docs/lambda"],
			["ai/08-cloud/06-javis.mdx", "/ai/cloud/javis", "/docs/javis"],
			["ai/08-cloud/07-paperspace.mdx", "/ai/cloud/paperspace", "/docs/paperspace"],
			["ai/08-cloud/08-latitude.mdx", "/ai/cloud/latitude", "/docs/latitude"],
			["ai/08-cloud/09-baseten.mdx", "/ai/cloud/baseten", "/docs/baseten"],
			["ai/08-cloud/10-banana.mdx", "/ai/cloud/banana", "/docs/banana"],
			["ai/08-cloud/11-modal.mdx", "/ai/cloud/modal", "/docs/modal"],
			["ai/08-cloud/12-datacrunch.mdx", "/ai/cloud/datacrunch", "/docs/datacrunch"],
			["ai/08-cloud/13-ovhcloud.mdx", "/ai/cloud/ovhcloud", "/docs/ovhcloud"],
			["ai/08-cloud/14-runpod.mdx", "/ai/cloud/runpod", "/docs/runpod"],
			["ai/08-cloud/16-huggingface.mdx", "/ai/cloud/huggingface", "/docs/huggingface"],
			["ai/08-cloud/88-fullstack.mdx", "/ai/cloud/fullstack", "/docs/fullstack"],
			["ai/16-prompt/01-popular-prompt-guide.mdx", "/ai/prompt/prompt-guides", "/docs/prompt-guides"],
			["ai/model/00_llm.mdx", "/ai/model/llm", "/docs/llm"],
			["ai/model/01_3d.mdx", "/ai/model/01_3d", "/docs/3d"], // no number prefix: the old URL keeps 01_
			["dev/00_overview.md", "/dev/overview", "/docs/overview"],
			["dev/23_learn_ai_coding.mdx", "/dev/learn_ai_coding", "/docs/learn_ai_coding"],
		]);
		expect(table(zh)).toEqual([
			["ai/intro.md", "/zh-CN/ai/intro", "/zh-CN/docs/intro"],
			["ai/88-usecase/00_guide.mdx", "/zh-CN/ai/usecase/guide", "/zh-CN/docs/guide"],
			["ai/99-article/ai-product-ideas.mdx", "/zh-CN/ai/article/ai-product-ideas", "/zh-CN/docs/ai-product-ideas"],
			["ai/08-cloud/01-run_diffusion.mdx", "/zh-CN/rundiffusion", "/zh-CN/docs/rundiffusion"],
			["ai/08-cloud/02-replicate.mdx", "/zh-CN/replicate", "/zh-CN/docs/replicate"],
			["ai/08-cloud/03-qblock.mdx", "/zh-CN/ai/cloud/qblock", "/zh-CN/docs/qblock"],
			["ai/08-cloud/04-monster_api.mdx", "/zh-CN/ai/cloud/monster_api", "/zh-CN/docs/monster_api"],
			["ai/16-prompt/01-popular-prompt-guide.mdx", "/zh-CN/ai/prompt/prompt-guides", "/zh-CN/docs/prompt-guides"],
			["dev/23_learn_ai_coding.mdx", "/zh-CN/dev/learn_ai_coding", "/zh-CN/docs/learn_ai_coding"],
		]);
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
	it("resolves every internal link in the corpus, docs and posts, to the page the live site links to", () => {
		// the links the converter rewrites (external links, anchors and images come back unchanged)
		const rewrites = [];
		const convert = (file, from) => {
			const rewriteHref = (href) => {
				const to = tree.resolveLink(href, from);
				if (to !== href) rewrites.push(`${from.locale} ${from.rel}: ${href} -> ${to}`);
				return to;
			};
			const { data } = convertMdx(readFileSync(file, "utf8"), { path: file, slug: from.slug ?? "post", rewriteHref });
			expect(guardPortableText(data.body)).toEqual([]);
		};
		for (const d of tree.docs) convert(d.file, d);
		for (const dir of readdirSync("legacy/blog")) convert(`legacy/blog/${dir}/index.mdx`, { rel: `blog/${dir}/index.mdx`, locale: "en" });
		expect(rewrites).toEqual([
			"en ai/88-usecase/00_guide.mdx: ../16-prompt/01-popular-prompt-guide.mdx -> /docs/prompt-guides",
			"en ai/08-cloud/03-qblock.mdx: ./monster_api -> /docs/monster_api",
			"en ai/08-cloud/04-monster_api.mdx: ./qblock -> /docs/qblock",
			"zh-CN ai/88-usecase/00_guide.mdx: ../16-prompt/01-popular-prompt-guide.mdx -> /zh-CN/docs/prompt-guides",
			"zh-CN ai/08-cloud/03-qblock.mdx: ./monster_api -> /zh-CN/docs/monster_api",
			"zh-CN ai/08-cloud/04-monster_api.mdx: ./qblock -> /zh-CN/docs/qblock",
			"en blog/20250518-ai-tools-adhoc/index.mdx: /ai/usecase/ai-tools-adhoc -> /docs/ai-tools-adhoc",
		]);
		expect(tree.unresolved).toEqual([]);
	});
});
