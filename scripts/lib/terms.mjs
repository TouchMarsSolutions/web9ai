// Taxonomy terms of the seed (spec §9). applySeed writes terms only with `includeContent`, which the
// runtime's first-boot seed never sets (and dev-bypass `content=0` turns off), so the runner creates them.

/** [{ slug, label }] of `taxonomy` in a parsed seed/seed.json. */
export function seedTerms(seed, taxonomy) {
	const def = seed.taxonomies?.find((t) => t.name === taxonomy);
	if (!def) throw new Error(`seed has no taxonomy "${taxonomy}"`);
	return (def.terms ?? []).map(({ slug, label }) => ({ slug, label }));
}

/**
 * Creates the terms that do not exist yet; existing ones are left alone (the owner may relabel them).
 * Returns [{ name, action: "created" | "unchanged" }].
 */
export async function syncTerms(callTool, taxonomy, terms, { dryRun = false } = {}) {
	const have = new Set((await callTool("taxonomy_list_terms", { taxonomy })).items.map((t) => t.slug));
	const results = [];
	for (const { slug, label } of terms) {
		if (have.has(slug)) {
			results.push({ name: `${taxonomy} ${slug}`, action: "unchanged" });
			continue;
		}
		if (!dryRun) await callTool("taxonomy_create_term", { taxonomy, slug, label });
		results.push({ name: `${taxonomy} ${slug}`, action: "created" });
	}
	return results;
}
