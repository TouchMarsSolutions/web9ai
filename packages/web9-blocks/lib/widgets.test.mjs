import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { widgetAreaIsSafe } from "./widgets.mjs";

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

describe("widgetAreaIsSafe", () => {
	it("passes the seed's sidebar (component widgets) and the empty footer", () => {
		expect(area("sidebar").widgets.length).toBeGreaterThan(0);
		expect(widgetAreaIsSafe(area("sidebar"))).toBe(true);
		expect(area("footer").widgets).toEqual([]);
		expect(widgetAreaIsSafe(area("footer"))).toBe(true);
	});
	it("passes a missing area and widgets without content", () => {
		expect(widgetAreaIsSafe(null)).toBe(true);
		expect(widgetAreaIsSafe(undefined)).toBe(true);
		expect(widgetAreaIsSafe({ name: "x", widgets: [{ id: "m", type: "menu", menuName: "primary" }] })).toBe(true);
		expect(widgetAreaIsSafe(withContent(undefined))).toBe(true);
		expect(widgetAreaIsSafe(withContent(null))).toBe(true);
	});
	it("passes a content widget holding a normal paragraph", () => {
		expect(widgetAreaIsSafe(withContent([paragraph]))).toBe(true);
	});
	it("rejects a content widget holding the inline-object payload", () => {
		expect(widgetAreaIsSafe(withContent([c1]))).toBe(false);
		expect(widgetAreaIsSafe(withContent([{ _type: "htmlBlock", _key: "h", html: "<b>x</b>" }]))).toBe(false);
	});
	it("rejects a content widget whose content is not an array", () => {
		expect(widgetAreaIsSafe(withContent("<script>alert(1)</script>"))).toBe(false);
		expect(widgetAreaIsSafe(withContent({ _type: "block", children: [] }))).toBe(false);
	});
	it("fails the whole area when one content widget is unsafe", () => {
		expect(widgetAreaIsSafe({ name: "x", widgets: [{ id: "a", type: "content", content: [paragraph] }, { id: "b", type: "content", content: [c1] }] })).toBe(false);
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
		expect(widgetAreaIsSafe({ widgets: [...area("sidebar").widgets, { id: "x", type: "component", componentId: "constructor" }] })).toBe(false);
	});
	it("allows a menu widget without a menuName (the admin palette creates it that way)", () => {
		expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu" }] })).toBe(true);
		expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu", menuName: null }] })).toBe(true);
	});
	it("allows only blocks in a content widget, each passing the block rules", () => {
		const link = { _type: "block", _key: "l", style: "normal", markDefs: [{ _type: "link", _key: "k1", href: "https://example.com" }], children: [{ _type: "span", _key: "s", text: "a", marks: ["k1"] }] };
		expect(widgetAreaIsSafe(withContent([paragraph, link]))).toBe(true);
		for (const node of [
			{ _type: "buttons", _key: "b", buttons: null },
			{ _type: "tabs", _key: "t", tabs: [null] },
			{ _type: "callout", _key: "c", tone: "tip", title: "t", body: "b" },
			{ _type: "tool_grid", _key: "g", tools: [] },
			{ _type: "image", _key: "i", asset: { _ref: "x" } },
			{ _type: "code", _key: "k", language: "js", code: "x" },
			{ _type: "table", _key: "t", rows: [] },
			{ _type: "break", _key: "b" },
			{ _type: "constructor", markDefs: [null] },
			{ _key: "x", markDefs: [null] },
			null,
			"text",
		]) {
			expect(widgetAreaIsSafe(withContent([paragraph, node]))).toBe(false);
		}
		expect(widgetAreaIsSafe(withContent([{ ...paragraph, style: "constructor" }]))).toBe(false);
	});
	it("checks componentProps against the props each core component declares", () => {
		const component = (componentId, componentProps) => ({ widgets: [{ id: "c", type: "component", componentId, componentProps }] });
		expect(widgetAreaIsSafe(component("core:recent-posts", { urlTemplate: 5 }))).toBe(false);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 5, showDate: true }))).toBe(true);
		expect(widgetAreaIsSafe(component("core:recent-posts", { count: 5, showThumbnails: true, showDate: false, urlTemplate: "/blog/:slug" }))).toBe(true);
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
	it("ignores unknown props and absent componentProps", () => {
		const component = (componentProps) => ({ widgets: [{ id: "c", type: "component", componentId: "core:search", componentProps }] });
		expect(widgetAreaIsSafe(component(undefined))).toBe(true);
		expect(widgetAreaIsSafe(component(null))).toBe(true);
		expect(widgetAreaIsSafe(component({}))).toBe(true);
		expect(widgetAreaIsSafe(component({ somethingElse: { nested: [1] } }))).toBe(true);
	});
	it("fails closed instead of throwing", () => {
		const marks = Array(125000).fill(0);
		const huge = { _type: "block", _key: "p", style: "normal", markDefs: [], children: [{ _type: "span", _key: "s", text: "a", marks }] };
		let result;
		expect(() => (result = widgetAreaIsSafe(withContent([huge])))).not.toThrow();
		expect(result).toBe(false);
		expect(widgetAreaIsSafe({ get widgets() { throw new Error("boom"); } })).toBe(false);
		expect(widgetAreaIsSafe({ widgets: "not an array" })).toBe(false);
	});
});
