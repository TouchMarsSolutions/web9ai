#!/usr/bin/env node
// Scans every stored record against today's rules (spec 2026-10-17 §3.2): each entry of each collection, trashed ones
// included, and its revisions through the save check, plus menus, terms and bylines through the length limits, and
// each widget area through SafeWidgetArea's render check (with the menus its menu widgets name). Widget areas come from
// REST GET /_emdash/api/widget-areas, as no MCP tool reads them (widgets:read; an admin token has it).
// Publish re-runs the check, but trash restore does not, and rules get stricter over time: run this after tightening
// a rule and before deploying. Prints each problem as it finds it, then a summary; exits 1 when there is any problem.
// The summary says how many problems are in revisions: no edit fixes those (a revision is a stored snapshot), and core
// keeps only the newest 50 revisions of an entry (cleanup.ts:42), so they age out after 50 newer saves. They still
// count toward exit 1.
// It never reports "0 problems" for what it could not read: an answer of an unexpected shape, an unreadable list or an
// unreachable server aborts the run (exit 1, no summary line).
// Not covered: the seo.image, seo.canonical and bylines[].roleLabel of a trashed entry (content_list_trashed omits them
// and content_get excludes trashed rows, findByIdOrSlug). The gate limits them at write, but restoring from the trash
// re-runs neither the gate nor the hooks.
//
//   node scripts/guard-scan.mjs
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: .local/dev-token; needs an admin token).
import {
	bylineFindings,
	entryFindings,
	menuFindings,
	pages,
	restGet,
	revisionsOf,
	scanFields,
	summaryLine,
	termFindings,
	widgetAreaFindings,
	widgetAreasOf,
} from "./lib/guard-scan.mjs";
import { callTool, defaultToken, listOf } from "./lib/mcp.mjs";

const counts = { entries: 0, revisions: 0, menus: 0, terms: 0, bylines: 0, areas: 0 };
let problems = 0;
let inRevisions = 0;
const report = (found) => {
	for (const line of found) console.log(line);
	problems += found.length;
};

for (const { slug } of listOf("schema_list_collections", await callTool("schema_list_collections", {}))) {
	const schema = await callTool("schema_get_collection", { slug });
	const fields = scanFields({ slug, fields: listOf("schema_get_collection", schema, "fields") });
	const revisions = listOf("schema_get_collection", schema, "supports").includes("revisions");
	for (const tool of ["content_list", "content_list_trashed"]) {
		for await (const item of pages(callTool, tool, { collection: slug })) {
			const revs = revisions ? revisionsOf(await callTool("revision_list", { collection: slug, id: item.id, limit: 50 })) : { items: [], total: 0 };
			counts.entries++;
			counts.revisions += revs.items.length;
			const found = entryFindings(slug, item, revs.items, revs.total, fields);
			report([...found.entry, ...found.revisions]);
			inRevisions += found.revisions.length;
		}
	}
}
const menus = [];
for (const menu of listOf("menu_list", await callTool("menu_list", {}), null)) {
	const full = await callTool("menu_get", { name: menu.name, locale: menu.locale });
	menus.push({ ...full, items: listOf("menu_get", full) });
	counts.menus++;
	report(menuFindings(menus.at(-1)));
}
const get = restGet(process.env.EMDASH_URL ?? "http://localhost:4321", defaultToken());
for (const area of widgetAreasOf(await get("/_emdash/api/widget-areas"))) {
	counts.areas++;
	report(widgetAreaFindings(area, menus));
}
for (const name of new Set(listOf("taxonomy_list", await callTool("taxonomy_list", {}), "taxonomies").map((t) => t.name))) {
	for await (const term of pages(callTool, "taxonomy_list_terms", { taxonomy: name })) {
		counts.terms++;
		report(termFindings(name, term));
	}
}
for await (const byline of pages(callTool, "byline_list", {})) {
	counts.bylines++;
	report(bylineFindings(byline));
}

console.log(summaryLine(counts, problems, inRevisions));
if (problems) process.exitCode = 1;
