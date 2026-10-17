// tool_grid logo size in px. The value comes from content (editor or MCP), so it is clamped: an
// oversized logo is the cheapest way to cover a page with one image.
export const LOGO_SIZE = { default: 72, min: 16, max: 300 };

export function logoSize(value) {
	const n = Math.round(Number(value));
	if (!Number.isFinite(n) || n <= 0) return LOGO_SIZE.default;
	return Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, n));
}
