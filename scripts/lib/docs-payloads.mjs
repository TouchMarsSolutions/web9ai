// The docs step of the migration runner: one upsert per legacy doc (spec §7), en first, then zh-CN.
// The runner fills in translationOf / translationGroup for zh-CN once the en entry exists.
import { readFileSync } from "node:fs";
import { convertMdx } from "./mdx-to-pt.mjs";

/** [{ doc, want }] for upsertEntry. Throws on unresolved internal links or duplicate slugs. */
export function docPayloads(tree) {
	const payloads = tree.docs.map((doc) => {
		const { data } = convertMdx(readFileSync(doc.file, "utf8"), {
			path: doc.file,
			slug: doc.slug,
			section: doc.section,
			category: doc.category,
			order: doc.sortOrder,
			rewriteHref: (href) => tree.resolveLink(href, doc),
		});
		return { doc, want: { collection: "docs", slug: doc.slug, locale: doc.locale, status: "published", data } };
	});
	if (tree.unresolved.length) throw new Error(`unresolved internal links:\n  ${tree.unresolved.join("\n  ")}`);
	for (const locale of ["en", "zh-CN"]) {
		const slugs = payloads.filter((p) => p.doc.locale === locale).map((p) => p.doc.slug);
		if (new Set(slugs).size !== slugs.length) throw new Error(`duplicate ${locale} doc slugs`);
	}
	return payloads;
}
