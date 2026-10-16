// Widgets are written through REST (widget-areas/*/widgets), not through content:beforeSave, so the save-time
// guard never sees them (spec §10). SafeWidgetArea runs this check before rendering an area, and a widget area
// renders in the footer of every page, so the check fails closed: false on anything it does not recognise, and
// false (never a throw) on anything it cannot read.
// Content widgets are not rendered at all: their Portable Text renders inside core <WidgetArea>, where a renderer
// throw (deep mark nesting, a non-string _key, ...) cannot be caught and takes down every page. The site uses no
// content widgets (the seed footer is empty, the sidebar holds core components); text goes in a doc or page.

const TYPES = new Set(["menu", "component"]);

// Every string a widget renders is bounded, and so is the number of widgets: core expands urlTemplate once per
// post (count up to 100), so a 2 MB template becomes hundreds of MB of HTML on every page.
const MAX_STRING = 200;
const MAX_MENU_NAME = 100;
const MAX_WIDGETS = 20;

const isString = (v) => typeof v === "string" && v.length <= MAX_STRING;
const isBoolean = (v) => typeof v === "boolean";
// count/limit reach SQL LIMIT or slice(); a fraction or a huge value is not a count anyone set on purpose
const isCount = (v) => Number.isInteger(v) && v >= 1 && v <= 100;
const oneOf = (...values) => (v) => values.includes(v);

// The five widgets in emdash components/WidgetRenderer.astro (componentMap, lines 19-25; line 36 indexes
// that plain object with widget.componentId, so "constructor" or "toString" resolves to an inherited function
// and throws at render). The props are the `Props` interface of each components/widgets/*.astro, which
// widgets/components.ts also declares; WidgetRenderer spreads componentProps into them unchecked. Astro reads
// some prop keys itself before the component runs ("server:component-directive" throws), so a key the
// component does not declare fails the area.
const COMPONENT_PROPS = {
	"core:recent-posts": { count: isCount, showThumbnails: isBoolean, showDate: isBoolean, urlTemplate: isString },
	"core:categories": { showCount: isBoolean, hierarchical: isBoolean },
	"core:tags": { showCount: isBoolean, limit: isCount },
	"core:search": { placeholder: isString },
	"core:archives": { type: oneOf("monthly", "yearly"), limit: isCount },
};

function componentIsSafe(widget) {
	const { componentId, componentProps } = widget;
	if (typeof componentId !== "string" || !Object.hasOwn(COMPONENT_PROPS, componentId)) return false;
	if (componentProps === undefined || componentProps === null) return true;
	if (typeof componentProps !== "object" || Array.isArray(componentProps)) return false;
	const declared = COMPONENT_PROPS[componentId];
	return Object.keys(componentProps).every(
		(name) => Object.hasOwn(declared, name) && (componentProps[name] === undefined || declared[name](componentProps[name])),
	);
}

function widgetIsSafe(widget) {
	if (!widget || typeof widget !== "object" || !TYPES.has(widget.type)) return false;
	if (widget.title !== undefined && widget.title !== null && !isString(widget.title)) return false;
	if (widget.type === "component") return componentIsSafe(widget);
	// A menu widget without a menuName renders nothing (the admin palette creates it that way)
	const { menuName } = widget;
	return menuName === undefined || menuName === null || (typeof menuName === "string" && menuName.length <= MAX_MENU_NAME);
}

/**
 * @param {{ widgets?: Array<object> } | null | undefined} area
 * @returns {boolean} true only if the area holds at most 20 widgets and every one is a menu (menuName absent,
 *   null or a string of at most 100 characters) or one of the core components with only its declared
 *   componentProps, of the declared types; strings (title, urlTemplate, placeholder) hold at most 200
 *   characters; any content widget gives false
 */
export function widgetAreaIsSafe(area) {
	try {
		const widgets = area?.widgets ?? [];
		return Array.isArray(widgets) && widgets.length <= MAX_WIDGETS && widgets.every(widgetIsSafe);
	} catch {
		return false;
	}
}
