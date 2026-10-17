// Sanitizer for raw HTML fields (htmlBlock.html, embed.html). Unlike renderMarkdown it never runs marked
// (which would turn indented children into code blocks and inject <em>), and it keeps no class, id,
// data-* or style: class + data-astro-cid-* can reproduce any scoped component rule in the public CSS,
// for example a position:absolute; inset:0 cover background (spec §10).
import sanitizeHtml from "sanitize-html";
import { ALLOWED_TAGS } from "./markdown.mjs";
import { safeHref } from "./href.mjs";

/** Every link opens in a new tab; an href that fails the site's href rule (href.mjs) is dropped. */
function transformLink(tagName, attribs) {
	const { href, ...rest } = attribs;
	return { tagName, attribs: { ...(safeHref(href) ? attribs : rest), rel: "noopener noreferrer", target: "_blank" } };
}

const OPTIONS = {
	allowedTags: ALLOWED_TAGS,
	allowedAttributes: {
		a: ["href", "title", "target", "rel"],
		img: ["src", "alt", "width", "height", "loading"],
		td: ["colspan", "rowspan"],
		th: ["colspan", "rowspan", "scope"],
	},
	allowedSchemes: ["http", "https", "mailto", "tel"],
	allowProtocolRelative: false,
	transformTags: { a: transformLink },
};

export function sanitizeHtmlFragment(html) {
	if (typeof html !== "string") return "";
	return sanitizeHtml(html, OPTIONS);
}
