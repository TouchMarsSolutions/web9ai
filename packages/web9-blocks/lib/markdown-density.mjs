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
// - A bare link (GFM: "http://", "https://", "ftp://" or "www." and a domain character) runs to the next whitespace or
//   "<", and marked's url tokenizer then drops what may not end it one piece per pass (_backpedal): a trailing "?", "!",
//   ".", ",", ":", ";", "*", "_", "'", '"', "~" or ")", or an entity "&name;" at the end, each pass rescanning the run (a
//   link and 24000 ")" took 0.3 s, 8000 "&a;" 0.6 s). A table cell ends the run at its "|", emphasis and strikethrough
//   at their closing "*", "_" or "~" (marked lexes their inner text on its own), and an unmatched "(" cuts the first pass
//   short, so the steps before each of those count too. Each link start left after a cut rescans the rest of the run,
//   so link starts per run are capped as well ("www.a(" repeated took 0.2 s).
// - List and quote markers nest one container each, and marked recurses per container: about 1900 markers on one line
//   overflow the stack and the render throws (fewer on a smaller stack). Nesting by indentation needs a quadratic number
//   of characters, so only markers on one line are capped.
// Each cap is twice the most any stored entry or revision holds. Alone, most classes stay fast well above their caps,
// but a field that combines all of them with lazy lines and escaped text already takes most of the budget at these. The
// two bare-link caps are 16 (stored at most 2), where a field stays within a few ms of its linear cost.
// ">", "#", "-", "+", "|", "![" and the rest are linear once these are capped, so they are not counted (")", ".", ":" and
// the other link-tail characters are counted only at the end of a bare link). Fuzz, corpus maxima and timings are in the
// spec.

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
/** The most _backpedal steps (trailing punctuation or entities) at the end of one bare link. */
export const LINK_TAIL = 16;
/** The most bare link starts in one run without whitespace or "<". */
export const LINK_STARTS = 16;

const isSpace = (c) => c === " " || c === "\t";
// The destination run of marked's link regex ([^ \t\n\x00-\x1f]*) ends at a space or a control character
const endsRun = (code) => code <= 0x20;
const SPACE = /\s/;
const THEMATIC_BREAK = /^[ \t]*([-*])(?:[ \t]*\1){2,}[ \t]*$/;
// marked's GFM url rule: the protocol in any case, "www." in lower case, then a domain character
const LINK_START = /(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/(?=[a-zA-Z0-9-])|www\.(?=[a-zA-Z0-9-])/g;
// The run the url rule takes ([^\s<]*) and what _backpedal drops one per pass from its end
const LINK_RUN = /[^\s<]+/g;
const LINK_TAIL_CHARS = new Set("?!.,:;*_'\"~)");
const ALNUM = /[a-zA-Z0-9]/;

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
	return { counts, lineBreaks, destParens, ...lineMarkers(text), ...links(text) };
}

/**
 * The most _backpedal steps at the end of a bare link, and the most link starts in one run, in linear time. A link's
 * steps are those before the run end, before each "|" in the run (a table cell ends there), before each "*", "_" and "~"
 * (emphasis and strikethrough lex their inner text on its own, so a link inside ends at the closer) and before each "("
 * (an unmatched one cuts the first pass there: one more step); a "(" that does close, or a "|", "*", "_" or "~" that
 * closes nothing, only makes the count higher than marked's.
 */
function links(text) {
	// steps[e]: the trailing punctuation characters and "&name;" entities that end at e, one step each
	const steps = new Uint32Array(text.length + 1);
	for (let e = 1; e <= text.length; e++) {
		const c = text[e - 1];
		let n = LINK_TAIL_CHARS.has(c) ? steps[e - 1] + 1 : 0;
		if (c === ";") {
			let a = e - 2;
			while (a >= 0 && ALNUM.test(text[a])) a--;
			if (a >= 0 && a < e - 2 && text[a] === "&") n = Math.max(n, steps[a] + 1);
		}
		steps[e] = n;
	}
	let linkTail = 0;
	let linkStarts = 0;
	LINK_RUN.lastIndex = 0;
	for (let run; (run = LINK_RUN.exec(text)); ) {
		const starts = [];
		LINK_START.lastIndex = 0;
		for (let m; (m = LINK_START.exec(run[0])); ) starts.push(run.index + m.index);
		if (!starts.length) continue;
		linkStarts = Math.max(linkStarts, starts.length);
		// walk the run from its end: `most` is the largest count over the ends at or after i
		let most = steps[run.index + run[0].length];
		for (let i = run.index + run[0].length - 1, j = starts.length - 1; j >= 0; i--) {
			if (text[i] === "|" || text[i] === "*" || text[i] === "_" || text[i] === "~") most = Math.max(most, steps[i]);
			else if (text[i] === "(") most = Math.max(most, steps[i] + 1);
			if (i === starts[j]) {
				linkTail = Math.max(linkTail, most);
				j--;
			}
		}
	}
	return { linkTail, linkStarts };
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
