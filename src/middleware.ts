import { defineMiddleware } from "astro:middleware";
import { MAX_GATED_BODY_BYTES, gatedRequest, writeGateResponse } from "../packages/web9-site/lib/write-gate.mjs";

// Write-length gate (spec 2026-10-17 §3.1). EmDash's middleware is all order "pre", so this runs after its auth and
// before the route. context.url is Astro's normalized URL (decoded, duplicate slashes collapsed): the one routes match.
export const onRequest = defineMiddleware(async ({ request, url }, next) => {
	if (!gatedRequest(request.method, url.pathname)) return next();
	if (Number(request.headers.get("content-length")) > MAX_GATED_BODY_BYTES) return next();
	let body: unknown;
	try {
		body = JSON.parse(await request.clone().text());
	} catch {
		return next();
	}
	const verdict = writeGateResponse(request.method, url.pathname, body);
	if (!verdict) return next();
	return new Response(JSON.stringify(verdict.body), {
		status: verdict.status,
		headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
	});
});
