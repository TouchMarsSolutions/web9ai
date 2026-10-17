// Delimiter density of a Markdown field (spec 2026-10-17 §3.6). The length caps (LIMITS.markdown, LIMITS.inlineMarkdown,
// MAX_MARKDOWN in pt-guard) bound size, not marked's render CPU: marked 16 is super-linear in some delimiters, so a field
// within its length cap could still take seconds on every page view. Found with a fuzz of renderMarkdown (every pattern
// of 1-4 delimiter tokens repeated to 25000 characters, the known cases, and 1-3 tokens over the other ASCII
// punctuation) and measured on one worker:
// - "](" opens a link. When the link does not close, the link regex backtracks through the destination (the run after
//   "](" up to whitespace) and at each "(" in it tries a "(...)" title that scans to the end of the text, so the cost is
//   link openers × "(" in their destinations × length: cubic in dense link openers (20 × 252 took 529 ms at 25000).
//   Counting the "(" of each opener's destination bounds the product.
// - "*", "_", "~", "`" and "!" end a text token, and at each token start the GFM email lookahead scans the run of email
//   characters that follows; they are email characters themselves, so k of them in one run cost k × run. Emphasis and
//   code spans also scan for their closer from each opener.
// - Each "<" starts an HTML tag, comment, declaration or autolink that marked scans for and sanitize-html then parses: with
//   ">" and "?" around them ("<<?" repeated) a field took 0.1 s, though "<" alone is linear.
// - Each "\" escape rebuilds the masked copy of the text that marked keeps for emphasis (Lexer.inlineTokens), and
//   "[``\" repeated is exponential in the link-label regex (a 300-character tagline took over 2 s); it needs a "\" per unit.
// - marked's list loop reads each line of an item with split("\n", 1) on the rest of the field, so lazy continuation
//   lines cost line breaks × the length after them (one item and 12000 lines took 1.1 s). Hence a budget of line breaks
//   × field characters rather than a line cap: a short field may hold many lines, a long one fewer.
// - List and quote markers nest one container each, and marked recurses per container: about 1900 markers on one line
//   overflow the stack and the render throws (fewer on a smaller stack). Nesting by indentation needs a quadratic number
//   of characters, so only markers on one line are capped.
// Each cap is twice the most any stored entry or revision holds. Alone, most classes stay fast well above their caps,
// but a field that combines all of them with lazy lines and escaped text already takes most of the budget at these.
// ">", "#", "-", "+", "|", "![" and the rest are linear once these are capped, so they are not counted. Fuzz,
// corpus maxima and timings are in the spec.

/** The most of each class one Markdown field may hold: "](" counts link openers. */
export const FIELD_CAPS = { "*": 40, _: 30, "~": 20, "`": 80, "!": 10, "<": 46, "\\": 10, "](": 20 };
/** The most of each class all the Markdown fields of one value may hold together. */
export const VALUE_CAPS = { "*": 224, _: 110, "~": 40, "`": 236, "!": 90, "<": 54, "\\": 10, "](": 34 };
/** The most line breaks × field characters: [per field, summed over the fields of a value]. */
export const LINE_BUDGET = [3370624, 6271258];
/** The most "(" in link destinations: [per field, per value]. */
export const DEST_PARENS = [40, 200];
/** The most list or quote markers at the start of one line. */
export const LINE_MARKERS = 8;

const isSpace = (c) => c === " " || c === "\t";
// The destination run of marked's link regex ([^ \t\n\x00-\x1f]*) ends at a space or a control character
const endsRun = (code) => code <= 0x20;
const SPACE = /\s/;
const THEMATIC_BREAK = /^[ \t]*([-*])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * Counts of each capped class, the line breaks, the "(" in link destinations (after each "](", skip whitespace, then the
 * run that marked's link regex takes as the destination) and the most markers at the start of one line, in linear time:
 * destination runs are walked once from the end, and each line's markers are read once.
 */
export function markdownDensity(src) {
	// marked reads "\r\n" and a lone "\r" as line breaks (Lexer.lex)
	const text = src.replace(/\r\n?/g, "\n");
	const counts = Object.fromEntries(Object.keys(FIELD_CAPS).map((c) => [c, 0]));
	let lineBreaks = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "]") {
			if (text[i + 1] === "(") counts["]("]++;
		} else if (c === "\n") lineBreaks++;
		else if (Object.hasOwn(counts, c)) counts[c]++;
	}
	// parensFrom[i]: the "(" from i to the end of the run that holds i (0 at a run end)
	const parensFrom = new Uint32Array(text.length + 1);
	for (let i = text.length - 1; i >= 0; i--) parensFrom[i] = endsRun(text.charCodeAt(i)) ? 0 : parensFrom[i + 1] + (text[i] === "(" ? 1 : 0);
	let destParens = 0;
	for (let i = text.indexOf("]("); i !== -1; i = text.indexOf("](", i + 1)) {
		let j = i + 2;
		while (j < text.length && SPACE.test(text[j])) j++;
		destParens += parensFrom[j];
	}
	return { counts, lineBreaks, destParens, ...lineMarkers(text) };
}

/**
 * The most list or quote markers at the start of one line, and that line (1-based, the first such): ">", or "-", "*",
 * "+" or 1-9 digits and "." or ")" before a space, tab or line end, after optional indentation.
 */
function lineMarkers(text) {
	let max = 0;
	let markerLine = 0;
	for (let start = 0, line = 1; start <= text.length; line++) {
		let end = text.indexOf("\n", start);
		if (end === -1) end = text.length;
		let i = start;
		let n = 0;
		const markerEnd = (j) => j >= end || isSpace(text[j]);
		while (i < end && isSpace(text[i])) i++;
		while (i < end) {
			let next = -1;
			if (text[i] === ">") next = i + 1;
			else if ((text[i] === "-" || text[i] === "*" || text[i] === "+") && markerEnd(i + 1)) next = i + 1;
			else {
				let d = i;
				while (d < end && d - i < 9 && text[d] >= "0" && text[d] <= "9") d++;
				if (d > i && (text[d] === "." || text[d] === ")") && markerEnd(d + 1)) next = d + 1;
			}
			if (next === -1) break;
			n++;
			i = next;
			while (i < end && isSpace(text[i])) i++;
		}
		// "- - -" or "* * * *" alone on a line is a thematic break, which nests nothing
		if (n > 2 && THEMATIC_BREAK.test(text.slice(start, end))) n = 0;
		if (n > max) [max, markerLine] = [n, line];
		start = end + 1;
	}
	return { lineMarkers: max, markerLine };
}
