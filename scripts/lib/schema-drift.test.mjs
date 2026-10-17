import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { schemaDrift } from "./schema-drift.mjs";

const seed = JSON.parse(readFileSync(new URL("../../seed/seed.json", import.meta.url), "utf8"));
const types = new Map(seed.blockTypes.map((t) => [t.slug, t]));
/** A seed collection in the shape MCP schema_get_collection returns (blocks fields carry their blockTypes). */
const live = (c) => ({ ...c, fields: c.fields.map((f) => (f.type === "blocks" ? { ...f, blockTypes: f.validation.allowedTypes.map((t) => types.get(t)) } : f)) });

describe("schemaDrift", () => {
	it("finds none in the seed's collections", () => {
		for (const c of seed.collections) expect(schemaDrift(live(c)), c.slug).toEqual([]);
	});
	it("reports a portableText or image field the pinned tables lack", () => {
		const docs = live(seed.collections.find((c) => c.slug === "docs"));
		docs.fields.push({ slug: "summary", type: "portableText" }, { slug: "cover", type: "image" });
		expect(schemaDrift(docs)).toEqual([
			"schema drift: docs.summary is a portableText field missing from PT_FIELDS",
			"schema drift: docs.cover is an image field missing from IMAGE_FIELDS",
		]);
		expect(schemaDrift({ slug: "products", fields: [{ slug: "body", type: "portableText" }] })).toEqual([
			"schema drift: products.body is a portableText field missing from PT_FIELDS",
		]);
	});
	it("reports an image path in any version of a block type that BLOCK_IMAGE_FIELDS lacks", () => {
		const pages = live(seed.collections.find((c) => c.slug === "pages"));
		const layout = pages.fields.find((f) => f.slug === "layout");
		const hero = layout.blockTypes.find((t) => t.slug === "hero");
		layout.blockTypes = [
			...layout.blockTypes.filter((t) => t !== hero),
			{ ...hero, versions: [...hero.versions, { version: 2, fields: [{ slug: "background", type: "image" }, { slug: "logos", type: "repeater", validation: { subFields: [{ slug: "img", type: "image" }] } }] }] },
		];
		expect(schemaDrift(pages)).toEqual([
			'schema drift: pages.layout hero v2 has image path "background" missing from BLOCK_IMAGE_FIELDS',
			'schema drift: pages.layout hero v2 has image path "logos[].img" missing from BLOCK_IMAGE_FIELDS',
		]);
	});
	it("never throws on an odd shape", () => {
		for (const c of [{}, { slug: "x" }, { slug: "x", fields: "y" }, { slug: "x", fields: [null, { type: "blocks", slug: "b", blockTypes: [null, { slug: "t", versions: "v" }] }] }]) {
			expect(() => schemaDrift(c)).not.toThrow();
		}
	});
});
