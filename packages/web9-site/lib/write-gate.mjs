// Write-length gate (spec 2026-10-17 §3.1), run by src/middleware.ts. core's REST and MCP schemas put no maximum on
// a content slug, a menu item's label and URL, a term's label and slug or a byline's name and slug, and no hook sees
// them, while menus and terms render on many pages. EmDash's middleware is all order "pre", so src/middleware.ts runs
// after its auth and before the route, and answers in the route's place when a value is over LIMITS. Pure: the
// middleware passes the method, Astro's normalized pathname and the parsed JSON body. Anything the gate cannot read
// (a body that is not JSON, an unknown route or tool) passes through to core, which validates it.
import { LIMITS, lengthProblem } from "../../web9-blocks/lib/limits.mjs";

/** core's parseBody limit (emdash api/parse.ts MAX_BODY_SIZE): a larger body is core's 413, so the gate does not read it. */
export const MAX_GATED_BODY_BYTES = 10 * 1024 * 1024;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);
const MAX_SHOWN = 20;
const SLUG = ["slug", LIMITS.slug];
const LABEL = ["label", LIMITS.label];
const MENU_ITEM = [LABEL, ["customUrl", LIMITS.url]];
const TERM = [LABEL, SLUG];
const BYLINE = [["displayName", LIMITS.label], SLUG];
/** MCP tools whose arguments carry gated values (emdash mcp/server.ts); menu_set_items is a list, handled on its own. */
const TOOLS = {
	content_create: [SLUG],
	content_update: [SLUG],
	taxonomy_create_term: TERM,
	taxonomy_update_term: TERM,
	byline_create: BYLINE,
	byline_update: BYLINE,
};

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Segments after /_emdash/api/ of Astro's normalized pathname (already decoded: never decode again), or null. */
function apiSegments(pathname) {
	const segments = String(pathname).split("/").filter(Boolean);
	return segments[0] === "_emdash" && segments[1] === "api" ? segments.slice(2) : null;
}

/** The [field, max] checks of a REST route's body (emdash astro/routes/api), or null when the route is not gated. */
function restChecks([area, ...rest]) {
	if (area === "content" && (rest.length === 1 || rest.length === 2)) return [SLUG];
	if (area === "menus" && rest[1] === "items" && (rest.length === 2 || rest.length === 3)) return MENU_ITEM;
	if (area === "taxonomies" && rest[1] === "terms" && (rest.length === 2 || rest.length === 3 || (rest.length === 4 && rest[3] === "translations"))) return TERM;
	return null;
}

const isMcp = (segments) => segments.length === 1 && segments[0] === "mcp";

/** Problems of `record` against [field, max] checks, each prefixed with `at`. */
function fieldProblems(record, checks, at) {
	return checks.map(([field, max]) => lengthProblem(`${at}${field}`, record[field], max)).filter(Boolean);
}

function toolProblems(name, args) {
	if (!isRecord(args)) return [];
	if (name === "menu_set_items") {
		if (!Array.isArray(args.items)) return [];
		if (args.items.length > LIMITS.menuItems) return [`items: at most ${LIMITS.menuItems} menu items are allowed (got ${args.items.length})`];
		return args.items.flatMap((item, k) => (isRecord(item) ? fieldProblems(item, MENU_ITEM, `items[${k}].`) : []));
	}
	return Object.hasOwn(TOOLS, name) ? fieldProblems(args, TOOLS[name], "") : [];
}

/** Problems of one JSON-RPC message: only a tools/call of a gated tool has any. */
function messageProblems(message) {
	if (!isRecord(message) || message.method !== "tools/call" || !isRecord(message.params)) return [];
	const { name, arguments: args } = message.params;
	return typeof name === "string" ? toolProblems(name, args).map((p) => `${name} ${p}`) : [];
}

const rejected = (problems) =>
	`Write rejected (spec §10): ${problems.slice(0, MAX_SHOWN).join("; ")}${problems.length > MAX_SHOWN ? "; …" : ""}`;

/** True when the gate reads the body of a request with this method and (normalized) path. */
export function gatedRequest(method, pathname) {
	if (!WRITE_METHODS.has(method)) return false;
	const segments = apiSegments(pathname);
	return segments !== null && (isMcp(segments) || restChecks(segments) !== null);
}

/**
 * The gate's answer to a request whose body parsed as `body`: null lets it through; otherwise `{ status, body }` to
 * send as JSON in the route's place. REST: 400 in core's error shape. MCP: a JSON-RPC error (-32602, invalid params),
 * with HTTP 200 and the request's id for one message, HTTP 400 and id null for a batch.
 */
export function writeGateResponse(method, pathname, body) {
	if (!gatedRequest(method, pathname)) return null;
	const segments = apiSegments(pathname);
	if (isMcp(segments)) {
		const batch = Array.isArray(body);
		const problems = (batch ? body : [body]).flatMap(messageProblems);
		if (!problems.length) return null;
		const id = !batch && (typeof body.id === "string" || typeof body.id === "number") ? body.id : null;
		return { status: batch ? 400 : 200, body: { jsonrpc: "2.0", id, error: { code: -32602, message: rejected(problems) } } };
	}
	if (!isRecord(body)) return null;
	const problems = fieldProblems(body, restChecks(segments), "");
	if (!problems.length) return null;
	return { status: 400, body: { success: false, error: { code: "VALIDATION_ERROR", message: rejected(problems) } } };
}
