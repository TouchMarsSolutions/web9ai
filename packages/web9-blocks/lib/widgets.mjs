// Widgets are written through REST (widget-areas/*/widgets), not through content:beforeSave, so the save-time
// guard never sees them (spec §10). SafeWidgetArea runs this check before rendering an area, and a widget area
// renders in the footer of every page, so the check fails closed: false on anything it does not recognise, and
// false (never a throw) on anything it cannot read.
// A menu widget renders the items of a menu, and core's WidgetRenderer prints every item's label and titleAttr with no
// clamp, so SafeWidgetArea also checks each menu a widget names (menuIsSafe), as the menu in Base.astro is clamped.
// Content widgets are not rendered at all: their Portable Text renders inside core <WidgetArea>, where a renderer
// throw (deep mark nesting, a non-string _key, ...) cannot be caught and takes down every page. The site uses no
// content widgets (the seed footer is empty, the sidebar holds core components); text goes in a doc or page.

import { LIMITS } from "./limits.mjs";

const TYPES = new Set(["menu", "component"]);

// A footer widget renders on every page, so everything that multiplies its output is bounded: string lengths,
// the number of widgets (each componentId once, at most MAX_MENUS menus) and the item counts below.
const MAX_STRING = 200;
const MAX_MENU_NAME = 100;
const MAX_WIDGETS = 20;
const MAX_MENUS = 2;

const isString = (v) => typeof v === "string" && v.length <= MAX_STRING;
const isBoolean = (v) => typeof v === "boolean";
// count/limit reach SQL LIMIT or slice() and set how many items render; core's defaults are 5, 20 and 12
const countUpTo = (max) => (v) => Number.isInteger(v) && v >= 1 && v <= max;
const oneOf = (...values) => (v) => values.includes(v);

// The five widgets in emdash components/WidgetRenderer.astro (componentMap, lines 19-25; line 36 indexes
// that plain object with widget.componentId, so "constructor" or "toString" resolves to an inherited function
// and throws at render). The props are the `Props` interface of each components/widgets/*.astro, which
// widgets/components.ts also declares; WidgetRenderer spreads componentProps into them unchecked. Astro reads
// some prop keys itself before the component runs ("server:component-directive" throws), so a key the
// component does not declare fails the area.
// recent-posts has no urlTemplate here, so a widget that sets one fails: the site uses RecentPosts' default
// `/posts/${post.id}` (RecentPosts.astro:53-63), and a template expands `:slug`/`:path` once per post, then
// `:path` again inside the inserted slug, so its output grows quadratically.
const COMPONENT_PROPS = {
	"core:recent-posts": { count: countUpTo(20), showThumbnails: isBoolean, showDate: isBoolean },
	"core:categories": { showCount: isBoolean, hierarchical: isBoolean },
	"core:tags": { showCount: isBoolean, limit: countUpTo(50) },
	"core:search": { placeholder: isString },
	"core:archives": { type: oneOf("monthly", "yearly"), limit: countUpTo(24) },
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
 *   null or a string of at most 100 characters; at most 2 menus) or one of the core components (each at most
 *   once) with only its declared componentProps, of the declared types; strings (title, placeholder) hold at
 *   most 200 characters; any content widget gives false
 */
export function widgetAreaIsSafe(area) {
	try {
		const widgets = area?.widgets ?? [];
		if (!Array.isArray(widgets) || widgets.length > MAX_WIDGETS || !widgets.every(widgetIsSafe)) return false;
		const componentIds = widgets.filter((w) => w.type === "component").map((w) => w.componentId);
		const menus = widgets.filter((w) => w.type === "menu").length;
		return new Set(componentIds).size === componentIds.length && menus <= MAX_MENUS;
	} catch {
		return false;
	}
}

/**
 * @param {{ items?: Array<object> } | null | undefined} menu what core's getMenu returns for a menu widget (null when
 *   there is no such menu, which renders nothing)
 * @returns {boolean} true only if the menu is missing, or holds at most LIMITS.menuItems items, each with a string
 *   label of at most LIMITS.label characters, a url that is absent or a string of at most LIMITS.url, and a titleAttr
 *   that is absent, null or a string of at most LIMITS.titleAttr (what WidgetRenderer.astro prints, unclamped)
 */
export function menuIsSafe(menu) {
	try {
		if (menu === null || menu === undefined) return true;
		const items = menu.items;
		if (!Array.isArray(items) || items.length > LIMITS.menuItems) return false;
		return items.every((item) => {
			if (!item || typeof item !== "object" || Array.isArray(item)) return false;
			const { label, url, titleAttr } = item;
			return (
				typeof label === "string" &&
				label.length <= LIMITS.label &&
				(url === undefined || (typeof url === "string" && url.length <= LIMITS.url)) &&
				(titleAttr === undefined || titleAttr === null || (typeof titleAttr === "string" && titleAttr.length <= LIMITS.titleAttr))
			);
		});
	} catch {
		return false;
	}
}
