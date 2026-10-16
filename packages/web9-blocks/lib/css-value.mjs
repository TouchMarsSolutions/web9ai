// Inline-style values allowed in rendered Markdown. Content is published by AI agents without review, so
// every value is checked against a small grammar: known CSS functions only, no quotes, no escapes, no
// comments, no protocol-relative URLs, no viewport units, and per-property size caps (a 9999px
// box-shadow spread or a -9999px margin paints over or off the page).
export const CSS_FUNCTIONS = new Set([
	"rgb", "rgba", "hsl", "hsla", "hwb",
	"linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient",
	"calc", "min", "max", "clamp",
]); // no var(): it can carry fallbacks

const ALLOWED_CHARS = /^[a-z0-9 #%.,()+\-/]*$/i; // plain space only: no \t \n \r \f, quotes, `_`, `:`, `;`, `\`, `*`, `@`, `!`
const FUNCTION_CALL = /(-?[a-z][a-z0-9-]*)\s*\(/gi;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/gi;
const NEGATIVE_NUMBER = /(?:^|[\s(,])-(?=[\d.])/;
const VIEWPORT_UNIT = /[\d.](?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))\b/i;
const MAX_NUMBER = { "box-shadow": 64, border: 32, "border-radius": 1000, margin: 256, padding: 256, "font-size": 128 }; // default 2000
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
	if (NO_NEGATIVE.has(prop) && NEGATIVE_NUMBER.test(v)) return false;
	const max = MAX_NUMBER[prop] ?? 2000;
	for (const n of v.replace(HEX_COLOR, " ").matchAll(/\d+(?:\.\d+)?|\.\d+/g)) if (Number(n[0]) > max) return false;
	return true;
}

/** sanitize-html's allowedStyles only calls `.test(value)` on each entry. */
export const safeValueFor = (prop) => ({ test: (value) => isSafeCssValue(prop, value) });
