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
		for (const menuName of [undefined, null, 5, ["primary"], {}]) expect(widgetAreaIsSafe({ widgets: [{ id: "m", type: "menu", menuName }] })).toBe(false);
	});
	it("fails the whole area when one widget is bad among good ones", () => {
		expect(widgetAreaIsSafe({ widgets: [...area("sidebar").widgets, { id: "x", type: "component", componentId: "constructor" }] })).toBe(false);
	});
});
