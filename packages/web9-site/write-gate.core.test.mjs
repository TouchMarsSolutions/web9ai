// The write gate (lib/write-gate.mjs) knows core's write paths as of emdash 1.3. These snapshots fail when an emdash
// upgrade adds an MCP tool or a REST route in a gated area, renames a route pattern the gate keys on, or adds, drops or
// renames a field of a tool's arguments or a route's body that the gate reads: re-check the gate against it, then update
// the snapshot (spec 2026-10-17 §3.1). emdash ships its src/, so the files are read from node_modules; a missing file
// fails the test.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GATED_PATTERNS } from "./lib/write-gate.mjs";

const core = (p) => new URL(`../../node_modules/emdash/src/${p}`, import.meta.url);
const sdk = (p) => new URL(`../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/${p}`, import.meta.url);

/**
 * The top-level fields of the first `object({ ... })` after `anchor` in `source`, as { name: value source }; a spread is
 * { "...name": "" }. Reads past strings and comments, so a field is found however the chain is wrapped. Throws when the
 * anchor or the object is missing, so a renamed schema fails here.
 */
function objectFields(source, anchor) {
	const at = source.indexOf(anchor);
	if (at < 0) throw new Error(`not found: ${anchor}`);
	const fields = {};
	let depth = 0;
	let key = null;
	let value = "";
	let expectKey = false;
	const flush = () => {
		if (key !== null) fields[key] = value.replace(/\s+/g, " ").trim();
		key = null;
		value = "";
	};
	for (let i = source.indexOf("object({", at) + "object(".length; i < source.length; i++) {
		const c = source[i];
		if (c === "/" && source[i + 1] === "/") {
			i = source.indexOf("\n", i);
			continue;
		}
		if (c === "/" && source[i + 1] === "*") {
			i = source.indexOf("*/", i) + 1;
			continue;
		}
		if (depth === 1 && expectKey && /\S/.test(c) && !"})]".includes(c)) {
			const m = /^(?:\.\.\.([\w.]+)|(\w+)\s*:)/.exec(source.slice(i));
			if (!m) throw new Error(`unreadable field at ${source.slice(i, i + 40)}`);
			flush();
			if (m[1]) fields[`...${m[1]}`] = "";
			else key = m[2];
			i += m[0].length - 1;
			expectKey = false;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			const from = i;
			for (i++; i < source.length && source[i] !== c; i++) if (source[i] === "\\") i++;
			value += source.slice(from, i + 1);
			continue;
		}
		if ("{([".includes(c)) {
			if (++depth === 1) {
				expectKey = true;
				continue;
			}
		} else if ("})]".includes(c)) {
			if (--depth === 0) {
				flush();
				return fields;
			}
		} else if (c === "," && depth === 1) {
			flush();
			expectKey = true;
			continue;
		}
		if (key !== null) value += c;
	}
	throw new Error(`unclosed object after ${anchor}`);
}

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
	it("reads the fields of an object literal however its chains are wrapped (the reader the next two tests use)", () => {
		const source = 'const b = z.object({ a: z.string().max(2), // x: no\n\tb: z\n\t\t.array(z.object({ c: z.string() }))\n\t\t.optional(), d: "e, f: g",\n\t...base.shape,\n});';
		expect(objectFields(source, "const b")).toEqual({ a: "z.string().max(2)", b: "z .array(z.object({ c: z.string() })) .optional()", d: '"e, f: g"', "...base.shape": "" });
		expect(() => objectFields(source, "const missing")).toThrow("not found: const missing");
	});
	it("the fields of MCP tool arguments the gate reads (mcp/server.ts)", () => {
		const server = readFileSync(core("mcp/server.ts"), "utf8");
		/** One tool's registration: from its name to the next registerTool call. */
		const tool = (name) => {
			const at = server.search(new RegExp(`registerTool\\(\\s*"${name}"`));
			expect(at, name).toBeGreaterThan(0);
			return server.slice(at, server.indexOf("registerTool(", at + 1));
		};
		const args = (name) => objectFields(tool(name), "inputSchema:");
		for (const name of ["content_create", "content_update"]) {
			const fields = args(name);
			// slug, seo (contentSeoInput: image, canonical) and bylines (contentBylineInputSchema: roleLabel) are gated
			expect(fields.slug, name).toMatch(/^z\.string\(\)/);
			expect(fields.seo, name).toMatch(/^contentSeoInput\b/);
			expect(fields.bylines, name).toMatch(/^z \.array\(contentBylineInputSchema\)/);
		}
		expect(Object.keys(args("content_create"))).toEqual([
			"collection", "data", "slug", "status", "locale", "translationOf", "migrateBlocks", "replaceBlocks", "bylines", "taxonomies", "seo", "publishedAt",
		]);
		expect(Object.keys(args("content_update"))).toEqual([
			"collection", "id", "locale", "data", "slug", "status", "seo", "bylines", "taxonomies", "publishedAt", "migrateBlocks", "replaceBlocks", "_rev", "overrideLock",
		]);
		expect(server).toMatch(/^import \{[^}]*\bcontentBylineInputSchema,\s+contentSeoInput,[^}]*\} from "#api\/schemas\.js";$/m);
		expect(Object.keys(args("menu_set_items"))).toEqual(["name", "locale", "items"]);
		expect(Object.keys(objectFields(tool("menu_set_items"), "items: z"))).toEqual([
			"label", "type", "customUrl", "referenceCollection", "referenceId", "titleAttr", "target", "cssClasses", "parentIndex",
		]);
		expect(Object.keys(args("taxonomy_create_term"))).toEqual(["taxonomy", "slug", "label", "parentId", "description", "locale", "translationOf"]);
		expect(Object.keys(args("taxonomy_update_term"))).toEqual(["taxonomy", "termSlug", "slug", "label", "parentId", "description", "locale"]);
		// the byline tools take the REST bodies' shapes (pinned in the next test)
		expect(args("byline_create")).toEqual({ "...bylineCreateBody.shape": "" });
		expect(args("byline_update")).toEqual({ id: expect.stringMatching(/^z\.string\(\)/), "...bylineUpdateBody.shape": "" });
	});
	it("the body schemas of the gated REST routes and the fields the gate reads in them", () => {
		const route = (p) => readFileSync(core(`astro/routes/api/${p}`), "utf8");
		const parsed = (p) => [...route(p).matchAll(/parseBody\(request, (\w+)\)/g)].map((m) => m[1]);
		expect(Object.fromEntries(
			[
				"content/[collection]/index.ts", "content/[collection]/[id].ts", "menus/[name]/items.ts", "menus/[name]/items/[id].ts",
				"taxonomies/[name]/terms/index.ts", "taxonomies/[name]/terms/[slug].ts", "taxonomies/[name]/terms/[slug]/translations.ts",
				"admin/bylines/index.ts", "admin/bylines/[id]/index.ts", "admin/bylines/[id]/translations.ts",
			].map((p) => [p, parsed(p)]),
		)).toEqual({
			"content/[collection]/index.ts": ["contentCreateBody"],
			"content/[collection]/[id].ts": ["contentUpdateBody"],
			"menus/[name]/items.ts": ["createMenuItemBody"],
			"menus/[name]/items/[id].ts": ["updateMenuItemBody"],
			"taxonomies/[name]/terms/index.ts": ["createTermBody"],
			"taxonomies/[name]/terms/[slug].ts": ["updateTermBody"],
			"taxonomies/[name]/terms/[slug]/translations.ts": ["createTermTranslationBody"],
			"admin/bylines/index.ts": ["bylineCreateBody"],
			"admin/bylines/[id]/index.ts": ["bylineUpdateBody"],
			"admin/bylines/[id]/translations.ts": ["bylineTranslationCreateBody"],
		});
		const schema = (file, name) => Object.keys(objectFields(readFileSync(core(`api/schemas/${file}`), "utf8"), `export const ${name} = z`));
		const content = (name) => objectFields(readFileSync(core("api/schemas/content.ts"), "utf8"), `export const ${name} = z`);
		expect(schema("content.ts", "contentSeoInput")).toEqual(["title", "description", "image", "canonical", "noIndex"]);
		expect(schema("bylines.ts", "contentBylineInputSchema")).toEqual(["bylineId", "roleLabel"]);
		for (const name of ["contentCreateBody", "contentUpdateBody"]) {
			expect(content(name).slug, name).toMatch(/^z\.string\(\)/);
			expect(content(name).seo, name).toMatch(/^contentSeoInput\b/);
			expect(content(name).bylines, name).toMatch(/^z\.array\(contentBylineInputSchema\)/);
		}
		expect(Object.keys(content("contentCreateBody"))).toEqual([
			"data", "slug", "status", "bylines", "locale", "translationOf", "seo", "taxonomies", "references", "publishedAt", "createdAt", "migrateBlocks", "replaceBlocks",
		]);
		expect(Object.keys(content("contentUpdateBody"))).toEqual([
			"data", "slug", "status", "authorId", "bylines", "_rev", "skipRevision", "overrideLock", "seo", "taxonomies", "references", "publishedAt", "migrateBlocks", "replaceBlocks",
		]);
		expect(schema("menus.ts", "createMenuItemBody")).toEqual(["type", "label", "referenceCollection", "referenceId", "customUrl", "target", "titleAttr", "cssClasses", "parentId", "sortOrder"]);
		expect(schema("menus.ts", "updateMenuItemBody")).toEqual(["label", "customUrl", "target", "titleAttr", "cssClasses", "parentId", "sortOrder"]);
		expect(schema("taxonomies.ts", "createTermBody")).toEqual(["slug", "label", "parentId", "description", "locale", "translationOf"]);
		expect(schema("taxonomies.ts", "updateTermBody")).toEqual(["slug", "label", "parentId", "description"]);
		expect(Object.keys(objectFields(route("taxonomies/[name]/terms/[slug]/translations.ts"), "const createTermTranslationBody = z"))).toEqual(["locale", "label", "slug"]);
		expect(schema("bylines.ts", "bylineCreateBody")).toEqual(["slug", "displayName", "bio", "avatarMediaId", "websiteUrl", "userId", "isGuest", "locale", "translationOf", "customFields"]);
		expect(schema("bylines.ts", "bylineUpdateBody")).toEqual(["slug", "displayName", "bio", "avatarMediaId", "websiteUrl", "userId", "isGuest", "customFields"]);
		expect(schema("bylines.ts", "bylineTranslationCreateBody")).toEqual(["locale", "slug", "displayName", "bio", "avatarMediaId", "websiteUrl"]);
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
