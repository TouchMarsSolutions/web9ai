// Docs sidebar groups (spec §2): section -> category, in sort_order. `category` is stored as the legacy
// folder name (plan 2 rulings); these labels are the legacy _category_.yml ones, en and zh-CN
// (docs-nav.test.mjs checks them against the inventory while legacy/ exists).
import { LIMITS, clampText } from "../../web9-blocks/lib/limits.mjs";

export const SECTION_LABELS = { ai: "AI", dev: "Dev" };
export const CATEGORY_LABELS = {
	usecase: { en: "Use Case", "zh-CN": "神兵利器" },
	article: { en: "Articles" },
	cloud: { en: "Cloud" },
	prompt: { en: "Prompt Engineering" },
	model: { en: "Model" },
};

/**
 * Group heading: the section name for docs at the section root, else the category name. Unknown values show as stored,
 * cut to LIMITS.label (the save check limits category; the heading prints on every docs page, so it is clamped anyway).
 */
export function groupLabel(section, category, locale) {
	return clampText(storedLabel(section, category, locale), LIMITS.label);
}

function storedLabel(section, category, locale) {
	if (!category || category === "general") return Object.hasOwn(SECTION_LABELS, section) ? SECTION_LABELS[section] : section;
	const labels = Object.hasOwn(CATEGORY_LABELS, category) ? CATEGORY_LABELS[category] : {};
	return Object.hasOwn(labels, locale) ? labels[locale] : labels.en ?? category;
}

/**
 * A doc's section and category as the sidebar, the breadcrumbs and the header read them. Unset and empty are the
 * defaults: the editor can store an empty string, which would otherwise be a group of its own, labelled with the
 * section's name, and a second crumb repeating it.
 */
export const docSection = (data) => data?.section || "ai";
export const docCategory = (data) => data?.category || "general";

/** [{ key, label, items }]: entries sorted by sort_order, grouped in order of first appearance. */
export function groupDocs(entries, locale) {
	const groups = new Map();
	for (const e of [...entries].sort((a, b) => (a.data.sort_order ?? 0) - (b.data.sort_order ?? 0))) {
		const section = docSection(e.data);
		const category = docCategory(e.data);
		const key = `${section}/${category}`;
		if (!groups.has(key)) groups.set(key, { key, label: groupLabel(section, category, locale), items: [] });
		groups.get(key).items.push(e);
	}
	return [...groups.values()];
}

/**
 * The docs sidebar (spec 2026-10-17 docs UX §3.2): the current section only, as on the old site. Docs at the section
 * root come first, then one group per category in groupDocs order; only the category holding the current doc is open.
 */
export function docsSidebar(groups, section, currentSlug) {
	const mine = groups.filter((g) => g.key.startsWith(`${section}/`));
	const isRoot = (g) => g.key === `${section}/general`;
	return {
		rootItems: mine.filter(isRoot).flatMap((g) => g.items),
		categories: mine
			.filter((g) => !isRoot(g))
			.map(({ key, label, items }) => ({ key, label, open: items.some((e) => e.data.slug === currentSlug), items })),
	};
}

/** The breadcrumb trail after the home icon: section, category (none for "general"), then the doc title. */
export function breadcrumbs(data, locale) {
	const section = docSection(data);
	const category = docCategory(data);
	return [
		groupLabel(section, "general", locale),
		...(category === "general" ? [] : [groupLabel(section, category, locale)]),
		data.title,
	];
}
