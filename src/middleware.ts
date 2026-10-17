import { defineMiddleware } from "astro:middleware";
import { MAX_GATED_BODY_BYTES, gatedRequest, readGatedBody, writeGateResponse } from "../packages/web9-site/lib/write-gate.mjs";

// Write-length gate (spec 2026-10-17 §3.1). EmDash's middleware is all order "pre", so this runs after its auth and
// before the route. core's routes match on the decoded path string, and the URL on the context is re-normalized by
// the URL setter (a backslash becomes a slash, dot segments resolve), so a check on the URL's path can disagree with
// the router. The gate therefore keys on routePattern, the route Astro matched, and never reads the URL.
export const onRequest = defineMiddleware(async ({ request, routePattern }, next) => {
	if (!gatedRequest(request.method, routePattern)) return next();
	if (Number(request.headers.get("content-length")) > MAX_GATED_BODY_BYTES) return next();
	let body: unknown;
	try {
		// A body without a Content-Length is capped as it is read; one over the cap is core's to refuse
		const text = await readGatedBody(request.clone().body);
		if (text === null) return next();
		body = JSON.parse(text);
	} catch {
		return next();
	}
	const verdict = writeGateResponse(request.method, routePattern, body);
	if (!verdict) return next();
	return new Response(JSON.stringify(verdict.body), {
		status: verdict.status,
		headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
	});
});
