// The write gate (lib/write-gate.mjs) knows core's write paths as of emdash 1.3. These snapshots fail when an emdash
// upgrade adds an MCP tool or a REST route in a gated area, or renames a route pattern the gate keys on: re-check the
// gate against it, then update the snapshot (spec 2026-10-17 §3.1). emdash ships its src/, so the files are read from
// node_modules; a missing file fails the test.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GATED_PATTERNS } from "./lib/write-gate.mjs";

const core = (p) => new URL(`../../node_modules/emdash/src/${p}`, import.meta.url);
const sdk = (p) => new URL(`../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/${p}`, import.meta.url);

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
		expect(routes("admin/bylines")).toEqual(["[id]/index.ts", "[id]/translations.ts", "index.ts"]);
		expect(routes("widget-areas")).toEqual(["[name].ts", "[name]/reorder.ts", "[name]/widgets.ts", "[name]/widgets/[id].ts", "index.ts"]);
	});
	it("the 413 bodies payloadTooLarge copies: core's parseBody and the MCP SDK's request body limit", () => {
		// parseBody refuses only a declared Content-Length over 10 MiB (it reads a chunked body without a cap), which is why the gate answers 413 itself
		const parse = readFileSync(core("api/parse.ts"), "utf8");
		expect(parse).toContain("const MAX_BODY_SIZE = 10 * 1024 * 1024;");
		expect(parse).toContain('if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {\n\t\treturn apiError("PAYLOAD_TOO_LARGE", "Request body too large", 413);');
		// The one SDK copy emdash resolves (no nested node_modules/emdash/node_modules/@modelcontextprotocol)
		expect(() => readdirSync(new URL("../../node_modules/emdash/node_modules/@modelcontextprotocol", import.meta.url))).toThrow();
		const body = readFileSync(sdk("requestBody.js"), "utf8");
		expect(body).toContain("export const DEFAULT_MAX_REQUEST_BODY_SIZE = 4 * 1024 * 1024;");
		expect(body).toContain("return `Payload Too Large: Request body must not exceed ${maxBytes} bytes`;");
		expect(readFileSync(sdk("webStandardStreamableHttp.js"), "utf8")).toContain("return this.createJsonErrorResponse(413, -32000, message);");
		expect(readFileSync(core("astro/routes/api/mcp.ts"), "utf8")).not.toContain("maxRequestBodySize");
	});
	it("route patterns the gate keys on, and the patterns around them", () => {
		// The gate matches context.routePattern against these strings, so a rename in emdash must fail here, not pass silently
		const patterns = [...readFileSync(core("astro/integration/routes.ts"), "utf8").matchAll(/pattern:\s*"([^"]+)"/g)].map((m) => m[1]);
		expect(patterns.length).toBeGreaterThan(100);
		for (const pattern of GATED_PATTERNS) expect(patterns, pattern).toContain(pattern);
		const prefixes = ["/_emdash/api/content", "/_emdash/api/menus", "/_emdash/api/taxonomies", "/_emdash/api/admin/bylines", "/_emdash/api/widget-areas", "/_emdash/api/mcp"];
		expect(patterns.filter((p) => prefixes.some((prefix) => p.startsWith(prefix))).sort()).toEqual([
			"/_emdash/api/admin/bylines", "/_emdash/api/admin/bylines/[id]", "/_emdash/api/admin/bylines/[id]/translations",
			"/_emdash/api/content/[collection]", "/_emdash/api/content/[collection]/[id]", "/_emdash/api/content/[collection]/[id]/compare",
			"/_emdash/api/content/[collection]/[id]/discard-draft", "/_emdash/api/content/[collection]/[id]/duplicate",
			"/_emdash/api/content/[collection]/[id]/lock", "/_emdash/api/content/[collection]/[id]/permanent",
			"/_emdash/api/content/[collection]/[id]/plugin-extensions/[pluginId]/[kind]/[extensionId]",
			"/_emdash/api/content/[collection]/[id]/preview-url", "/_emdash/api/content/[collection]/[id]/publish",
			"/_emdash/api/content/[collection]/[id]/references/[relation]/children", "/_emdash/api/content/[collection]/[id]/references/[relation]/parents",
			"/_emdash/api/content/[collection]/[id]/restore", "/_emdash/api/content/[collection]/[id]/revisions",
			"/_emdash/api/content/[collection]/[id]/schedule", "/_emdash/api/content/[collection]/[id]/terms/[taxonomy]",
			"/_emdash/api/content/[collection]/[id]/translations", "/_emdash/api/content/[collection]/[id]/unpublish",
			"/_emdash/api/content/[collection]/authors", "/_emdash/api/content/[collection]/trash", "/_emdash/api/mcp",
			"/_emdash/api/menus", "/_emdash/api/menus/[name]", "/_emdash/api/menus/[name]/items", "/_emdash/api/menus/[name]/items/[id]",
			"/_emdash/api/menus/[name]/reorder", "/_emdash/api/menus/[name]/translations",
			"/_emdash/api/taxonomies", "/_emdash/api/taxonomies/[name]", "/_emdash/api/taxonomies/[name]/reorder",
			"/_emdash/api/taxonomies/[name]/terms", "/_emdash/api/taxonomies/[name]/terms/[slug]",
			"/_emdash/api/taxonomies/[name]/terms/[slug]/translations", "/_emdash/api/taxonomies/[name]/translations", "/_emdash/api/taxonomies/bulk-tag",
			"/_emdash/api/widget-areas", "/_emdash/api/widget-areas/[name]", "/_emdash/api/widget-areas/[name]/reorder",
			"/_emdash/api/widget-areas/[name]/widgets", "/_emdash/api/widget-areas/[name]/widgets/[id]",
		]);
	});
});
