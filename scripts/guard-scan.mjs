#!/usr/bin/env node
// Scans every stored record against today's rules (spec 2026-10-17 §3.2): each entry of each collection, trashed ones
// included, and its revisions through the save check, plus menus, terms and bylines through the length limits.
// Publish re-runs the check, but trash restore does not, and rules get stricter over time: run this after tightening
// a rule and before deploying. Prints one line per problem and a summary; exits 1 when there is any problem.
// Not covered: widget areas (no MCP tool reads them; SafeWidgetArea checks each one at render and fails closed), and
// the seo.image and byline roleLabel of a trashed entry (content_list_trashed does not return them).
//
//   node scripts/guard-scan.mjs
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: .local/dev-token; needs an admin token).
import { bylineFindings, entryFindings, menuFindings, scanFields, termFindings } from "./lib/guard-scan.mjs";
import { callTool } from "./lib/mcp.mjs";

/** Every item of a cursor-paged MCP list tool. */
async function* pages(tool, args) {
	let cursor;
	do {
		const page = await callTool(tool, { ...args, limit: 100, ...(cursor ? { cursor } : {}) });
		yield* page.items ?? [];
		cursor = page.nextCursor;
	} while (cursor);
}

const findings = [];
const counts = { entries: 0, revisions: 0, menus: 0, terms: 0, bylines: 0 };

for (const { slug } of (await callTool("schema_list_collections", {})).items) {
	const schema = await callTool("schema_get_collection", { slug });
	const fields = scanFields(schema);
	const revisions = schema.supports?.includes("revisions");
	for (const tool of ["content_list", "content_list_trashed"]) {
		for await (const item of pages(tool, { collection: slug })) {
			const revs = revisions ? await callTool("revision_list", { collection: slug, id: item.id, limit: 50 }) : { items: [], total: 0 };
			counts.entries++;
			counts.revisions += revs.items.length;
			findings.push(...entryFindings(slug, item, revs.items, revs.total, fields));
		}
	}
}
for (const menu of await callTool("menu_list", {})) {
	counts.menus++;
	findings.push(...menuFindings(await callTool("menu_get", { name: menu.name, locale: menu.locale })));
}
for (const name of new Set((await callTool("taxonomy_list", {})).taxonomies.map((t) => t.name))) {
	for await (const term of pages("taxonomy_list_terms", { taxonomy: name })) {
		counts.terms++;
		findings.push(...termFindings(name, term));
	}
}
for await (const byline of pages("byline_list", {})) {
	counts.bylines++;
	findings.push(...bylineFindings(byline));
}

for (const f of findings) console.log(f);
console.log(
	`guard-scan: ${counts.entries} entries, ${counts.revisions} revisions, ${counts.menus} menus, ${counts.terms} terms, ${counts.bylines} bylines; ${findings.length} problems`,
);
if (findings.length) process.exitCode = 1;
