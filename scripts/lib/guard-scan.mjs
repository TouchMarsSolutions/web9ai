// What scripts/guard-scan.mjs reports for each stored record (spec 2026-10-17 §3.2): the save check (entryProblems) on
// every entry and revision, and the write gate's length limits (packages/web9-site/lib/write-gate.mjs) on the values
// no hook sees: an entry's seo.image and byline role labels, and menus, terms and bylines.
import { entryProblems, mergeLiveFields, staticFields } from "../../packages/web9-blocks/lib/entry-guard.mjs";
import { LIMITS, lengthProblem } from "../../packages/web9-blocks/lib/limits.mjs";
import { listOf } from "./mcp.mjs";

const SHOWN = 40;
const short = (s) => (typeof s === "string" && s.length > SHOWN ? `${s.slice(0, SHOWN)}…` : String(s));
const at = (label, problems) => problems.filter(Boolean).map((p) => `${label}: ${p}`);
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Every item of a cursor-paged MCP list tool (`call` is callTool). Throws, rather than ending early, on an answer
 * without an items array, a nextCursor that is not a non-empty string or that repeats, and a stated total that is not
 * the number of items listed, so a scan never reads what it failed to read as an empty list.
 */
export async function* pages(call, tool, args) {
	const seen = new Set();
	let cursor;
	let count = 0;
	let total;
	for (;;) {
		const page = await call(tool, { ...args, limit: 100, ...(cursor ? { cursor } : {}) });
		const items = listOf(tool, page);
		count += items.length;
		if (Number.isInteger(page.total)) total = page.total;
		yield* items;
		cursor = page.nextCursor ?? undefined;
		if (cursor === undefined) break;
		if (typeof cursor !== "string" || !cursor) throw new Error(`${tool}: nextCursor is not a non-empty string`);
		if (seen.has(cursor)) throw new Error(`${tool}: cursor repeated`);
		seen.add(cursor);
	}
	if (total !== undefined && total !== count) throw new Error(`${tool}: listed ${count} items but the answer's total is ${total}`);
}

/** A revision_list answer's items and total; any other shape throws. */
export function revisionsOf(answer) {
	const items = listOf("revision_list", answer);
	if (!Number.isInteger(answer.total)) throw new Error("revision_list: expected an integer total");
	return { items, total: answer.total };
}

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

/**
 * A menu (menu_get answer; its items carry customUrl, titleAttr and target, and no resolved url). Only the length and
 * count rules of menuIsSafe (packages/web9-blocks/lib/widgets.mjs) and of the gate's MENU_ITEM: core stores a label NOT
 * NULL (migrations/005_menus.ts) and menu_get items are objects, so menuIsSafe's type checks have nothing to find here.
 */
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
