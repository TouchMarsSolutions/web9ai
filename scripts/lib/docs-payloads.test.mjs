import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { docPayloads } from "./docs-payloads.mjs";
import { readLegacyTree } from "./legacy-tree.mjs";

describe.skipIf(!existsSync("legacy/docs"))("docPayloads on legacy/", () => {
	const payloads = docPayloads(readLegacyTree());
	const find = (locale, slug) => payloads.find((p) => p.doc.locale === locale && p.doc.slug === slug).want;

	it("has 26 en then 9 zh-CN published docs with the inventory's fields", () => {
		expect(payloads.map((p) => p.want.locale)).toEqual([...Array(26).fill("en"), ...Array(9).fill("zh-CN")]);
		expect(payloads.every((p) => p.want.status === "published" && p.want.collection === "docs")).toBe(true);
		expect(find("en", "ai-tools-adhoc").data).toMatchObject({ title: "Adhoc GenAI Tools", section: "ai", category: "usecase", sort_order: 2002 });
		expect(find("en", "overview").data).toMatchObject({ section: "dev", category: "general", sort_order: 1001000 });
	});
	it("rewrites internal links per locale", () => {
		const hrefs = (want) => want.data.body.flatMap((b) => (b.markDefs ?? []).map((d) => d.href));
		expect(hrefs(find("en", "monster_api"))).toContain("/docs/qblock");
		expect(hrefs(find("zh-CN", "monster_api"))).toContain("/zh-CN/docs/qblock");
		expect(JSON.stringify(find("en", "guide").data.body)).toContain("/docs/prompt-guides");
	});
});
