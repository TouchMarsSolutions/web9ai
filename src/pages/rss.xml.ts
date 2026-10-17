import type { APIRoute } from "astro";
import { getEmDashCollection, getSiteSettings } from "emdash";

import { cacheControl, cacheControlFor } from "../../packages/web9-site/lib/cache-control.mjs";
import { resolveBlogSiteIdentity } from "../utils/site-identity";

export const GET: APIRoute = async (context) => {
	const { site } = context;
	if (!site) throw new Error("astro.config `site` must be set for RSS");
	const siteUrl = site;
	const { siteTitle, siteTagline } = resolveBlogSiteIdentity(await getSiteSettings());

	const { entries: posts, error } = await getEmDashCollection("posts", {
		orderBy: { published_at: "desc" },
		limit: 20,
	});
	// a failed read is reported as `error`; an empty channel answered 200 would be cached (spec §8)
	if (error) {
		const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
		const cc = cacheControlFor(context, 503);
		if (cc) headers["Cache-Control"] = cc;
		return new Response("Service unavailable\n", { status: 503, headers });
	}

	const items = posts
		.map((post) => {
			if (!post.data.publishedAt) return null;
			const pubDate = post.data.publishedAt.toUTCString();

			const postUrl = new URL(`/posts/${post.id}`, siteUrl).href;
			const title = escapeXml(post.data.title || "Untitled");
			const description = escapeXml(post.data.excerpt || "");

			return `    <item>
      <title>${title}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
		})
		.filter(Boolean)
		.join("\n");

	const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <description>${escapeXml(siteTagline)}</description>
	<link>${siteUrl.href}</link>
	<atom:link href="${new URL("/rss.xml", siteUrl).href}" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

	return new Response(rss, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			// an editor, edit mode or a _preview param get draft titles here: private, no-store (cache-control.mjs)
			"Cache-Control": cacheControl(context),
		},
	});
};

const XML_ESCAPE_PATTERNS = [
	[/&/g, "&amp;"],
	[/</g, "&lt;"],
	[/>/g, "&gt;"],
	[/"/g, "&quot;"],
	[/'/g, "&apos;"],
] as const;

function escapeXml(str: string): string {
	let result = str;
	for (const [pattern, replacement] of XML_ESCAPE_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}
