// Flatten text inside this plugin's own Portable Text block types so full-text search can see it (spec §4).
// Core nodes (block, table, code, image, ...) are left to core search, which already indexes them.
const SKIP_KEYS = new Set(["_type", "_key", "_version", "url", "logo", "tone", "lang", "marks", "markDefs", "code"]);

function collect(value, out) {
	if (typeof value === "string") {
		if (value.trim()) out.push(value.trim());
	} else if (Array.isArray(value)) {
		for (const v of value) collect(v, out);
	} else if (value && typeof value === "object") {
		for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) collect(v, out);
	}
}

/**
 * @param {unknown} body Portable Text array, or a Markdown string (MCP accepts both)
 * @param {Set<string>} [types] block `_type`s to walk; nodes of any other type are skipped
 */
export function extractBlockText(body, types) {
	if (typeof body === "string") return body;
	if (!Array.isArray(body) || !types?.size) return "";
	const out = [];
	for (const node of body) if (node && types.has(node._type)) collect(node, out);
	return out.join("\n");
}
