import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { readLegacyTree } from "./legacy-tree.mjs";
import { convertPost, postPayloads } from "./posts.mjs";

const post = (body, fm = "slug: tiny\ntitle: Tiny | Course\ntags: [AI, tiny-course]\ndraft: true") => `---\n${fm}\n---\n\n${body}`;
const options = { path: "legacy/blog/x/index.mdx", rewriteHref: (h) => (h === "/ai/intro" ? "/docs/intro" : h), publishedAt: "2025-03-08T00:19:14Z" };

describe("convertPost", () => {
	it("moves the text above <!-- truncate --> into the excerpt and keeps drafts drafts", () => {
		const want = convertPost(post("# Tiny | Course\n\n*Cross the gap*\n\n<!-- truncate -->\n\nSee [intro](/ai/intro).\n\n:::info\nOnline\n:::\n"), options);
		expect(want).toMatchObject({
			collection: "posts",
			slug: "tiny",
			locale: "en",
			status: "draft",
			taxonomies: { tag: ["ai", "tiny-course"] },
			publishedAt: "2025-03-08T00:19:14Z",
			data: { title: "Tiny | Course", excerpt: "Cross the gap" },
		});
		expect(want.data.content.map((b) => b._type)).toEqual(["block", "callout"]);
		expect(want.data.content[0].markDefs[0].href).toBe("/docs/intro");
		expect(JSON.stringify(want.data.content)).not.toContain("Cross the gap");
	});
	it("has no excerpt when nothing but the title sits above the marker, and publishes non-drafts", () => {
		const want = convertPost(post("# Title\n\n<!-- truncate -->\n\nBody.\n", "slug: t\ntitle: Title"), options);
		expect(want.status).toBe("published");
		expect(want.data).not.toHaveProperty("excerpt");
		expect(want.data.content).toHaveLength(1);
		expect(want.taxonomies).toEqual({ tag: [] });
	});
	it("refuses media above the marker", () => {
		expect(() => convertPost(post("# T\n\n![poster](/img/p.svg)\n\n<!-- truncate -->\n\nBody.\n"), options)).toThrow(/only text may sit above/);
	});
});

const fullHistory = (() => {
	try {
		return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() === "false";
	} catch {
		return false;
	}
})();

describe.skipIf(!existsSync("legacy/blog") || !fullHistory)("postPayloads on legacy/blog", () => {
	// In beforeAll, not in the describe body: a skipped suite still runs its body while vitest collects tests,
	// and in a shallow clone (CI) firstCommitDate throws.
	let tree;
	let payloads;
	beforeAll(() => {
		tree = readLegacyTree();
		payloads = postPayloads(tree);
	});
	const want = (slug) => payloads.find((p) => p.want.slug === slug).want;
	it("converts both posts with the dates of their first commits", () => {
		expect(payloads.map((p) => p.want.slug)).toEqual(["ai-tiny-course", "ai-tools-adhoc"]);
		expect(want("ai-tiny-course")).toMatchObject({ status: "draft", publishedAt: "2025-03-08T00:19:14Z", data: { excerpt: "跨越科技裂谷 | 成为穿越周期的AI达人" } });
		expect(want("ai-tiny-course").data.content.map((b) => b._type)).toEqual(["image", "callout"]);
		expect(want("ai-tools-adhoc")).toMatchObject({ status: "published", publishedAt: "2025-04-11T03:57:01Z", taxonomies: { tag: ["ai", "course", "workshop", "tools", "tiny-course"] } });
		expect(want("ai-tools-adhoc").data.content[0].markDefs[0].href).toBe("/docs/ai-tools-adhoc");
		expect(tree.unresolved).toEqual([]);
	});
});
