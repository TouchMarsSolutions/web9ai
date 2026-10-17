import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.mjs";
import { menuIsSafe, widgetAreaIsSafe } from "./widgets.mjs";

const seed = JSON.parse(readFileSync(new URL("../../../seed/seed.json", import.meta.url), "utf8"));
const area = (name) => seed.widgetAreas.find((a) => a.name === name);
const span = (text) => ({ _type: "span", _key: "s", text, marks: [] });
const paragraph = { _type: "block", _key: "p", style: "normal", markDefs: [], children: [span("hello")] };
const c1 = {
	_type: "block",
	_key: "p",
	style: "normal",
	markDefs: [],
	children: [
		{ _type: "cover", _key: "c", minHeight: "1px;position:fixed;inset:0;z-index:99999", content: [] },
		{ _type: "iframe", _key: "f", src: "https://evil.example/login", height: 10000 },
	],
};
const withContent = (content) => ({ name: "footer", widgets: [{ id: "w", type: "content", title: "x", content }] });
// Seed widgets carry `props`; applySeed stores them as component_props, read back as componentProps
const stored = (a) => ({ ...a, widgets: a.widgets.map(({ props, ...w }) => (props ? { ...w, componentProps: props } : w)) });

describe("widgetAreaIsSafe", () => {
	it("passes the seed's sidebar (component widgets, as stored) and the empty footer", () => {
		expect(area("sidebar").widgets.length).toBeGreaterThan(0);
		expect(stored(area("sidebar")).widgets.filter((w) => w.componentProps)).toHaveLength(2);
		expect(widgetAreaIsSafe(stored(area("sidebar")))).toBe(true);
		expect(area("footer").widgets).toEqual([]);
		expect(widgetAreaIsSafe(area("footer"))).toBe(true);
	});
	it("passes a missing area and a menu widget", () => {
		expect(widgetAreaIsSafe(null)).toBe(true);
		expect(widgetAreaIsSafe(undefined)).toBe(true);
		expect(widgetAreaIsSafe({ name: "x", widgets: [{ id: "m", type: "menu", menuName: "primary" }] })).toBe(true);
	});
	it("never renders a content widget, whatever it holds (use a doc or page instead)", () => {
		expect(widgetAreaIsSafe(withContent([paragraph]))).toBe(false);
		expect(widgetAreaIsSafe(withContent([]))).toBe(false);
		expect(widgetAreaIsSafe(withContent(undefined))).toBe(false);
		expect(widgetAreaIsSafe(withContent(null))).toBe(false);
		expect(widgetAreaIsSafe(withContent([c1]))).toBe(false);
		expect(widgetAreaIsSafe({ widgets: [...stored(area("sidebar")).widgets, { id: "w", type: "content", content: [paragraph] }] })).toBe(false);
	});
	it("accepts the five core component ids and a menu with a name", () => {
		for (const componentId of ["core:recent-posts", "core:categories", "core:tags", "core:search", "core:archives"]) {
			expect(widgetAreaIsSafe({ widgets: [{ id: "c", type: "component", componentId }] })).toBe(true);
		}
		expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu", menuName: "primary" }] })).toBe(true);
	});
	it("rejects inherited property names and unknown ids as componentId (WidgetRenderer.astro:36 indexes a plain object)", () => {
		for (const componentId of ["constructor", "toString", "__proto__", "hasOwnProperty", "core:unknown", "", 7, null, undefined]) {
			expect(widgetAreaIsSafe({ widgets: [{ id: "c", type: "component", componentId }] })).toBe(false);
		}
	});
	it("rejects an unknown or missing widget type", () => {
		for (const type of ["html", "script", "constructor", "", undefined, null, 1]) expect(widgetAreaIsSafe({ widgets: [{ id: "x", type }] })).toBe(false);
		expect(widgetAreaIsSafe({ widgets: [null] })).toBe(false);
	});
	it("rejects a menu widget whose menuName is not a string", () => {
		for (const menuName of [5, ["primary"], {}, true]) expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu", menuName }] })).toBe(false);
	});
	it("fails the whole area when one widget is bad among good ones", () => {
		expect(widgetAreaIsSafe({ widgets: [...stored(area("sidebar")).widgets, { id: "x", type: "component", componentId: "constructor" }] })).toBe(false);
	});
	it("allows a menu widget without a menuName (the admin palette creates it that way)", () => {
		expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu" }] })).toBe(true);
		expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu", menuName: null }] })).toBe(true);
	});
	it("checks componentProps against the props each core component declares", () => {
		const component = (componentId, componentProps) => ({ widgets: [{ id: "c", type: "component", componentId, componentProps }] });
		expect(widgetAreaIsSafe(component("core:recent-posts", { urlTemplate: 5 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 5, showDate: true }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 5, showThumbnails: true, showDate: false }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:recent-posts", "x"))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", ["x"]))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: "5" }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", { showDate: "yes" }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: null }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 2.5 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 0 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 101 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:categories", { showCount: 1 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:categories", { showCount: true, hierarchical: false }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:tags", { limit: Number.NaN }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:tags", { showCount: true, limit: 20 }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:search", { placeholder: 5 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:search", { placeholder: "Find" }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:archives", { type: "weekly" }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:archives", { type: "constructor" }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:archives", { type: "yearly", limit: 6 }))).toBe(true);
	});
	it("rejects componentProps keys the component does not declare (Astro reads some keys before the component runs)", () => {
		const component = (componentProps) => ({ widgets: [{ id: "c", type: "component", componentId: "core:search", componentProps }] });
		expect(widgetAreaIsSafe(component({ "server:component-directive": "defer" }))).toBe(false);
		expect(widgetAreaIsSafe(component({ "client:load": true }))).toBe(false);
		expect(widgetAreaIsSafe(component({ somethingElse: { nested: [1] } }))).toBe(false);
		expect(widgetAreaIsSafe(component({ placeholder: "Find", extra: 1 }))).toBe(false);
		expect(widgetAreaIsSafe(component({ count: 5 }))).toBe(false);
		expect(widgetAreaIsSafe(component(JSON.parse('{"__proto__":{"placeholder":"x"}}')))).toBe(false);
		expect(widgetAreaIsSafe(component({ constructor: "x" }))).toBe(false);
	});
	it("caps declared string props at 200 characters", () => {
		const component = (componentId, componentProps) => ({ widgets: [{ id: "c", type: "component", componentId, componentProps }] });
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 100, urlTemplate: "/" + ":slug".repeat(399999) }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:search", { placeholder: "x".repeat(200) }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:search", { placeholder: "x".repeat(201) }))).toBe(false);
	});
	it("caps widget titles at 200 characters and menuName at 100, on any widget type", () => {
		const titled = (type, title, extra = {}) => ({ widgets: [{ id: "w", type, title, ...extra }] });
		expect(widgetAreaIsSafe(titled("component", "x".repeat(200), { componentId: "core:search" }))).toBe(true);
		expect(widgetAreaIsSafe(titled("component", "x".repeat(201), { componentId: "core:search" }))).toBe(false);
		expect(widgetAreaIsSafe(titled("menu", "x".repeat(201)))).toBe(false);
		expect(widgetAreaIsSafe(titled("menu", 5))).toBe(false);
		expect(widgetAreaIsSafe(titled("menu", null))).toBe(true);
		expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu", menuName: "x".repeat(100) }] })).toBe(true);
		expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu", menuName: "x".repeat(101) }] })).toBe(false);
	});
	it("fails an area with more than 20 widgets", () => {
		const menus = (n) => ({ widgets: Array.from({ length: n }, (_, k) => ({ id: `m${k}`, type: "menu", menuName: "primary" })) });
		expect(widgetAreaIsSafe(menus(21))).toBe(false);
	});
	it("rejects urlTemplate on core:recent-posts (templates expand :slug and :path per post, quadratically)", () => {
		const recent = (componentProps) => ({ widgets: [{ id: "c", type: "component", componentId: "core:recent-posts", componentProps }] });
		expect(widgetAreaIsSafe(recent({ urlTemplate: "/posts/:slug" }))).toBe(false);
		expect(widgetAreaIsSafe(recent({ count: 5, urlTemplate: "/posts/:id" }))).toBe(false);
		expect(widgetAreaIsSafe(recent({ count: 5 }))).toBe(true);
	});
	it("allows each componentId once per area and at most 2 menu widgets", () => {
		const search = { id: "s", type: "component", componentId: "core:search" };
		const menu = (k) => ({ id: `m${k}`, type: "menu", menuName: "primary" });
		expect(widgetAreaIsSafe({ widgets: [search, { ...search, id: "s2" }] })).toBe(false);
		expect(widgetAreaIsSafe({ widgets: [...stored(area("sidebar")).widgets, { id: "r2", type: "component", componentId: "core:recent-posts" }] })).toBe(false);
		expect(widgetAreaIsSafe({ widgets: [menu(1), menu(2), menu(3)] })).toBe(false);
		expect(widgetAreaIsSafe({ widgets: [menu(1), menu(2)] })).toBe(true);
		expect(widgetAreaIsSafe({ widgets: [...stored(area("sidebar")).widgets, menu(1), menu(2)] })).toBe(true);
	});
	it("caps recent-posts count at 20, tags limit at 50 and archives limit at 24", () => {
		const component = (componentId, componentProps) => ({ widgets: [{ id: "c", type: "component", componentId, componentProps }] });
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 20 }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 21 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:tags", { limit: 50 }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:tags", { limit: 51 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:archives", { limit: 24 }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:archives", { limit: 25 }))).toBe(false);
		for (const [id, key] of [["core:recent-posts", "count"], ["core:tags", "limit"], ["core:archives", "limit"]]) {
			expect(widgetAreaIsSafe(component(id, { [key]: 1 }))).toBe(true);
			for (const v of [0, 1.5]) expect(widgetAreaIsSafe(component(id, { [key]: v }))).toBe(false);
		}
	});
	it("passes absent, null and empty componentProps", () => {
		const component = (componentProps) => ({ widgets: [{ id: "c", type: "component", componentId: "core:search", componentProps }] });
		expect(widgetAreaIsSafe(component(undefined))).toBe(true);
		expect(widgetAreaIsSafe(component(null))).toBe(true);
		expect(widgetAreaIsSafe(component({}))).toBe(true);
	});
	it("fails closed instead of throwing", () => {
		const boom = () => {
			throw new Error("boom");
		};
		let result;
		expect(() => (result = widgetAreaIsSafe({ get widgets() { return boom(); } }))).not.toThrow();
		expect(result).toBe(false);
		expect(widgetAreaIsSafe({ widgets: [{ id: "x", get type() { return boom(); } }] })).toBe(false);
		expect(widgetAreaIsSafe({ widgets: [{ id: "c", type: "component", componentId: "core:search", componentProps: { get placeholder() { return boom(); } } }] })).toBe(false);
		expect(widgetAreaIsSafe({ widgets: "not an array" })).toBe(false);
	});
});

