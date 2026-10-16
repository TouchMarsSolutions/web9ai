// What the migrated doc pages must show (plan 2 Task 9 gate): every en doc, its zh-CN translation where
// one exists, and the zh-CN fallback page (en content plus the "not translated" notice) where none does.

/** Same escaping Astro applies to text expressions. */
export const escapeHtml = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const FALLBACK_NOTICE = "本页还没有中文翻译";
const LEFTOVERS = ["ec:block", "%%youtube", "%%callout", "&lt;Tabs", "&lt;TabItem", "&lt;YouTube", "::::"];

/** [{ url, present, absent }] for every doc URL the new site serves. */
export function docPageChecks(payloads) {
	const zh = new Map(payloads.filter((p) => p.doc.locale === "zh-CN").map((p) => [p.doc.slug, p]));
	return payloads
		.filter((p) => p.doc.locale === "en")
		.flatMap(({ doc, want }) => {
			const translated = zh.get(doc.slug);
			const h1 = (title) => `>${escapeHtml(title)}</h1>`;
			return [
				{ url: `/docs/${doc.slug}`, present: [h1(want.data.title)], absent: [...LEFTOVERS, FALLBACK_NOTICE] },
				translated
					? { url: `/zh-CN/docs/${doc.slug}`, present: [h1(translated.want.data.title)], absent: [...LEFTOVERS, FALLBACK_NOTICE] }
					: { url: `/zh-CN/docs/${doc.slug}`, present: [h1(want.data.title), FALLBACK_NOTICE], absent: LEFTOVERS },
			];
		});
}
