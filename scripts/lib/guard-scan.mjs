// What scripts/guard-scan.mjs reports for each stored record (spec 2026-10-17 §3.2): the save check (entryProblems) on
// every entry and revision, and the write gate's length limits (packages/web9-site/lib/write-gate.mjs) on the values
// no hook sees: an entry's seo.image and byline role labels, and menus, terms and bylines.
import { entryProblems, mergeLiveFields, staticFields } from "../../packages/web9-blocks/lib/entry-guard.mjs";
import { LIMITS, lengthProblem } from "../../packages/web9-blocks/lib/limits.mjs";

const SHOWN = 40;
const short = (s) => (typeof s === "string" && s.length > SHOWN ? `${s.slice(0, SHOWN)}…` : String(s));
const at = (label, problems) => problems.filter(Boolean).map((p) => `${label}: ${p}`);
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** The fields to check in a collection: the pinned ones plus its live schema's (MCP schema_get_collection output). */
export function scanFields(schema) {
	return mergeLiveFields(staticFields(schema?.slug), schema?.fields);
}

/** The gated values content_list returns beside `data`: seo.image and each bylines[].roleLabel (a trashed item has neither). */
const metaProblems = (item) => [
	isRecord(item.seo) ? lengthProblem("seo.image", item.seo.image, LIMITS.url) : null,
	...(Array.isArray(item.bylines) ? item.bylines.map((credit, k) => (isRecord(credit) ? lengthProblem(`bylines[${k}].roleLabel`, credit.roleLabel, LIMITS.label) : null)) : []),
];

/** An entry (content_list item) and its revisions (revision_list items; `total` from the same answer). */
export function entryFindings(collection, item, revisions, total, fields) {
	const label = `${collection}/${item.id}`;
	const out = at(label, [...entryProblems(item.data, fields, { slug: item.slug }), ...metaProblems(item)]);
	for (const rev of revisions) out.push(...at(`${label}@${rev.id}`, entryProblems(rev.data, fields, { slug: rev.data?._slug })));
	if (total > revisions.length) out.push(`${label}: only the newest ${revisions.length} of ${total} revisions were scanned`);
	return out;
}

/** A menu (menu_get answer; its items carry customUrl, titleAttr and target, and no resolved url). */
export function menuFindings(menu) {
	const label = `menu ${menu.name}${menu.locale ? ` (${menu.locale})` : ""}`;
	const items = Array.isArray(menu.items) ? menu.items : [];
	if (items.length > LIMITS.menuItems) return [`${label}: at most ${LIMITS.menuItems} items are allowed (got ${items.length})`];
	return items.flatMap((item, k) =>
		at(`${label} items[${k}]`, [
			lengthProblem("label", item?.label, LIMITS.label),
			lengthProblem("customUrl", item?.customUrl, LIMITS.url),
			lengthProblem("url", item?.url, LIMITS.url),
			lengthProblem("titleAttr", item?.titleAttr, LIMITS.titleAttr),
			lengthProblem("target", item?.target, LIMITS.target),
		]),
	);
}

/** A term (taxonomy_list_terms item). */
export function termFindings(taxonomy, term) {
	const label = `term ${taxonomy}/${short(term.slug)}${term.locale ? ` (${term.locale})` : ""}`;
	return at(label, [lengthProblem("label", term.label, LIMITS.label), lengthProblem("slug", term.slug, LIMITS.slug)]);
}

/** A byline (byline_list item). */
export function bylineFindings(byline) {
	return at(`byline ${byline.id}`, [lengthProblem("displayName", byline.displayName, LIMITS.label), lengthProblem("slug", byline.slug, LIMITS.slug)]);
}
