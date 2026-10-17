// Responses for readers that are not browsers (spec §8): /llms.txt and /docs/<slug>.md, per locale.
// Absolute URLs come from Astro.site, never the request Host.
// Every response, 404s included, carries `nosniff`: the .md body is Markdown written by agents and may hold raw HTML.
import type { APIContext } from "astro";
import { decodeSlug, getEmDashCollection, getEmDashEntry, getSiteSettings } from "emdash";
import { docToMarkdown } from "@web9/blocks/to-markdown";
import { buildLlmsTxt } from "../../packages/web9-site/lib/llms.mjs";
import { resolveBlogSiteIdentity } from "./site-identity";

const NOSNIFF = { "X-Content-Type-Options": "nosniff" };

const notFound = () => new Response("Not found\n", { status: 404, headers: { ...NOSNIFF, "Content-Type": "text/plain; charset=utf-8" } });

/** llms.txt listing the published docs of `locale`. */
export async function llmsTxt(locale: string, { site, cache }: APIContext): Promise<Response> {
	if (!site) throw new Error("astro.config `site` must be set");
	const [{ entries, cacheHint }, settings] = await Promise.all([
		getEmDashCollection("docs", { locale, status: "published", limit: 500 }),
		getSiteSettings(),
	]);
	if (cache?.enabled && cacheHint) cache.set(cacheHint);
	const { siteTitle, siteTagline } = resolveBlogSiteIdentity(settings);
	return new Response(buildLlmsTxt({ site, locale, siteTitle, tagline: siteTagline, entries }), {
		headers: { ...NOSNIFF, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
	});
}

/**
 * One doc as Markdown. 404 when it does not exist, and on zh-CN when only the en fallback exists:
 * the zh-CN llms.txt lists translated docs only, and the en Markdown has its own URL.
 * Only published docs are served: a draft or preview copy (an editor or a preview token makes
 * getEmDashEntry return one) is a 404, because this response is publicly cacheable.
 */
export async function docMarkdown(locale: string, { params, site, cache }: APIContext): Promise<Response> {
	if (!site) throw new Error("astro.config `site` must be set");
	const slug = decodeSlug(params.slug);
	if (!slug) return notFound();
	const { entry: doc, cacheHint, fallbackLocale, isPreview } = await getEmDashEntry("docs", slug, { locale });
	if (!doc || fallbackLocale || isPreview || doc.data.status !== "published") return notFound();
	if (cache?.enabled && cacheHint) cache.set(cacheHint);
	return new Response(docToMarkdown(doc.data, { origin: site.origin }), {
		headers: { ...NOSNIFF, "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" },
	});
}
