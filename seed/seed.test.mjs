import { readFileSync } from "node:fs";
import { validateSeed } from "emdash/seed";
import { describe, expect, it } from "vitest";

const seed = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8"));

describe("seed/seed.json", () => {
	it("passes EmDash seed validation", () => {
		const result = validateSeed(seed);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect(result.valid).toBe(true);
	});
	it("defines the docs collection as spec §2 requires", () => {
		const docs = seed.collections.find((c) => c.slug === "docs");
		expect(docs.supports).toEqual(["drafts", "revisions", "preview", "search", "seo"]);
		const f = Object.fromEntries(docs.fields.map((x) => [x.slug, x]));
		expect(Object.keys(f)).toEqual(["title", "description", "section", "category", "sort_order", "body", "search_text"]);
		expect(f.title).toMatchObject({ type: "string", required: true, searchable: true });
		expect(f.section).toMatchObject({ type: "select", required: true, translatable: false });
		expect(f.section.validation.options).toEqual(["ai", "dev"]);
		expect(f.sort_order).toMatchObject({ type: "integer", indexed: true, translatable: false });
		expect(f.body).toMatchObject({ type: "portableText", searchable: true });
		expect(f.search_text).toMatchObject({ type: "text", searchable: true });
	});
	it("carries Web9.AI identity and no template demo content (applied once on first boot, spec §9)", () => {
		expect(seed.settings).toEqual({ title: "Web9.AI", tagline: "square of web3 to the power of AI", url: "https://www.web9.ai" });
		expect(seed.content).toBeUndefined();
		expect(seed.bylines).toBeUndefined();
		expect(seed.sections).toBeUndefined();
		expect(seed.redirects).toBeUndefined();
		expect(seed.taxonomies.find((t) => t.name === "category").terms).toEqual([]);
		expect(JSON.stringify(seed)).not.toMatch(/My Blog|\/pages\/about|stray thought/);
	});
	it("seeds the legacy blog tags as en terms (spec §7)", () => {
		const tag = seed.taxonomies.find((t) => t.name === "tag");
		expect(tag.terms.map((t) => t.slug)).toEqual(["ai", "course", "workshop", "tools", "tiny-course"]);
		expect(tag.terms.find((t) => t.slug === "ai").label).toBe("AI");
	});
	it("defines the home-page block types and pages.layout, and search_text on posts and pages (spec §2, §3, §4)", () => {
		expect(seed.blockTypes.map((b) => b.slug)).toEqual(["hero", "feature_grid"]);
		const fields = (slug) => seed.collections.find((c) => c.slug === slug).fields.map((f) => f.slug);
		expect(fields("pages")).toEqual(["title", "content", "search_text", "layout"]);
		expect(fields("posts")).toEqual(["title", "featured_image", "content", "excerpt", "search_text"]);
		const pages = seed.collections.find((c) => c.slug === "pages");
		expect(pages.fields.find((f) => f.slug === "layout")).toEqual({
			slug: "layout",
			label: "Layout",
			type: "blocks",
			validation: { allowedTypes: ["hero", "feature_grid"] },
		});
		for (const slug of ["posts", "pages"]) {
			expect(seed.collections.find((c) => c.slug === slug).fields.find((f) => f.slug === "search_text")).toMatchObject({
				type: "text",
				searchable: true,
			});
		}
	});
});
