#!/usr/bin/env node
// Scans every stored record against today's rules (spec 2026-10-17 §3.2): each entry of each collection, trashed ones
// included, and its revisions through the save check, plus menus, terms and bylines through the length limits.
// Publish re-runs the check, but trash restore does not, and rules get stricter over time: run this after tightening
// a rule and before deploying. Prints each problem as it finds it, then a summary; exits 1 when there is any problem.
// It never reports "0 problems" for what it could not read: an answer of an unexpected shape, an unreadable list or an
// unreachable server aborts the run (exit 1, no summary line).
// Not covered: widget areas (no MCP tool reads them; SafeWidgetArea checks each one at render and fails closed), and
// the seo.image and bylines[].roleLabel of a trashed entry (content_list_trashed omits them and content_get excludes
// trashed rows, findByIdOrSlug). The gate limits them at write, but restoring from the trash re-runs neither the gate
// nor the hooks.
//
//   node scripts/guard-scan.mjs
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: .local/dev-token; needs an admin token).
import { bylineFindings, entryFindings, menuFindings, pages, revisionsOf, scanFields, termFindings } from "./lib/guard-scan.mjs";
import { callTool, listOf } from "./lib/mcp.mjs";

const counts = { entries: 0, revisions: 0, menus: 0, terms: 0, bylines: 0 };
let problems = 0;
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
			report(entryFindings(slug, item, revs.items, revs.total, fields));
		}
	}
}
for (const menu of listOf("menu_list", await callTool("menu_list", {}), null)) {
	const full = await callTool("menu_get", { name: menu.name, locale: menu.locale });
	counts.menus++;
	report(menuFindings({ ...full, items: listOf("menu_get", full) }));
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

console.log(
	`guard-scan: ${counts.entries} entries, ${counts.revisions} revisions, ${counts.menus} menus, ${counts.terms} terms, ${counts.bylines} bylines; ${problems} problems`,
);
if (problems) process.exitCode = 1;
