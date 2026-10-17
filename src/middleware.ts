import { defineMiddleware } from "astro:middleware";
import { MAX_GATED_BODY_BYTES, gatedRequest, payloadTooLarge, readGatedBody, writeGateResponse } from "../packages/web9-site/lib/write-gate.mjs";

const json = (status: number, body: object) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });

// Write-length gate (spec 2026-10-17 §3.1). EmDash's middleware is all order "pre", so this runs after its auth and
// before the route. core's routes match on the decoded path string, and the URL on the context is re-normalized by
// the URL setter (a backslash becomes a slash, dot segments resolve), so a check on the URL's path can disagree with
// the router. The gate therefore keys on routePattern, the route Astro matched, and never reads the URL.
// core refuses a body over 10 MiB only when Content-Length declares it; a chunked body is parsed with no cap. So on a
// gated route the gate answers a body over MAX_GATED_BODY_BYTES itself (413) and never hands one to the route unread.
export const onRequest = defineMiddleware(async ({ request, routePattern }, next) => {
	if (!gatedRequest(request.method, routePattern)) return next();
	const tooLarge = () => {
		const { status, body } = payloadTooLarge(routePattern);
		return json(status, body);
	};
	if (Number(request.headers.get("content-length")) > MAX_GATED_BODY_BYTES) return tooLarge();
	let body: unknown;
	try {
		// A body without a Content-Length is capped as it is read
		const text = await readGatedBody(request.clone().body);
		if (text === null) return tooLarge();
		body = JSON.parse(text);
	} catch {
		// Not JSON (or the stream failed): core's own parse fails on the same bytes
		return next();
	}
	const verdict = writeGateResponse(request.method, routePattern, body);
	return verdict ? json(verdict.status, verdict.body) : next();
});
