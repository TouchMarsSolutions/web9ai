// Inline-style values allowed in rendered Markdown. Content is published by AI agents without review, so
// every value is checked against a small grammar: known CSS functions only, no quotes, escapes or comments,
// no protocol-relative URLs, no viewport units, and per-property caps.
// No math functions (calc, min, max, clamp): a sum or a division can exceed a cap while each number stays under it.
// Every number needs a unit from PX_PER_UNIT: exponents and absolute, viewport or container units fail.
// Caps compare px equivalents with em = rem = 16px. That bounds the value token, not the rendered size:
// nested headings would inflate em, so global.css resets a heading inside a heading in .prose to font-size: inherit.
// box-shadow takes px lengths and unitless 0 only: a shadow paints outside its box, and relative units compound.
// margin takes no minus sign anywhere: a minus after a number or % (0-256px) is still a negative margin.
// font-size takes no em, rem, % or larger/smaller keywords: relative sizes compound through nested elements.
// line-height is normal or a unitless number from 1 to 4.
// CSS-wide keywords (inherit, initial, unset, revert, revert-layer) fail on every property: inherit copies the
// parent's value (unset does too on inherited properties), and the rest take a value from outside this grammar.
// Box properties are block-only; markdown.mjs enforces that, because this module sees only values.
export const CSS_FUNCTIONS = new Set([
	"rgb", "rgba", "hsl", "hsla", "hwb",
	"linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient",
]); // no var(): it can carry fallbacks; no calc/min/max/clamp (see header)

const ALLOWED_CHARS = /^[a-z0-9 #%.,()+\-/]*$/i; // plain space only: no \t \n \r \f, quotes, `_`, `:`, `;`, `\`, `*`, `@`, `!`
const CSS_WIDE_KEYWORD = /\b(?:inherit|initial|unset|revert|revert-layer)\b/i;
const FUNCTION_CALL = /(-?[a-z][a-z0-9-]*)\s*\(/gi;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/gi;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb)\([^()]*\)/gi;
const VIEWPORT_UNIT = /[\d.](?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))\b/i;
const NUMBER = /(\d*\.\d+|\d+)([a-z]+|%)?/gi;
const LINE_HEIGHT_NUMBER = /^\d+(?:\.\d+)?$/;
const PX_PER_UNIT = new Map([["", 1], ["px", 1], ["rem", 16], ["em", 16], ["%", 1], ["deg", 1]]);
const RELATIVE_FONT_UNITS = new Set(["em", "rem", "%"]);
const RELATIVE_FONT_KEYWORD = /\b(?:larger|smaller)\b/i;
const MAX_NUMBER = { "box-shadow": 64, border: 32, "border-radius": 1000, margin: 256, padding: 256, "font-size": 128 }; // default 2000
const NO_NEGATIVE = new Set(["margin"]);

export function isSafeCssValue(prop, value) {
	const v = String(value).trim();
	if (!v || v.length > 200 || !ALLOWED_CHARS.test(v)) return false;
	if (CSS_WIDE_KEYWORD.test(v)) return false;
	if (prop === "line-height") return v.toLowerCase() === "normal" || (LINE_HEIGHT_NUMBER.test(v) && Number(v) >= 1 && Number(v) <= 4);
	if (v.includes("/*") || v.includes("//")) return false;
	for (const m of v.matchAll(FUNCTION_CALL)) if (!CSS_FUNCTIONS.has(m[1].toLowerCase())) return false;
	let depth = 0;
	for (const ch of v) {
		if (ch === "(") depth++;
		else if (ch === ")" && --depth < 0) return false;
	}
	if (depth !== 0 || VIEWPORT_UNIT.test(v)) return false;
	if (NO_NEGATIVE.has(prop) && v.includes("-")) return false;
	if (prop === "font-size" && RELATIVE_FONT_KEYWORD.test(v)) return false;
	const max = MAX_NUMBER[prop] ?? 2000;
	const lengths = v.replace(HEX_COLOR, " ").replace(COLOR_FUNCTION, " "); // colour arguments are not lengths
	for (const [, number, rawUnit = ""] of lengths.matchAll(NUMBER)) {
		const unit = rawUnit.toLowerCase();
		if (prop === "font-size" && RELATIVE_FONT_UNITS.has(unit)) return false;
		if (prop === "box-shadow" && unit !== "px" && !(unit === "" && Number(number) === 0)) return false;
		const factor = PX_PER_UNIT.get(unit);
		if (factor === undefined || Number(number) * factor > max) return false;
	}
	return true;
}

/** sanitize-html's allowedStyles only calls `.test(value)` on each entry. */
export const safeValueFor = (prop) => ({ test: (value) => isSafeCssValue(prop, value) });
