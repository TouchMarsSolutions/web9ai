// Site-relative links that have a zh-CN route get the locale prefix on zh-CN pages (spec §5).
// Only the home page and docs exist in zh-CN; posts, tags, search and external links stay as they are.
export function localizeHref(href, locale) {
	if (typeof href !== "string" || !locale || locale === "en") return href;
	if (href === "/") return `/${locale}/`;
	if (href.startsWith("/docs/")) return `/${locale}${href}`;
	return href;
}
