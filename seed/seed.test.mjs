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
