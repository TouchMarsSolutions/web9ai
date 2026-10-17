// The buttons of a `hero` block (pages.layout, seed blockTypes): a label and a link the site may render.
// Core validates `url` block fields on write, but Hero is rendered from storage, so each href goes through the
// shared link rule (@web9/blocks/href, the same as core's isSafeHref) again; a button without one is dropped.
import { safeHref } from "@web9/blocks/href";
import { text } from "../../web9-blocks/lib/text.mjs";

/**
 * [{ label, href, primary }]: the primary button, then the secondary one, minus any without a string label or a safe
 * href (a stored label that is not a string would be printed through String(), which can throw).
 */
export function heroButtons(block) {
	return [
		{ label: text(block.primary_label), href: safeHref(block.primary_href), primary: true },
		{ label: text(block.secondary_label), href: safeHref(block.secondary_href), primary: false },
	].filter((x) => x.label && x.href);
}
