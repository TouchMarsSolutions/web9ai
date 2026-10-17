// Docs sidebar groups (spec §2): section -> category, in sort_order. `category` is stored as the legacy
// folder name (plan 2 rulings); these labels are the legacy _category_.yml ones, en and zh-CN
// (docs-nav.test.mjs checks them against the inventory while legacy/ exists).
export const SECTION_LABELS = { ai: "AI", dev: "Dev" };
export const CATEGORY_LABELS = {
	usecase: { en: "Use Case", "zh-CN": "神兵利器" },
	article: { en: "Articles" },
	cloud: { en: "Cloud" },
	prompt: { en: "Prompt Engineering" },
	model: { en: "Model" },
};

/** Group heading: the section name for docs at the section root, else the category name. Unknown values show as stored. */
export function groupLabel(section, category, locale) {
	if (!category || category === "general") return Object.hasOwn(SECTION_LABELS, section) ? SECTION_LABELS[section] : section;
	const labels = Object.hasOwn(CATEGORY_LABELS, category) ? CATEGORY_LABELS[category] : {};
	return Object.hasOwn(labels, locale) ? labels[locale] : labels.en ?? category;
}

/** [{ key, label, items }]: entries sorted by sort_order, grouped in order of first appearance. */
export function groupDocs(entries, locale) {
	const groups = new Map();
	for (const e of [...entries].sort((a, b) => (a.data.sort_order ?? 0) - (b.data.sort_order ?? 0))) {
		const section = e.data.section ?? "ai";
		const category = e.data.category ?? "general";
		const key = `${section}/${category}`;
		if (!groups.has(key)) groups.set(key, { key, label: groupLabel(section, category, locale), items: [] });
		groups.get(key).items.push(e);
	}
	return [...groups.values()];
}
