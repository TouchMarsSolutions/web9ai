// Write-length gate (spec 2026-10-17 §3.1), run by src/middleware.ts. core's REST and MCP schemas put no maximum on
// a content slug, a content entry's seo.image and byline roleLabel, a menu item's label, URL, target and titleAttr, a
// term's label and slug or a byline's name and slug, and no hook sees them, while menus, terms and bylines render on
// many pages. EmDash's middleware is all order "pre", so src/middleware.ts runs after its auth and before the route,
// and answers in the route's place when a value is over LIMITS. The gate keys on the route pattern Astro matched
// (context.routePattern), never on the URL: core's routes match on a decoded path string that context.url
// re-normalizes (a backslash becomes a slash, dot segments resolve), so a path check and the router can disagree,
// while the matched pattern is by construction the route that runs. Pure: the middleware passes the method, the
// pattern and the parsed JSON body (readGatedBody only reads the stream it is given). Anything the gate cannot read (a
// body that is not JSON, an unknown route or tool) passes through to core, which validates it.
import { LIMITS, lengthProblem } from "../../web9-blocks/lib/limits.mjs";

/** core's parseBody limit (emdash api/parse.ts MAX_BODY_SIZE): a larger body is core's 413, so the gate does not read it. */
export const MAX_GATED_BODY_BYTES = 10 * 1024 * 1024;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);
const MAX_SHOWN = 20;

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// A check is (record, at) => problems: the problems of `record`, each field named with the prefix `at`
const field = (name, max) => (record, at) => {
	const problem = lengthProblem(`${at}${name}`, record[name], max);
	return problem ? [problem] : [];
};
const SLUG = field("slug", LIMITS.slug);
const LABEL = field("label", LIMITS.label);
// seo and bylines are checked only when shaped as core's schema has them (core rejects any other shape)
const SEO_IMAGE = (record, at) => (isRecord(record.seo) ? field("image", LIMITS.url)(record.seo, `${at}seo.`) : []);
const ROLE_LABELS = (record, at) =>
	Array.isArray(record.bylines)
		? record.bylines.flatMap((credit, k) => (isRecord(credit) ? field("roleLabel", LIMITS.label)(credit, `${at}bylines[${k}].`) : []))
		: [];

/** A content entry: slug, seo.image (og:image) and bylines[].roleLabel (emdash api/schemas/content.ts, bylines.ts). */
const CONTENT = [SLUG, SEO_IMAGE, ROLE_LABELS];
const MENU_ITEM = [LABEL, field("customUrl", LIMITS.url), field("titleAttr", LIMITS.titleAttr), field("target", LIMITS.target)];
const TERM = [LABEL, SLUG];
const BYLINE = [field("displayName", LIMITS.label), SLUG];

const MCP = "/_emdash/api/mcp";
/** The route patterns emdash injects (astro/integration/routes.ts) whose write bodies the gate reads, with their checks. */
const ROUTES = new Map([
	["/_emdash/api/content/[collection]", CONTENT],
	["/_emdash/api/content/[collection]/[id]", CONTENT],
	["/_emdash/api/menus/[name]/items", MENU_ITEM],
	["/_emdash/api/menus/[name]/items/[id]", MENU_ITEM],
	["/_emdash/api/taxonomies/[name]/terms", TERM],
	["/_emdash/api/taxonomies/[name]/terms/[slug]", TERM],
	["/_emdash/api/taxonomies/[name]/terms/[slug]/translations", TERM],
	["/_emdash/api/admin/bylines", BYLINE],
	["/_emdash/api/admin/bylines/[id]", BYLINE],
	["/_emdash/api/admin/bylines/[id]/translations", BYLINE],
	[MCP, null],
]);
/** Every pattern the gate names: write-gate.core.test.mjs checks them against the emdash in node_modules. */
export const GATED_PATTERNS = Object.freeze([...ROUTES.keys()]);

/** MCP tools whose arguments carry gated values (emdash mcp/server.ts); menu_set_items is a list, handled on its own. */
const TOOLS = new Map([
	["content_create", CONTENT],
	["content_update", CONTENT],
	["taxonomy_create_term", TERM],
	["taxonomy_update_term", TERM],
	["byline_create", BYLINE],
	["byline_update", BYLINE],
]);

/** Problems of `record` against `checks`, each field named with the prefix `at`. */
const fieldProblems = (record, checks, at) => checks.flatMap((check) => check(record, at));

function toolProblems(name, args) {
	if (!isRecord(args)) return [];
	if (name === "menu_set_items") {
		if (!Array.isArray(args.items)) return [];
		if (args.items.length > LIMITS.menuItems) return [`items: at most ${LIMITS.menuItems} menu items are allowed (got ${args.items.length})`];
		return args.items.flatMap((item, k) => (isRecord(item) ? fieldProblems(item, MENU_ITEM, `items[${k}].`) : []));
	}
	return TOOLS.has(name) ? fieldProblems(args, TOOLS.get(name), "") : [];
}

/** Problems of one JSON-RPC message: only a tools/call of a gated tool has any. */
function messageProblems(message) {
	if (!isRecord(message) || message.method !== "tools/call" || !isRecord(message.params)) return [];
	const { name, arguments: args } = message.params;
	return typeof name === "string" ? toolProblems(name, args).map((p) => `${name} ${p}`) : [];
}

const rejected = (problems) =>
	`Write rejected (spec §10): ${problems.slice(0, MAX_SHOWN).join("; ")}${problems.length > MAX_SHOWN ? "; …" : ""}`;

/** True when the gate reads the body of a request with this method to the route with this pattern (Astro's `context.routePattern`). */
export function gatedRequest(method, routePattern) {
	return WRITE_METHODS.has(method) && ROUTES.has(routePattern);
}

/**
 * The gate's answer to a request whose body parsed as `body`: null lets it through; otherwise `{ status, body }` to
 * send as JSON in the route's place. REST: 400 in core's error shape. MCP: a JSON-RPC error (-32602, invalid params),
 * with HTTP 200 and the request's id for one message, HTTP 400 and id null for a batch.
 */
export function writeGateResponse(method, routePattern, body) {
	if (!gatedRequest(method, routePattern)) return null;
	if (routePattern === MCP) {
		const batch = Array.isArray(body);
		const problems = (batch ? body : [body]).flatMap(messageProblems);
		if (!problems.length) return null;
		const id = !batch && (typeof body.id === "string" || typeof body.id === "number") ? body.id : null;
		return { status: batch ? 400 : 200, body: { jsonrpc: "2.0", id, error: { code: -32602, message: rejected(problems) } } };
	}
	if (!isRecord(body)) return null;
	const problems = fieldProblems(body, ROUTES.get(routePattern), "");
	if (!problems.length) return null;
	return { status: 400, body: { success: false, error: { code: "VALIDATION_ERROR", message: rejected(problems) } } };
}

/**
 * The text of a request body stream (null: no body, read as ""), without a leading byte order mark (which would make
 * JSON.parse throw and the gate fail open), or null as soon as more than MAX_GATED_BODY_BYTES have arrived: the
 * gate does not buffer a body core refuses anyway, whether or not it declared a Content-Length.
 * @param {ReadableStream<Uint8Array> | null} body
 * @returns {Promise<string | null>}
 */
export async function readGatedBody(body) {
	if (!body) return "";
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let received = 0;
	let text = "";
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			received += value.byteLength;
			if (received > MAX_GATED_BODY_BYTES) return null;
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		// Stops reading a stream left unfinished (a body over the cap); a no-op on one that has ended
		reader.cancel().catch(() => {});
	}
	return (text + decoder.decode()).replace(/^﻿/, "");
}
