// The Worker answers on two Custom Domains (plan 3 Task 4). https://www.web9.ai is canonical (astro.config `site`):
// a request on the apex or over plain http is sent there, keeping the path and query. Any other host (workers.dev,
// local wrangler dev) passes through untouched.
export const CANONICAL_ORIGIN = "https://www.web9.ai";
const PRODUCTION_HOSTS = new Set(["web9.ai", "www.web9.ai"]);

/** The redirect target for a request on a production host that is not the canonical origin, else null. */
export function canonicalRedirect(requestUrl) {
	let url;
	try {
		url = new URL(requestUrl);
	} catch {
		return null; // workerd always hands the Worker a parseable request.url; anything else passes through
	}
	if (!PRODUCTION_HOSTS.has(url.hostname) || url.origin === CANONICAL_ORIGIN) return null;
	return CANONICAL_ORIGIN + url.pathname + url.search;
}

/**
 * The redirect response for `request`, or null. GET and HEAD get 301, which browsers and crawlers expect; any other
 * method gets 308, so an API client that follows it repeats the method and body instead of turning a write into a GET.
 */
export function canonicalResponse(request) {
	const location = canonicalRedirect(request.url);
	if (!location) return null;
	const status = request.method === "GET" || request.method === "HEAD" ? 301 : 308;
	return new Response(null, { status, headers: { Location: location } });
}
