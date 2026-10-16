// Widget content is written through REST (widget-areas/*/widgets), not through content:beforeSave, so the
// save-time guard never sees it (spec §10). SafeWidgetArea runs this check before rendering an area.
import { guardPortableText } from "./pt-guard.mjs";

const TYPES = new Set(["content", "menu", "component"]);
// The keys of componentMap in emdash components/WidgetRenderer.astro (line 36 indexes that plain object with
// widget.componentId, so "constructor" or "toString" resolves to an inherited function and throws at render).
const CORE_COMPONENTS = new Set(["core:recent-posts", "core:categories", "core:tags", "core:search", "core:archives"]);

function widgetIsSafe(widget) {
	if (!widget || typeof widget !== "object" || !TYPES.has(widget.type)) return false;
	if (widget.type === "component") return typeof widget.componentId === "string" && CORE_COMPONENTS.has(widget.componentId);
	if (widget.type === "menu") return typeof widget.menuName === "string";
	const { content } = widget;
	if (content === undefined || content === null) return true;
	return Array.isArray(content) && guardPortableText(content).length === 0;
}

/**
 * @param {{ widgets?: Array<object> } | null | undefined} area
 * @returns {boolean} true only if every widget has a known type and passes its check:
 *   content: Portable Text that passes guardPortableText; component: one of the core component ids;
 *   menu: a string menuName
 */
export function widgetAreaIsSafe(area) {
	return (area?.widgets ?? []).every(widgetIsSafe);
}
