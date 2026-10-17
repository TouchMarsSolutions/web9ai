// Length and count limits (spec 2026-10-17 §3.1). One table for the save and publish check (entry-guard.mjs), the write
// gate (packages/web9-site/lib/write-gate.mjs), scripts/guard-scan.mjs, the menu in Base.astro and the docs sidebar
// (packages/web9-site/lib/docs-nav.mjs). A length is a JavaScript string length (UTF-16 code units). Every limit is far
// above what the site holds today (the spec lists them).
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
	// Block text fields (pt-guard.mjs): a Markdown body (callout, details, a tab), an inline-Markdown line (callout
	// title, details summary, tool tagline), and mermaid or code-block source. Each Markdown field runs marked and
	// sanitize-html on every render; marked is super-linear on dense delimiters, so these bound, not remove, that cost.
	markdown: 25000,
	inlineMarkdown: 300,
	code: 20000,
	// A media id the site prints into a URL (a byline's avatarMediaId; core's ids are 26-character ULIDs)
	id: 64,
});

/**
 * The `data` fields whose length the save and publish check limits, in every collection. docs.category is a plain
 * string field (no max in core) that every docs page prints as a sidebar heading (docs-nav.mjs groupLabel).
 */
export const DATA_LIMITS = Object.freeze({ title: LIMITS.title, description: LIMITS.description, excerpt: LIMITS.excerpt, category: LIMITS.label });

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
