// The Worker answers on two Custom Domains (plan 3 Task 4). https://www.web9.ai is canonical (astro.config `site`):
// a request on the apex or over plain http is sent there with a 301 that keeps the path and query. Any other host
// (workers.dev, local wrangler dev) passes through untouched.
export const CANONICAL_ORIGIN = "https://www.web9.ai";
const PRODUCTION_HOSTS = new Set(["web9.ai", "www.web9.ai"]);

/** The 301 target for a request on a production host that is not the canonical origin, else null. */
export function canonicalRedirect(requestUrl) {
	const url = new URL(requestUrl);
	if (!PRODUCTION_HOSTS.has(url.hostname) || url.origin === CANONICAL_ORIGIN) return null;
	return CANONICAL_ORIGIN + url.pathname + url.search;
}
