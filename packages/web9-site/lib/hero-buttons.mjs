// The buttons of a `hero` block (pages.layout, seed blockTypes): a label and a link the site may render.
// Core validates `url` block fields on write, but Hero is rendered from storage, so each href goes through the
// shared link rule (@web9/blocks/href, the same as core's isSafeHref) again; a button without one is dropped.
import { safeHref } from "@web9/blocks/href";

/** [{ label, href, primary }]: the primary button, then the secondary one, minus any without a label or a safe href. */
export function heroButtons(block) {
	return [
		{ label: block.primary_label, href: safeHref(block.primary_href), primary: true },
		{ label: block.secondary_label, href: safeHref(block.secondary_href), primary: false },
	].filter((x) => x.label && x.href);
}
