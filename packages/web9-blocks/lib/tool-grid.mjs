// tool_grid logo size in px. The value comes from content (editor or MCP), so it is clamped: an
// oversized logo is the cheapest way to cover a page with one image.
export const LOGO_SIZE = { default: 72, min: 16, max: 300 };

export function logoSize(value) {
	const n = Math.round(Number(value));
	if (!Number.isFinite(n) || n <= 0) return LOGO_SIZE.default;
	return Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, n));
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v : "");

/**
 * The tools of a tool_grid block as ToolGrid.astro renders them: object tools only, text fields as strings ("" when
 * missing or not a string), featured only when true. tool.featured on a null tool, or tagline.replace on a number,
 * used to throw and take the page down.
 */
export function toolItems(node) {
	const list = Array.isArray(node?.tools) ? node.tools : [];
	return list
		.filter(isObject)
		.map((tool) => ({ name: text(tool.name), tagline: text(tool.tagline), url: text(tool.url), logo: text(tool.logo), featured: tool.featured === true }));
}
