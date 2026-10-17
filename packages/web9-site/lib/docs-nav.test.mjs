import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLegacyTree } from "../../../scripts/lib/legacy-tree.mjs";
import { CATEGORY_LABELS, SECTION_LABELS, groupDocs, groupLabel } from "./docs-nav.mjs";

const doc = (slug, section, category, sort_order) => ({ data: { slug, section, category, sort_order } });

describe("groupDocs", () => {
	it("orders by sort_order and labels sections and categories per locale", () => {
		const entries = [doc("overview", "dev", "general", 1001000), doc("guide", "ai", "usecase", 2001), doc("intro", "ai", "general", 1000), doc("tools", "ai", "usecase", 2002)];
		expect(groupDocs(entries, "en").map((g) => [g.label, g.items.map((e) => e.data.slug)])).toEqual([
			["AI", ["intro"]],
			["Use Case", ["guide", "tools"]],
			["Dev", ["overview"]],
		]);
		expect(groupDocs(entries, "zh-CN")[1].label).toBe("神兵利器");
	});
	it("falls back to the stored value and to the en label", () => {
		expect(groupLabel("ai", "cloud", "zh-CN")).toBe("Cloud");
		expect(groupLabel("ops", "general", "en")).toBe("ops");
		expect(groupLabel("ai", "new-thing", "en")).toBe("new-thing");
		expect(groupDocs([{ data: { slug: "x" } }], "en")[0]).toMatchObject({ key: "ai/general", label: "AI" });
	});
	it("reads only own keys, so Object.prototype names show as stored", () => {
		for (const locale of ["en", "zh-CN"]) {
			for (const name of ["constructor", "__proto__", "toString"]) {
				expect(groupLabel(name, "general", locale)).toBe(name);
				expect(groupLabel("ai", name, locale)).toBe(name);
			}
		}
		expect(groupDocs([doc("x", "ai", "constructor", 1)], "en")[0]).toMatchObject({ key: "ai/constructor", label: "constructor" });
	});
});

describe.skipIf(!existsSync("legacy/docs"))("labels match the legacy inventory", () => {
	it("has every category label from the legacy _category_.yml files, in both locales", () => {
		const tree = readLegacyTree();
		expect(Object.keys(CATEGORY_LABELS).sort()).toEqual(Object.keys(tree.categories).sort());
		for (const [dir, { label, zhLabel }] of Object.entries(tree.categories)) {
			expect(CATEGORY_LABELS[dir].en).toBe(label);
			expect(CATEGORY_LABELS[dir]["zh-CN"]).toBe(zhLabel);
		}
		expect(Object.keys(SECTION_LABELS).sort()).toEqual([...new Set(tree.docs.map((d) => d.section))].sort());
	});
});
