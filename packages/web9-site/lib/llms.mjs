// /llms.txt and /zh-CN/llms.txt (llmstxt.org; spec §8): site name, summary, then one list of docs per
// sidebar group, each linking to the page's Markdown version (/docs/<slug>.md).
import { groupDocs } from "./docs-nav.mjs";

const str = (v) => (typeof v === "string" ? v : "");
const oneLine = (s) => str(s).replace(/\s+/g, " ").trim();
const escLink = (s) => oneLine(s).replace(/([[\]\\])/g, "\\$1");

const INTRO = {
	en: "Knowledge base for AI and Dev. Each link is the Markdown version of a page, without site navigation.",
	"zh-CN": "AI 与 Dev 知识库。每个链接都是页面的 Markdown 版本，不含站点导航。",
};

/**
 * Docs are published by AI agents without review, so a row may hold anything: a field of the wrong type is
 * treated as missing, and a row without a slug that makes a link is left out.
 */
function cleanEntry(entry, locale, abs) {
	const data = entry?.data;
	const slug = str(data?.slug);
	if (!slug) return null;
	let href;
	try {
		href = abs(`${locale === "en" ? "" : `/${locale}`}/docs/${encodeURIComponent(slug)}.md`);
	} catch {
		return null; // encodeURIComponent throws on a lone surrogate
	}
	return {
		href,
		data: {
			title: oneLine(data.title) || slug,
			description: oneLine(data.description),
			section: str(data.section) || undefined,
			category: str(data.category) || undefined,
			sort_order: Number.isFinite(data.sort_order) ? data.sort_order : 0,
		},
	};
}

/**
 * `site` is Astro.site (the configured origin), never the request Host. `entries` are the published docs
 * of `locale` only: the zh-CN file lists translated docs, the untranslated ones are in the en file.
 */
export function buildLlmsTxt({ site, locale, siteTitle, tagline, entries }) {
	const abs = (path) => new URL(path, site).href;
	const lines = [`# ${oneLine(siteTitle)}`, "", `> ${oneLine(tagline)}`, "", INTRO[locale] ?? INTRO.en, ""];
	const docs = (Array.isArray(entries) ? entries : []).map((e) => cleanEntry(e, locale, abs)).filter(Boolean);
	const hrefs = new Map(docs.map((d) => [d.data, d.href]));
	for (const { label, items } of groupDocs(docs, locale)) {
		lines.push(`## ${oneLine(label)}`, "");
		for (const { data } of items) {
			lines.push(`- [${escLink(data.title)}](${hrefs.get(data)})${data.description ? `: ${data.description}` : ""}`);
		}
		lines.push("");
	}
	lines.push("## Optional", "");
	lines.push(locale === "en" ? `- [中文 llms.txt](${abs("/zh-CN/llms.txt")})` : `- [English llms.txt](${abs("/llms.txt")})`);
	lines.push(`- [Blog RSS](${abs("/rss.xml")})`, `- [Sitemap](${abs("/sitemap.xml")})`);
	return `${lines.join("\n")}\n`;
}
