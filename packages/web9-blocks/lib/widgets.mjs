// Widget content is written through REST (widget-areas/*/widgets), not through content:beforeSave, so the
// save-time guard never sees it (spec §10). SafeWidgetArea runs this check before rendering an area, and a
// widget area renders in the footer of every page, so the check fails closed: false on anything it does not
// recognise, and false (never a throw) on anything it cannot read.
import { guardPortableText } from "./pt-guard.mjs";

const TYPES = new Set(["content", "menu", "component"]);

const isString = (v) => typeof v === "string";
const isBoolean = (v) => typeof v === "boolean";
// count/limit reach SQL LIMIT or slice(); a fraction or a huge value is not a count anyone set on purpose
const isCount = (v) => Number.isInteger(v) && v >= 1 && v <= 100;
const oneOf = (...values) => (v) => values.includes(v);

// The five widgets in emdash components/WidgetRenderer.astro (componentMap, lines 19-25; line 36 indexes
// that plain object with widget.componentId, so "constructor" or "toString" resolves to an inherited function
// and throws at render). The props are the `Props` interface of each components/widgets/*.astro, which
// widgets/components.ts also declares; WidgetRenderer spreads componentProps into them unchecked. Props
// the component does not declare are ignored by it, so they are ignored here too.
const COMPONENT_PROPS = {
	"core:recent-posts": { count: isCount, showThumbnails: isBoolean, showDate: isBoolean, urlTemplate: isString },
	"core:categories": { showCount: isBoolean, hierarchical: isBoolean },
	"core:tags": { showCount: isBoolean, limit: isCount },
	"core:search": { placeholder: isString },
	"core:archives": { type: oneOf("monthly", "yearly"), limit: isCount },
};

const isBlockNode = (node) => node !== null && typeof node === "object" && node._type === "block";

function componentIsSafe(widget) {
	const { componentId, componentProps } = widget;
	if (typeof componentId !== "string" || !Object.hasOwn(COMPONENT_PROPS, componentId)) return false;
	if (componentProps === undefined || componentProps === null) return true;
	if (typeof componentProps !== "object" || Array.isArray(componentProps)) return false;
	return Object.entries(COMPONENT_PROPS[componentId]).every(([name, ok]) => componentProps[name] === undefined || ok(componentProps[name]));
}

function widgetIsSafe(widget) {
	if (!widget || typeof widget !== "object" || !TYPES.has(widget.type)) return false;
	if (widget.type === "component") return componentIsSafe(widget);
	// A menu widget without a menuName renders nothing (the admin palette creates it that way)
	if (widget.type === "menu") return widget.menuName === undefined || widget.menuName === null || typeof widget.menuName === "string";
	const { content } = widget;
	if (content === undefined || content === null) return true;
	// Blocks only: the other types are for pages and posts, where a malformed one only breaks its own page
	return Array.isArray(content) && content.every(isBlockNode) && guardPortableText(content).length === 0;
}

/**
 * @param {{ widgets?: Array<object> } | null | undefined} area
 * @returns {boolean} true only if every widget has a known type and passes its check:
 *   content: Portable Text made of blocks that pass guardPortableText; component: one of the core ids with
 *   componentProps of the declared types; menu: a string menuName when present
 */
export function widgetAreaIsSafe(area) {
	try {
		return (area?.widgets ?? []).every(widgetIsSafe);
	} catch {
		return false;
	}
}
