// Heading ids for doc pages (spec 2026-10-17 docs UX §3.2): the old site's custom id where it had one
// (legacy-anchors.json, made by scripts/legacy-anchors.mjs), else the slug Docusaurus gives (github-slugger,
// de-duplicated per page with "-1", "-2"). The ids of all 35 migrated docs matched the old site's pages (2026-10-17).
import GithubSlugger, { slug } from "github-slugger";
import LEGACY from "./legacy-anchors.json" with { type: "json" };

/** The text of a Portable Text block: its children's text joined (an inline-code or linked span keeps its text). */
export function blockText(block) {
	if (!Array.isArray(block?.children)) return "";
	return block.children.map((c) => (typeof c?.text === "string" ? c.text : "")).join("");
}

/** A top-level text block styled h2-h6. The doc title is the page's h1, so h1 blocks get no anchor. */
export const isHeading = (block) => block?._type === "block" && typeof block.style === "string" && /^h[2-6]$/.test(block.style);

/** The old site's custom ids for one doc: { "<heading text>": "<id>" }. */
export function legacyIdsFor(locale, slug) {
	const key = `${locale}/${slug}`;
	return Object.hasOwn(LEGACY, key) ? LEGACY[key] : {};
}

/**
 * [{ key, level, text, id }] for every h2-h6 block of `body`, in order. A keyed heading takes its custom id from
 * `legacyIds` (once per text), else the page slugger's slug; custom ids do not count for de-duplication, as in
 * Docusaurus. A block without _key gets the plain slug of its text (Heading.astro computes the same); empty text, no id.
 */
export function headingAnchors(body, legacyIds = {}) {
	const slugger = new GithubSlugger();
	const usedCustom = new Set();
	const anchors = [];
	for (const block of Array.isArray(body) ? body : []) {
		if (!isHeading(block)) continue;
		const text = blockText(block);
		const key = typeof block._key === "string" && block._key ? block._key : null;
		let id;
		if (!text.trim()) id = "";
		else if (!key) id = slug(text);
		else if (Object.hasOwn(legacyIds, text) && !usedCustom.has(text)) {
			usedCustom.add(text);
			id = legacyIds[text];
		} else id = slugger.slug(text);
		anchors.push({ key, level: Number(block.style.slice(1)), text, id });
	}
	return anchors;
}

/** "On this page": the h2 and h3 entries that have an id (Docusaurus's default range). */
export const tocEntries = (anchors) => anchors.filter((a) => a.id && a.level <= 3);

/** { <block _key>: <id> }, what DocsPage hands Heading.astro through Astro.locals.headingIds. */
export const idsByKey = (anchors) => Object.fromEntries(anchors.filter((a) => a.key && a.id).map((a) => [a.key, a.id]));
