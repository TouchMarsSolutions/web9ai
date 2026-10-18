import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLegacyTree } from "../../../scripts/lib/legacy-tree.mjs";
import { CATEGORY_LABELS, SECTION_LABELS, breadcrumbs, docCategory, docSection, docsSidebar, groupDocs, groupLabel } from "./docs-nav.mjs";

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

describe("groupLabel bounds what it prints", () => {
	it("cuts a stored category or section to 80 characters, never the grouping key", () => {
		const category = "c".repeat(500);
		expect(groupLabel("ai", category, "en")).toBe(`${"c".repeat(79)}…`);
		expect(groupLabel("s".repeat(500), "general", "zh-CN")).toBe(`${"s".repeat(79)}…`);
		expect(groupDocs([doc("x", "ai", category, 1)], "en")[0]).toMatchObject({ key: `ai/${category}`, label: `${"c".repeat(79)}…` });
		expect(groupLabel("ai", "c".repeat(80), "en")).toBe("c".repeat(80));
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

describe("docsSidebar", () => {
	const entries = [
		doc("intro", "ai", "general", 1000),
		doc("guide", "ai", "usecase", 2001),
		doc("tools", "ai", "usecase", 2002),
		doc("replicate", "ai", "cloud", 3001),
		doc("overview", "dev", "general", 1001000),
		doc("learn", "dev", "general", 1002000),
	];
	it("returns only the current section: root docs first, then the categories, only the current one open", () => {
		const s = docsSidebar(groupDocs(entries, "en"), "ai", "tools");
		expect(s.rootItems.map((e) => e.data.slug)).toEqual(["intro"]);
		expect(s.categories.map(({ key, label, open, items }) => [key, label, open, items.map((e) => e.data.slug)])).toEqual([
			["ai/usecase", "Use Case", true, ["guide", "tools"]],
			["ai/cloud", "Cloud", false, ["replicate"]],
		]);
	});
	it("opens no category on a root doc and labels categories per locale", () => {
		const s = docsSidebar(groupDocs(entries, "zh-CN"), "ai", "intro");
		expect(s.categories.map((c) => [c.label, c.open])).toEqual([
			["神兵利器", false],
			["Cloud", false],
		]);
	});
	it("gives a section without categories as root docs only", () => {
		const s = docsSidebar(groupDocs(entries, "en"), "dev", "learn");
		expect(s.rootItems.map((e) => e.data.slug)).toEqual(["overview", "learn"]);
		expect(s.categories).toEqual([]);
	});
});

describe("breadcrumbs", () => {
	it("is the section, the category (none for general), then the title", () => {
		expect(breadcrumbs({ section: "ai", category: "usecase", title: "Guide" }, "en")).toEqual(["AI", "Use Case", "Guide"]);
		expect(breadcrumbs({ section: "dev", category: "general", title: "Overview" }, "en")).toEqual(["Dev", "Overview"]);
		expect(breadcrumbs({ title: "Defaults" }, "en")).toEqual(["AI", "Defaults"]);
	});
	it("uses the zh-CN category labels", () => {
		expect(breadcrumbs({ section: "ai", category: "usecase", title: "指南" }, "zh-CN")).toEqual(["AI", "神兵利器", "指南"]);
	});
});

describe("an empty section or category is the default one", () => {
	it("puts a doc with category \"\" among the section's root docs, not in a group of its own", () => {
		const entries = [doc("intro", "ai", "general", 1000), doc("blank", "ai", "", 1001), doc("unset", "ai", null, 1002), doc("guide", "ai", "usecase", 2001)];
		const groups = groupDocs(entries, "en");
		expect(groups.map((g) => g.key)).toEqual(["ai/general", "ai/usecase"]);
		const s = docsSidebar(groups, "ai", "blank");
		expect(s.rootItems.map((e) => e.data.slug)).toEqual(["intro", "blank", "unset"]);
		expect(s.categories.map((c) => c.key)).toEqual(["ai/usecase"]);
	});
	it("puts a doc with section \"\" in the ai section", () => {
		const groups = groupDocs([doc("a", "", "cloud", 1), doc("b", "ai", "cloud", 2)], "en");
		expect(groups.map((g) => [g.key, g.items.length])).toEqual([["ai/cloud", 2]]);
	});
	it("gives no extra crumb for an empty category, and the ai section for an empty section", () => {
		expect(breadcrumbs({ section: "dev", category: "", title: "Blank" }, "en")).toEqual(["Dev", "Blank"]);
		expect(breadcrumbs({ section: "", category: "", title: "Blank" }, "zh-CN")).toEqual(["AI", "Blank"]);
		expect(docSection({ section: "" })).toBe("ai");
		expect(docSection(undefined)).toBe("ai");
		expect(docCategory({ category: "" })).toBe("general");
		expect(docCategory({ category: "cloud" })).toBe("cloud");
	});
});
