// Flatten text inside non-core Portable Text blocks so full-text search can see it (spec §4).
// Core "block" nodes are skipped: EmDash indexes them already.
const SKIP_KEYS = new Set(["_type", "_key", "_version", "url", "logo", "tone", "lang", "marks", "markDefs"]);

function collect(value, out) {
	if (typeof value === "string") {
		if (value.trim()) out.push(value.trim());
	} else if (Array.isArray(value)) {
		for (const v of value) collect(v, out);
	} else if (value && typeof value === "object") {
		for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) collect(v, out);
	}
}

/** @param {unknown} body Portable Text array, or a Markdown string (MCP accepts both) */
export function extractBlockText(body) {
	if (typeof body === "string") return body;
	if (!Array.isArray(body)) return "";
	const out = [];
	for (const node of body) if (node && node._type !== "block") collect(node, out);
	return out.join("\n");
}
