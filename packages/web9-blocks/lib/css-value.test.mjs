import { describe, expect, it } from "vitest";
import { isSafeCssValue } from "./css-value.mjs";

describe("isSafeCssValue", () => {
	it.each([
		["color", "#E6E6FA"],
		["color", "rgb(10, 20, 30)"],
		["background", "linear-gradient(135deg, rgba(148, 0, 211, 0.9), #4B0082)"],
		["background", "radial-gradient(circle, rgba(255,255,255,.4), transparent)"],
		["width", "calc(100% - 20px)"],
		["max-width", "min(100%, 600px)"],
		["padding", "100px 20px"],
		["margin", "0 auto"],
		["box-shadow", "0 2px 8px rgba(0,0,0,0.2)"],
		["font-size", "1.2em"],
	])("accepts %s: %s", (prop, value) => expect(isSafeCssValue(prop, value)).toBe(true));
	it.each([
		["background", "red\nurl(//evil.example/t.gif)"],
		["background", "url(https://evil.example/t.gif)"],
		["background", "image-set('//evil.example/t.gif' 1x)"],
		["background", "-webkit-image-set(x 1x)"],
		["background", "cross-fade(a, b)"],
		["background", "src(x)"],
		["background", "element(#foo)"],
		["background", "paint(foo)"],
		["width", "attr(data-w px)"],
		["color", "var(--x, red)"],
		["background", "//evil.example/t.gif"],
		["box-shadow", "0 0 0 9999px red"],
		["box-shadow", "0 0 0 100vmax #000"],
		["width", "100vw"],
		["margin", "-9999px 0 0 -9999px"],
		["margin", "-1px"],
		["padding", "99999px"],
		["font-size", "9999px"],
		["color", "red /* x */"],
		["color", "expression(alert(1))"],
		["width", "calc((100% - 1px)"],
		["color", ""],
	])("rejects %s: %j", (prop, value) => expect(isSafeCssValue(prop, value)).toBe(false));
});
