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
 * @param {unknown} body Portable Text array. MCP converts a Markdown body to Portable Text before hooks
 *   run (spec §8), so a string never arrives in practice; if one does, it yields "" rather than copying
 *   raw `ec:block` JSON into search_text.
 * @param {Set<string>} [types] block `_type`s to walk; nodes of any other type are skipped
 */
export function extractBlockText(body, types) {
	if (!Array.isArray(body) || !types?.size) return "";
	const out = [];
	for (const node of body) if (node && types.has(node._type)) collect(node, out);
	return out.join("\n");
}
