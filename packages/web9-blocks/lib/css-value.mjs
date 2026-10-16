// Inline-style values allowed in rendered Markdown. Content is published by AI agents without review, so
// every value is checked against a small grammar: known CSS functions only, no quotes, no escapes, no
// comments, no protocol-relative URLs, no viewport units, non-negative margins, and per-property size caps.
// No math functions (calc, min, max, clamp): a sum or a division can exceed a cap while each number stays under it.
// Every number needs a unit from PX_PER_UNIT. Exponents (1e4px reads as 1 with unit e), absolute units and
// viewport or container units fail. Caps compare px equivalents: rem and em both count x16 (em only sizes
// in-flow boxes, see box-shadow); unitless line-height counts x128 because it multiplies the font-size.
// box-shadow takes px lengths and unitless 0 only: a shadow is the one property that paints outside its box,
// and em, rem and % compound through nesting with no bound per element.
// margin takes no minus sign anywhere: a minus after a number or % (0-256px) is still a negative margin.
// font-size takes no em, rem, % or larger/smaller keywords: relative sizes compound through nested elements.
export const CSS_FUNCTIONS = new Set([
	"rgb", "rgba", "hsl", "hsla", "hwb",
	"linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient",
]); // no var(): it can carry fallbacks; no calc/min/max/clamp (see header)

const ALLOWED_CHARS = /^[a-z0-9 #%.,()+\-/]*$/i; // plain space only: no \t \n \r \f, quotes, `_`, `:`, `;`, `\`, `*`, `@`, `!`
const FUNCTION_CALL = /(-?[a-z][a-z0-9-]*)\s*\(/gi;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/gi;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb)\([^()]*\)/gi;
const VIEWPORT_UNIT = /[\d.](?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))\b/i;
const NUMBER = /(\d*\.\d+|\d+)([a-z]+|%)?/gi;
const PX_PER_UNIT = new Map([["", 1], ["px", 1], ["rem", 16], ["em", 16], ["%", 1], ["deg", 1]]);
const RELATIVE_FONT_UNITS = new Set(["em", "rem", "%"]);
const RELATIVE_FONT_KEYWORD = /\b(?:larger|smaller)\b/i;
const MAX_NUMBER = { "box-shadow": 64, border: 32, "border-radius": 1000, margin: 256, padding: 256, "font-size": 128, "line-height": 512 }; // default 2000
const NO_NEGATIVE = new Set(["margin"]);

export function isSafeCssValue(prop, value) {
	const v = String(value).trim();
	if (!v || v.length > 200 || !ALLOWED_CHARS.test(v)) return false;
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
		const factor = unit === "" && prop === "line-height" ? 128 : PX_PER_UNIT.get(unit);
		if (factor === undefined || Number(number) * factor > max) return false;
	}
	return true;
}

/** sanitize-html's allowedStyles only calls `.test(value)` on each entry. */
export const safeValueFor = (prop) => ({ test: (value) => isSafeCssValue(prop, value) });
