// The tabs of a tabs block as Tabs.astro renders them. The write check rejects a bad shape (pt-guard.mjs), but stored
// values from before it, or written past it, must not take the page down: tab.label on a null tab throws.
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v : "");

/** The index of the open tab: default_tab (1-based) clamped to the tabs there are, the first when it is not an integer. */
export function activeTab(node, count) {
	const wanted = Number.isInteger(node?.default_tab) ? node.default_tab : 1;
	return Math.min(Math.max(wanted - 1, 0), Math.max(count - 1, 0));
}

/** Object tabs only; label and body as strings ("" when missing or not a string). */
export function tabItems(node) {
	const list = Array.isArray(node?.tabs) ? node.tabs : [];
	return list.filter(isObject).map((tab) => ({ label: text(tab.label), body: text(tab.body) }));
}
