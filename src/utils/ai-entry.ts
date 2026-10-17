// Responses for readers that are not browsers (spec §8): /llms.txt and /docs/<slug>.md, per locale.
// Absolute URLs come from Astro.site, never the request Host.
// Every response, 404s included, carries `nosniff`: the .md body is Markdown written by agents and may hold raw HTML.
// Cache-Control (packages/web9-site/lib/cache-control.mjs): an editor, edit mode or a `_preview` param can see
// drafts, so those requests get `private, no-store` on every response; everyone else gets public, five minutes.
import type { APIContext } from "astro";
import { decodeSlug, getEmDashCollection, getEmDashEntry, getSiteSettings } from "emdash";
import { docToMarkdown } from "@web9/blocks/to-markdown";
import { cacheControlFor, isUnshared } from "../../packages/web9-site/lib/cache-control.mjs";
import { buildLlmsTxt } from "../../packages/web9-site/lib/llms.mjs";
import { resolveBlogSiteIdentity } from "./site-identity";

const TEXT = "text/plain; charset=utf-8";
const MARKDOWN = "text/markdown; charset=utf-8";

function reply(context: APIContext, status: number, body: string, contentType: string): Response {
	const headers: Record<string, string> = { "X-Content-Type-Options": "nosniff", "Content-Type": contentType };
	const cc = cacheControlFor(context, status);
	if (cc) headers["Cache-Control"] = cc;
	return new Response(body, { status, headers });
}

const notFound = (context: APIContext) => reply(context, 404, "Not found\n", TEXT);
// getEmDashCollection and getEmDashEntry report a failed read as `error`; answering 200 with an empty list would be cached
const unavailable = (context: APIContext) => reply(context, 503, "Service unavailable\n", TEXT);

/** llms.txt listing the published docs of `locale`. */
export async function llmsTxt(locale: string, context: APIContext): Promise<Response> {
	const { site, cache } = context;
	if (!site) throw new Error("astro.config `site` must be set");
	const [{ entries, error, cacheHint }, settings] = await Promise.all([
		getEmDashCollection("docs", { locale, status: "published", limit: 500 }),
		getSiteSettings(),
	]);
	if (error) return unavailable(context);
	if (!isUnshared(context) && cache?.enabled && cacheHint) cache.set(cacheHint);
	const { siteTitle, siteTagline } = resolveBlogSiteIdentity(settings);
	return reply(context, 200, buildLlmsTxt({ site, locale, siteTitle, tagline: siteTagline, entries }), TEXT);
}

/**
 * One doc as Markdown. 404 when it does not exist, and on zh-CN when only the en fallback exists:
 * the zh-CN llms.txt lists translated docs only, and the en Markdown has its own URL.
 * A response for everyone else is the published copy only. For an editor or a preview request core returns
 * the draft revision (`isPreview`), and that is served too, but privately (`reply` marks it `private, no-store`).
 */
export async function docMarkdown(locale: string, context: APIContext): Promise<Response> {
	const { params, site, cache } = context;
	if (!site) throw new Error("astro.config `site` must be set");
	const slug = decodeSlug(params.slug);
	if (!slug) return notFound(context);
	const { entry: doc, error, cacheHint, fallbackLocale, isPreview } = await getEmDashEntry("docs", slug, { locale });
	if (error) return unavailable(context);
	if (!doc || fallbackLocale) return notFound(context);
	const unshared = isUnshared(context);
	// Core's normal path already returns published entries only; this keeps the one publicly cacheable path
	// from depending on that.
	if (!unshared && (isPreview || doc.data.status !== "published")) return notFound(context);
	if (!unshared && cache?.enabled && cacheHint) cache.set(cacheHint);
	return reply(context, 200, docToMarkdown(doc.data, { origin: site.origin }), MARKDOWN);
}
