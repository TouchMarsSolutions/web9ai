// What the migrated doc pages must show (plan 2 Task 9 gate): every en doc, its zh-CN translation where
// one exists, and the zh-CN fallback page (en content plus the "not translated" notice) where none does.
import { embedSrc } from "../../packages/web9-blocks/lib/embed-url.mjs";

/** Same escaping Astro applies to text expressions. */
export const escapeHtml = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const FALLBACK_NOTICE = "本页还没有中文翻译";
const LEFTOVERS = ["ec:block", "%%youtube", "%%callout", "&lt;Tabs", "&lt;TabItem", "&lt;YouTube", "::::"];
// Markup of core's htmlBlock and embed renderers. The web9 overrides replace both (packages/web9-blocks/astro/index.mjs),
// so it never appears; matched as attributes, because the bare class names are in the page's CSS.
const CORE_RENDERERS = ['class="emdash-html-block', '<figure class="emdash-embed'];

/** The player src of each embed in a body, as web9's Embed.astro writes it (core's would be www.youtube.com/embed). */
const players = (body) =>
	(Array.isArray(body) ? body : []).flatMap((node) => {
		const src = node?._type === "embed" && embedSrc(node.url);
		return src ? [`src="${escapeHtml(src)}"`] : [];
	});

/** [{ url, present, absent }] for every doc URL the new site serves. */
export function docPageChecks(payloads) {
	const zh = new Map(payloads.filter((p) => p.doc.locale === "zh-CN").map((p) => [p.doc.slug, p]));
	return payloads
		.filter((p) => p.doc.locale === "en")
		.flatMap(({ doc, want }) => {
			const translated = zh.get(doc.slug);
			const h1 = (title) => `>${escapeHtml(title)}</h1>`;
			const absent = [...LEFTOVERS, ...CORE_RENDERERS];
			return [
				{ url: `/docs/${doc.slug}`, present: [h1(want.data.title), ...players(want.data.body)], absent: [...absent, FALLBACK_NOTICE] },
				translated
					? { url: `/zh-CN/docs/${doc.slug}`, present: [h1(translated.want.data.title), ...players(translated.want.data.body)], absent: [...absent, FALLBACK_NOTICE] }
					: { url: `/zh-CN/docs/${doc.slug}`, present: [h1(want.data.title), FALLBACK_NOTICE, ...players(want.data.body)], absent },
			];
		});
}
