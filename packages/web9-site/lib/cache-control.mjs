// Cache-Control for routes that read content (llms.txt, /docs/<slug>.md, rss.xml).
// For a signed-in editor, in edit mode, or with a `_preview` param, EmDash's content queries return draft
// revisions (getEmDashCollection: draftRevisions "all"), and core marks `private, no-store` only on HTML
// pages and on a valid `_preview`. An endpoint must do it itself, or a shared cache would keep the draft
// titles for the next anonymous visitor.
export const SHARED_CACHE_CONTROL = "public, max-age=300";
export const UNSHARED_CACHE_CONTROL = "private, no-store";

/**
 * True when the response may hold something not meant for everyone. Takes the Astro endpoint context.
 * `locals.user` is set by core's auth middleware on every public route when a valid session exists
 * (the same signal Base.astro uses for `isLoggedIn`); the cookie and `_preview` are core's own edit signals.
 */
export function isUnshared({ locals, cookies, url } = {}) {
	return Boolean(locals?.user) || cookies?.get("emdash-edit-mode")?.value === "true" || Boolean(url?.searchParams?.has("_preview"));
}

/**
 * The Cache-Control value for a response of `status`, or undefined for none.
 * Unshared: always `private, no-store`. Otherwise a 200 is public for five minutes, an error (5xx) is never
 * stored, and a 404 is left unmarked.
 */
export function cacheControlFor(context, status = 200) {
	if (isUnshared(context)) return UNSHARED_CACHE_CONTROL;
	if (status === 200) return SHARED_CACHE_CONTROL;
	return status >= 500 ? "no-store" : undefined;
}

/** Cache-Control of a 200. */
export const cacheControl = (context) => (isUnshared(context) ? UNSHARED_CACHE_CONTROL : SHARED_CACHE_CONTROL);
