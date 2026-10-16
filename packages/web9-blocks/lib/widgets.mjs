// Widget content is written through REST (widget-areas/*/widgets), not through content:beforeSave, so the
// save-time guard never sees it (spec §10). SafeWidgetArea runs this check before rendering an area.
import { guardPortableText } from "./pt-guard.mjs";

/**
 * @param {{ widgets?: Array<{ type?: string, content?: unknown }> } | null | undefined} area
 * @returns {boolean} true only if every `content` widget holds Portable Text that passes guardPortableText
 */
export function widgetAreaIsSafe(area) {
	for (const widget of area?.widgets ?? []) {
		if (widget?.type !== "content") continue;
		const { content } = widget;
		if (content === undefined || content === null) continue;
		if (!Array.isArray(content) || guardPortableText(content).length > 0) return false;
	}
	return true;
}
