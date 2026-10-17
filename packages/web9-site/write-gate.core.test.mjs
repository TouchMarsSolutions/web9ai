// The write gate (lib/write-gate.mjs) knows core's write paths as of emdash 1.3. These snapshots fail when an emdash
// upgrade adds an MCP tool or a REST route in a gated area: re-check the gate against it, then update the snapshot
// (spec 2026-10-17 §3.1). emdash ships its src/, so the files are read from node_modules; a missing file fails the test.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = (p) => new URL(`../../node_modules/emdash/src/${p}`, import.meta.url);

describe("core write paths the gate was checked against", () => {
	it("MCP tools", () => {
		const names = [...readFileSync(core("mcp/server.ts"), "utf8").matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
		expect(names).toEqual([
			"content_list", "content_get", "content_create", "content_update", "content_delete", "content_restore", "content_permanent_delete",
			"content_publish", "content_unpublish", "content_schedule", "content_unschedule", "content_compare", "content_discard_draft",
			"content_list_trashed", "content_duplicate", "content_translations", "byline_list", "byline_get", "byline_create", "byline_update",
			"byline_delete", "byline_translations", "schema_list_collections", "schema_get_collection", "schema_list_block_types",
			"schema_get_block_type", "schema_create_block_type", "schema_update_block_type", "schema_activate_block_type_version",
			"schema_create_collection", "schema_delete_collection", "schema_update_collection", "schema_create_field", "schema_delete_field",
			"schema_update_field", "media_list", "media_create", "media_upload", "media_get", "media_update", "media_delete",
			"media_usage_repair", "search", "taxonomy_list", "taxonomy_get", "taxonomy_create", "taxonomy_update", "taxonomy_delete",
			"taxonomy_list_terms", "taxonomy_create_term", "taxonomy_update_term", "taxonomy_delete_term", "taxonomy_term_translations",
			"menu_list", "menu_get", "menu_translations", "menu_create", "menu_update", "menu_delete", "menu_set_items", "revision_list",
			"revision_restore", "settings_get", "settings_update", "site_transfer_capabilities", "site_export_start", "site_export_status",
			"site_import_analyze", "site_import_start", "site_import_status", "site_import_resume", "site_import_receipt",
		]);
	});
	it("REST routes under content, menus and taxonomies", () => {
		const routes = (area) => readdirSync(core(`astro/routes/api/${area}`), { recursive: true }).filter((f) => f.endsWith(".ts")).sort();
		expect(routes("content")).toEqual([
			"[collection]/[id].ts", "[collection]/[id]/compare.ts", "[collection]/[id]/discard-draft.ts", "[collection]/[id]/duplicate.ts",
			"[collection]/[id]/lock.ts", "[collection]/[id]/permanent.ts", "[collection]/[id]/plugin-extensions/[pluginId]/[kind]/[extensionId].ts",
			"[collection]/[id]/preview-url.ts", "[collection]/[id]/publish.ts", "[collection]/[id]/references/[relation]/children.ts",
			"[collection]/[id]/references/[relation]/parents.ts", "[collection]/[id]/restore.ts", "[collection]/[id]/revisions.ts",
			"[collection]/[id]/schedule.ts", "[collection]/[id]/terms/[taxonomy].ts", "[collection]/[id]/translations.ts",
			"[collection]/[id]/unpublish.ts", "[collection]/authors.ts", "[collection]/index.ts", "[collection]/trash.ts",
		]);
		expect(routes("menus")).toEqual(["[name].ts", "[name]/items.ts", "[name]/items/[id].ts", "[name]/reorder.ts", "[name]/translations.ts", "index.ts"]);
		expect(routes("taxonomies")).toEqual([
			"[name].ts", "[name]/reorder.ts", "[name]/terms/[slug].ts", "[name]/terms/[slug]/translations.ts", "[name]/terms/index.ts",
			"[name]/translations.ts", "bulk-tag.ts", "index.ts",
		]);
	});
});
