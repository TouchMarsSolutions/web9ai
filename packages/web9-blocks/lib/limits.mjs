// Length and count limits (spec 2026-10-17 §3.1). One table for the save and publish check (entry-guard.mjs), the write
// gate (packages/web9-site/lib/write-gate.mjs), scripts/guard-scan.mjs and the menu in Base.astro. A length is a
// JavaScript string length (UTF-16 code units). Every limit is far above what the site holds today (the spec lists them).
export const LIMITS = Object.freeze({
	title: 200,
	description: 1000,
	excerpt: 1000,
	slug: 100,
	label: 80,
	url: 2048,
	menuItems: 50,
	// A menu item's target renders in the Base.astro menu on every page; its titleAttr renders in a footer menu widget
	// (core WidgetRenderer, no clamp), which SafeWidgetArea checks with menuIsSafe.
	titleAttr: 200,
	target: 32,
});

/** The `data` fields whose length the save and publish check limits, in every collection. */
export const DATA_LIMITS = Object.freeze({ title: LIMITS.title, description: LIMITS.description, excerpt: LIMITS.excerpt });

/** `field: at most N characters (got M)` when `value` is a string longer than `max`; otherwise null. */
export function lengthProblem(field, value, max) {
	return typeof value === "string" && value.length > max ? `${field}: at most ${max} characters (got ${value.length})` : null;
}

/** `value` cut to at most `max` UTF-16 units ending in "…", never splitting a surrogate pair; anything else unchanged. */
export function clampText(value, max) {
	if (typeof value !== "string" || value.length <= max) return value;
	let end = max - 1;
	const last = value.charCodeAt(end - 1);
	if (last >= 0xd800 && last <= 0xdbff) end--;
	return `${value.slice(0, end)}…`;
}
