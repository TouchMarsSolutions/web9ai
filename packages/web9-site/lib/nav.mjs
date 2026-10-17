// Site-relative links that have a zh-CN route get the locale prefix on zh-CN pages (spec §5).
// Only the home page and docs exist in zh-CN; posts, tags, search and external links stay as they are.
export function localizeHref(href, locale) {
	if (typeof href !== "string" || !locale || locale === "en") return href;
	if (href === "/") return `/${locale}/`;
	if (href.startsWith("/docs/")) return `/${locale}${href}`;
	return href;
}

/**
 * `rel` for a menu link. Menu items are agent-writable and core takes any string as `target`, so a named target on
 * an external url would open a window that keeps `window.opener`: whenever a target is set, cut opener and referrer.
 */
export const linkRel = (target) => (typeof target === "string" && target !== "" ? "noopener noreferrer" : undefined);
