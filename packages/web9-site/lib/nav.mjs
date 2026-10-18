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

/** An absolute http(s) URL. The header shows these on the right with an external-link icon (spec 2026-10-17 docs UX §3.1). */
export const isExternalHref = (href) => typeof href === "string" && /^https?:\/\//i.test(href);

/** Menu items split for the header: site links on the left, external links on the right, each in menu order. */
export function splitMenu(items) {
	return { internal: items.filter((i) => !isExternalHref(i.href)), external: items.filter((i) => isExternalHref(i.href)) };
}

const DOC_HREF = /^(?:\/zh-CN)?\/docs\/([^/?#]+)\/?$/;
const BLOG_PATH = /^\/(?:posts|tag|category)(?:\/|$)/;
// Trailing slashes off, a lone "/" kept. A linear scan: the regex /\/+$/ backtracks quadratically on a long slash run,
// and request paths reach this (a 404 included).
const trimSlash = (path) => {
	let end = path.length;
	while (end > 1 && path.charCodeAt(end - 1) === 47) end--;
	return path.slice(0, end);
};

/**
 * The href of the menu item to highlight, or undefined (spec 2026-10-17 docs UX §3.1). `docNav` is passed on doc pages
 * only: the doc's section and a slug -> section map of the docs the page loaded. A doc page highlights the first item
 * linking to a doc of the same section; /posts, /tag/* and /category/* highlight the item linking to /posts; any other
 * page the item whose path is the request path. External items are never highlighted.
 */
export function activeMenuHref(items, path, docNav) {
	const hrefs = items.map((i) => i?.href).filter((h) => typeof h === "string" && !isExternalHref(h));
	if (docNav) {
		return hrefs.find((h) => {
			const slug = DOC_HREF.exec(h)?.[1];
			return slug !== undefined && Object.hasOwn(docNav.sectionOf, slug) && docNav.sectionOf[slug] === docNav.section;
		});
	}
	const here = trimSlash(path);
	if (BLOG_PATH.test(here)) return hrefs.find((h) => trimSlash(h) === "/posts");
	return hrefs.find((h) => trimSlash(h) === here);
}

/** The site's locales in menu order, each named in its own language. */
export const LANGUAGES = [
	{ code: "en", label: "English" },
	{ code: "zh-CN", label: "中文" },
];

/** The language menu on pages that are not docs: each locale's home page. */
export const homeLanguages = () => LANGUAGES.map((l) => ({ ...l, href: localizeHref("/", l.code) }));