describe("menuIsSafe", () => {
	const item = (extra = {}) => ({ id: "i", label: "Docs", url: "/docs", children: [], ...extra });
	const menu = (items) => ({ id: "m", name: "primary", label: "Primary", items });
	it("passes a missing menu (a menu widget renders nothing without one) and an empty or ordinary menu", () => {
		expect(menuIsSafe(null)).toBe(true);
		expect(menuIsSafe(undefined)).toBe(true);
		expect(menuIsSafe(menu([]))).toBe(true);
		expect(menuIsSafe(menu([item(), item({ titleAttr: "Read the docs", target: "_blank" }), item({ titleAttr: null }), item({ titleAttr: undefined })]))).toBe(true);
	});
	it("caps the number of items at LIMITS.menuItems", () => {
		expect(menuIsSafe(menu(Array.from({ length: LIMITS.menuItems }, () => item())))).toBe(true);
		expect(menuIsSafe(menu(Array.from({ length: LIMITS.menuItems + 1 }, () => item())))).toBe(false);
	});
	it("caps a label at LIMITS.label, a url at LIMITS.url and a titleAttr at LIMITS.titleAttr, and a label must be a string", () => {
		expect(menuIsSafe(menu([item({ label: "x".repeat(LIMITS.label) })]))).toBe(true);
		expect(menuIsSafe(menu([item({ label: "x".repeat(LIMITS.label + 1) })]))).toBe(false);
		expect(menuIsSafe(menu([item({ url: "/" + "x".repeat(LIMITS.url - 1) })]))).toBe(true);
		expect(menuIsSafe(menu([item({ url: "/" + "x".repeat(LIMITS.url) })]))).toBe(false);
		expect(menuIsSafe(menu([item({ titleAttr: "x".repeat(LIMITS.titleAttr) })]))).toBe(true);
		expect(menuIsSafe(menu([item({ titleAttr: "x".repeat(LIMITS.titleAttr + 1) })]))).toBe(false);
		for (const label of [undefined, null, 5, ["a"], {}]) expect(menuIsSafe(menu([item({ label })])), String(label)).toBe(false);
	});
	it("treats an absent url as fine and any other non-string url, or non-string titleAttr, as unsafe", () => {
		expect(menuIsSafe(menu([{ label: "a" }]))).toBe(true);
		for (const url of [null, 5, ["/a"], {}]) expect(menuIsSafe(menu([item({ url })])), String(url)).toBe(false);
		for (const titleAttr of [5, ["a"], {}, true]) expect(menuIsSafe(menu([item({ titleAttr })])), String(titleAttr)).toBe(false);
	});
	it("fails on a menu or item that is not shaped as core returns it", () => {
		for (const bad of ["x", 5, [], {}, { items: null }, { items: "x" }, { items: {} }]) expect(menuIsSafe(bad), JSON.stringify(bad)).toBe(false);
		for (const badItem of [null, undefined, 5, "x", []]) expect(menuIsSafe(menu([badItem])), String(badItem)).toBe(false);
	});
	it("fails closed instead of throwing", () => {
		const boom = () => {
			throw new Error("boom");
		};
		let result;
		expect(() => (result = menuIsSafe({ get items() { return boom(); } }))).not.toThrow();
		expect(result).toBe(false);
		expect(menuIsSafe(menu([{ get label() { return boom(); } }]))).toBe(false);
	});
});
