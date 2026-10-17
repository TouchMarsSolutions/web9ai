// What scripts/guard-scan.mjs reports for each stored record (spec 2026-10-17 §3.2): the save check (entryProblems) on
// every entry and revision, the write gate's length limits (packages/web9-site/lib/write-gate.mjs) on the values no
// hook sees (an entry's seo.image, seo.canonical and byline role labels, and menus, terms and bylines), and
// SafeWidgetArea's render check (packages/web9-blocks/lib/widgets.mjs) on each widget area and the menus it names.
import { entryProblems, mergeLiveFields, staticFields } from "../../packages/web9-blocks/lib/entry-guard.mjs";
import { LIMITS, lengthProblem } from "../../packages/web9-blocks/lib/limits.mjs";
import { menuIsSafe, widgetAreaIsSafe } from "../../packages/web9-blocks/lib/widgets.mjs";
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

/** The gated values content_list returns beside `data`: seo.image, seo.canonical and each bylines[].roleLabel (a trashed item has none). */
const metaProblems = (item) => [
	...(isRecord(item.seo) ? [lengthProblem("seo.image", item.seo.image, LIMITS.url), lengthProblem("seo.canonical", item.seo.canonical, LIMITS.url)] : []),
	...(Array.isArray(item.bylines) ? item.bylines.map((credit, k) => (isRecord(credit) ? lengthProblem(`bylines[${k}].roleLabel`, credit.roleLabel, LIMITS.label) : null)) : []),
];

/**
 * An entry (content_list item) and its revisions (revision_list items; `total` from the same answer). The revisions'
 * findings come apart from the entry's: an edit fixes the entry, while a revision is a stored snapshot no tool edits.
 */
export function entryFindings(collection, item, revisions, total, fields) {
	const label = `${collection}/${item.id}`;
	const entry = at(label, [...entryProblems(item.data, fields, { slug: item.slug }), ...metaProblems(item)]);
	if (total > revisions.length) entry.push(`${label}: only the newest ${revisions.length} of ${total} revisions were scanned`);
	const found = revisions.flatMap((rev) => at(`${label}@${rev.id}`, entryProblems(rev.data, fields, { slug: rev.data?._slug })));
	return { entry, revisions: found };
}

/**
 * The last line of a scan. Core keeps the newest 50 revisions of an entry (node_modules/emdash/src/cleanup.ts:42,
 * pruned by the hourly system cleanup), so a problem in a revision goes away by itself after 50 newer saves.
 */
export function summaryLine(counts, problems, inRevisions) {
	const { entries, revisions, menus, terms, bylines, areas } = counts;
	const why = inRevisions ? ` (${inRevisions} in revisions, which cannot be edited; they age out after 50 newer revisions)` : "";
	return `guard-scan: ${entries} entries, ${revisions} revisions, ${menus} menus, ${terms} terms, ${bylines} bylines, ${areas} widget areas; ${problems} problems${why}`;
}

/**
 * `get(path)` for the REST API (no MCP tool reads widget areas): the JSON `data` of the answer. Throws on an answer
 * that is not JSON (an auth redirect to the login page, which fetch follows), not ok, or a failure.
 */
export function restGet(site, token, fetchImpl = fetch) {
	return async (path) => {
		const res = await fetchImpl(new URL(path, site), { headers: { Authorization: `Bearer ${token}` } });
		const json = await res.json().catch(() => undefined);
		if (json === undefined) throw new Error(`REST GET ${path}: HTTP ${res.status}, not JSON (${res.headers.get("content-type") ?? "no content-type"})`);
		if (!res.ok || json.success === false) throw new Error(`REST GET ${path}: HTTP ${res.status} ${JSON.stringify(json.error ?? json).slice(0, 300)}`);
		return json.data;
	};
}

/** The areas of a GET /_emdash/api/widget-areas answer; any other shape throws (the scan never reads it as no areas). */
export function widgetAreasOf(answer) {
	const areas = listOf("widget-areas", answer);
	if (!areas.every((area) => isRecord(area) && typeof area.name === "string" && Array.isArray(area.widgets))) {
		throw new Error("widget-areas: expected each area to have a name string and a widgets array");
	}
	return areas;
}

/**
 * A menu_get answer as core's getMenu would give it to WidgetRenderer: a custom item's url is its customUrl or "#"
 * (node_modules/emdash/src/menus/index.ts:297-298; sanitizeHref at :360 can only shorten it to "#") and an empty
 * titleAttr is none (:362). Other items resolve to an entry or term URL menu_get does not carry; it is built from a
 * gated slug. The items stay flat, so a child counts toward the item cap here although WidgetRenderer prints only the
 * top level: the scan errs toward a finding.
 */
const rendered = (menu) => ({
	items: (Array.isArray(menu.items) ? menu.items : []).map((item) => ({
		label: item?.label,
		url: item?.type === "custom" ? item.customUrl || "#" : undefined,
		titleAttr: item?.titleAttr || undefined,
	})),
});

/**
 * A widget area (GET widget-areas item), checked as SafeWidgetArea checks it before rendering: widgetAreaIsSafe, then
 * menuIsSafe on the menu each menu widget names. getMenu picks that menu's locale from the request, so every locale's
 * menu of the name is checked (`menus`: the menu_get answers). A name no menu has passes: it renders nothing.
 */
export function widgetAreaFindings(area, menus) {
	const label = `widget area ${area.name}`;
	if (!widgetAreaIsSafe(area)) {
		return [
			`${label}: fails the widget check (a content widget, an unknown type, component or prop, a string over its length cap, or more than 20 widgets), so SafeWidgetArea renders nothing`,
		];
	}
	const names = new Set(area.widgets.filter((w) => w.type === "menu" && typeof w.menuName === "string" && w.menuName).map((w) => w.menuName));
	return menus
		.filter((menu) => names.has(menu.name) && !menuIsSafe(rendered(menu)))
		.map(
			(menu) =>
				`${label}: menu ${menu.name}${menu.locale ? ` (${menu.locale})` : ""} fails the menu check (more than 50 items, a label that is not a string or is over 80 characters, a url over 2048 or a titleAttr over 200), so SafeWidgetArea renders nothing`,
		);
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

/** A byline (byline_list item): the gate's BYLINE fields. */
export function bylineFindings(byline) {
	return at(`byline ${byline.id}`, [
		lengthProblem("displayName", byline.displayName, LIMITS.label),
		lengthProblem("slug", byline.slug, LIMITS.slug),
		lengthProblem("avatarMediaId", byline.avatarMediaId, LIMITS.id),
	]);
}
