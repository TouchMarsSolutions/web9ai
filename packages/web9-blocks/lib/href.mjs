// The link rule shared by markdown.mjs, html.mjs and to-markdown.mjs: the urls core's isSafeHref accepts
// (emdash utils/url.ts, behind sanitizeHref, menus and `url` fields). Safe: http(s), mailto and tel urls that
// parse, a site path and a #fragment. Not safe: a control character, any other scheme, a relative path, and
// the protocol-relative and backslash forms (`//host`, `/\host`, `\\host`, ` //host`), which a browser
// resolves to another host. Kept free of imports so every module, and the .md routes, can load it.
const SAFE_ABSOLUTE = /^(?:https?:|mailto:|tel:)/i;
const SITE_RELATIVE = /^(?:\/(?![/\\])|#)/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const BASE = new URL("https://site.invalid/");

const resolvesOnSite = (href) => {
	try {
		return new URL(href, BASE).origin === BASE.origin;
	} catch {
		return false;
	}
};

/** `href` when the site may render it as a link, otherwise "". */
export function safeHref(href) {
	if (typeof href !== "string" || CONTROL.test(href)) return "";
	if (SAFE_ABSOLUTE.test(href)) return URL.canParse(href) ? href : "";
	return SITE_RELATIVE.test(href) && resolvesOnSite(href) ? href : "";
}

/** True for a safe link that stays on the site (a path or a fragment). Any other safe link, `http:host` included, leaves it. */
export const isSiteHref = (href) => safeHref(href) !== "" && SITE_RELATIVE.test(href);
