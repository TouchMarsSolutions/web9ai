// Flatten text inside this plugin's own Portable Text block types so full-text search can see it (spec §4).
// Core nodes (block, table, code, image, ...) are left to core search, which already indexes them.
const SKIP_KEYS = new Set(["_type", "_key", "_version", "url", "logo", "tone", "lang", "marks", "markDefs", "code"]);

// An explicit stack, not recursion: this runs inside content:beforeSave on raw request data, and a value
// nested a few thousand levels deep would overflow the call stack. Children are pushed in reverse, so the
// text comes out in document order.
function collect(root, out) {
	const stack = [root];
	while (stack.length) {
		const value = stack.pop();
		if (typeof value === "string") {
			if (value.trim()) out.push(value.trim());
		} else if (Array.isArray(value)) {
			for (let i = value.length - 1; i >= 0; i--) stack.push(value[i]);
		} else if (value && typeof value === "object") {
			const entries = Object.entries(value);
			for (let i = entries.length - 1; i >= 0; i--) if (!SKIP_KEYS.has(entries[i][0])) stack.push(entries[i][1]);
		}
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
