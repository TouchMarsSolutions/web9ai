// Delimiter density of Markdown fields (spec 2026-10-17 §3.6, markdown-density.mjs): marked is super-linear in some
// delimiters, so each Markdown field within its length cap holds at most FIELD_CAPS of each class, at most DEST_PARENS[0]
// "(" in link destinations, LINE_BUDGET[0] line breaks × characters and LINE_MARKERS markers on one line, and a value at
// most VALUE_CAPS, DEST_PARENS[1] and LINE_BUDGET[1].
// The render tests take the worst fuzzed pattern of each class at its cap and allow 4× the 50 ms target, so a slow
// machine does not flake them; the measured times are in the spec.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.mjs";
import { renderInlineMarkdown, renderMarkdown } from "./markdown.mjs";
import { DEST_PARENS, FIELD_CAPS, LINE_BUDGET, LINE_MARKERS, VALUE_CAPS, markdownDensity } from "./markdown-density.mjs";
import { guardPortableText } from "./pt-guard.mjs";

const require = createRequire(import.meta.url);
const name = (c) => (c === "](" ? '"](" link openers' : `"${c}" characters`);
/** `k` copies of `unit`, then "a" up to `len` characters. */
const dense = (unit, k, len = LIMITS.markdown) => (unit.repeat(k) + "a".repeat(len)).slice(0, len);
const callout = (body) => ({ _type: "callout", _key: "c", body });

describe("caps", () => {
	it("were measured on marked 16.4.2: an upgrade has to be fuzzed again before this pin moves (spec 2026-10-17 §3.6)", () => {
		expect(require("marked/package.json").version).toBe("16.4.2");
	});
	it("are the measured ones, each at least twice the corpus maximum", () => {
		expect(FIELD_CAPS).toEqual({ "*": 40, _: 30, "~": 20, "`": 80, "!": 10, "<": 46, "\\": 10, "](": 20 });
		expect(VALUE_CAPS).toEqual({ "*": 224, _: 110, "~": 40, "`": 236, "!": 90, "<": 54, "\\": 10, "](": 34 });
		// twice the stored maxima: 272 line breaks in a 6196-character field, 3135629 summed over one value
		expect([LINE_BUDGET, DEST_PARENS, LINE_MARKERS]).toEqual([[2 * 272 * 6196, 2 * 3135629], [40, 200], 8]);
	});
});

describe("markdownDensity", () => {
	it("counts each class, link openers as one, and \\r\\n or a lone \\r as one line break", () => {
		expect(markdownDensity("*_~`!<\\ [a](b) ![c](d)\r\n\r")).toMatchObject({
			counts: { "*": 1, _: 1, "~": 1, "`": 1, "!": 2, "<": 1, "\\": 1, "](": 2 },
			lineBreaks: 2,
		});
	});
	it("counts the ( in each link destination: after ](, whitespace, then the run up to a space or control character", () => {
		expect(markdownDensity("[a](b(c)d) (e(").destParens).toBe(1);
		expect(markdownDensity("[a](  \n (b(c\t((").destParens).toBe(2);
		// a run holding later openers counts for each of them
		expect(markdownDensity("[a]([b]((").destParens).toBe(3);
		expect(markdownDensity("(a) [b] (c)").destParens).toBe(0);
	});
	it("reads markers at the start of each line: >, - * + and 1-9 digits with . or ) before a space, tab or line end", () => {
		expect(markdownDensity("> - * + 1. 2) a").lineMarkers).toBe(6);
		expect(markdownDensity(">>>\t-\n  1)").lineMarkers).toBe(4);
		expect(markdownDensity("-a *b +c 1.a 1234567890. a").lineMarkers).toBe(0);
		expect(markdownDensity("a > b - c\n\r- - x").lineMarkers).toBe(2);
	});
	it("names the first line that holds the most markers, counting \r\n and a lone \r as one line break", () => {
		expect(markdownDensity("a\r\n> > b\r- - - c\n> > > d")).toMatchObject({ lineMarkers: 3, markerLine: 3 });
		expect(markdownDensity("a")).toMatchObject({ lineMarkers: 0, markerLine: 0 });
	});
	it("does not count a thematic break, which nests nothing", () => {
		expect(markdownDensity("- - - - - - - - - - - -\n *  *  *  *  *  *  *  *  *  *").lineMarkers).toBe(0);
		expect(markdownDensity("- - - - - - - - - - - - a").lineMarkers).toBe(12);
		expect(markdownDensity("- * - * - * - * - *").lineMarkers).toBe(10);
	});
});

describe("per field", () => {
	it("accepts each class at its cap and names the field and class one past it", () => {
		for (const [c, cap] of Object.entries(FIELD_CAPS)) {
			const unit = c === "](" ? "[a](b) " : c === "\n" ? "a\n" : `${c}a `;
			expect(guardPortableText([callout(unit.repeat(cap))]), JSON.stringify(c)).toEqual([]);
			expect(guardPortableText([callout(unit.repeat(cap + 1))]), JSON.stringify(c)).toEqual([`#0 callout body: at most ${cap} ${name(c)} (got ${cap + 1})`]);
		}
	});
	it("caps the ( in link destinations and the markers on one line", () => {
		const dest = (n) => `[a](b${"(".repeat(n)}`;
		expect(guardPortableText([callout(dest(DEST_PARENS[0]))])).toEqual([]);
		expect(guardPortableText([callout(dest(DEST_PARENS[0] + 1))])).toEqual([`#0 callout body: at most ${DEST_PARENS[0]} "(" in link destinations (got ${DEST_PARENS[0] + 1})`]);
		expect(guardPortableText([callout(`${"- ".repeat(LINE_MARKERS)}a`)])).toEqual([]);
		expect(guardPortableText([callout(`a\n\t${">".repeat(LINE_MARKERS + 1)} a\n${"> ".repeat(LINE_MARKERS + 1)}a`)])).toEqual([
			`#0 callout body: at most ${LINE_MARKERS} list or quote markers at the start of a line (got ${LINE_MARKERS + 1} on line 2)`,
		]);
	});
	it("caps line breaks × field characters: fewer line breaks in a longer field", () => {
		const lines = (len, n) => `${"a\n".repeat(n)}${"a".repeat(len - 2 * n)}`;
		expect(guardPortableText([callout(lines(25000, 134))])).toEqual([]);
		expect(guardPortableText([callout(lines(25000, 135))])).toEqual(["#0 callout body: at most 134 line breaks in a field of 25000 characters (got 135)"]);
		expect(guardPortableText([callout(lines(25000, 200))])).toEqual(["#0 callout body: at most 134 line breaks in a field of 25000 characters (got 200)"]);
		expect(guardPortableText([callout(lines(6196, 544))])).toEqual([]);
		expect(guardPortableText([callout(lines(6196, 545))])).toEqual(["#0 callout body: at most 544 line breaks in a field of 6196 characters (got 545)"]);
		// "\r\n" is one line break and two characters
		expect(guardPortableText([callout(`${"a\r\n".repeat(135)}${"a".repeat(25000 - 405)}`)])).toEqual([
			"#0 callout body: at most 134 line breaks in a field of 25000 characters (got 135)",
		]);
	});
	it("checks every Markdown field: callout title and body, details summary and body, tab bodies, tool taglines", () => {
		const over = "!a ".repeat(FIELD_CAPS["!"] + 1);
		expect(
			guardPortableText([
				{ _type: "callout", _key: "c", title: over, body: over },
				{ _type: "details", _key: "d", summary: over, body: over },
				{ _type: "tabs", _key: "t", tabs: [{ label: over, body: "a" }, { label: "l", body: over }] },
				{ _type: "tool_grid", _key: "g", tools: [{ name: over, tagline: "a" }, { name: "n", tagline: over }] },
			]),
		).toEqual(
			["#0 callout title", "#0 callout body", "#1 details summary", "#1 details body", "#2 tabs tabs[1].body", "#3 tool_grid tools[1].tagline"].map(
				(where) => `${where}: at most ${FIELD_CAPS["!"]} "!" characters (got ${FIELD_CAPS["!"] + 1})`,
			),
		);
	});
	it("skips a field over its length cap or not a string, which has its own problem", () => {
		expect(guardPortableText([callout("*".repeat(LIMITS.markdown + 1))])).toEqual([
			`#0 callout body: at most ${LIMITS.markdown} characters (got ${LIMITS.markdown + 1})`,
		]);
		expect(guardPortableText([callout(5)])).toEqual(["#0 callout body: value 5 is not allowed"]);
	});
});

describe("per value", () => {
	it("allows each class up to its value cap over all Markdown fields, and stops one past it", () => {
		for (const [c, cap] of Object.entries(VALUE_CAPS)) {
			const unit = c === "](" ? "[a](b) " : c === "\n" ? "a\n" : `${c}a `;
			const fields = (total) => {
				const out = [];
				for (let left = total; left > 0; left -= FIELD_CAPS[c]) out.push(callout(unit.repeat(Math.min(left, FIELD_CAPS[c]))));
				return out;
			};
			expect(guardPortableText(fields(cap)), JSON.stringify(c)).toEqual([]);
			expect(guardPortableText(fields(cap + 1)), JSON.stringify(c)).toEqual([`at most ${cap} ${name(c)} are allowed in Markdown in total`]);
		}
		// 6196 × 544 + 25000 × 116 + 317 × 2 = LINE_BUDGET[1]; 127 × 5 in place of the last is one over
		const lines = (len, n) => callout(`${"a\n".repeat(n)}${"a".repeat(len - 2 * n)}`);
		expect(guardPortableText([lines(6196, 544), lines(25000, 116), lines(317, 2)])).toEqual([]);
		expect(guardPortableText([lines(6196, 544), lines(25000, 116), lines(127, 5)])).toEqual([
			`at most ${LINE_BUDGET[1]} line breaks × field characters are allowed in Markdown in total`,
		]);
		const dest = (total) => {
			const out = [];
			for (let left = total; left > 0; left -= DEST_PARENS[0]) out.push(callout(`[a](b${"(".repeat(Math.min(left, DEST_PARENS[0]))}`));
			return out;
		};
		expect(guardPortableText(dest(DEST_PARENS[1]))).toEqual([]);
		expect(guardPortableText(dest(DEST_PARENS[1] + 1))).toEqual([`at most ${DEST_PARENS[1]} "(" in link destinations are allowed in Markdown in total`]);
	});
	it("counts a field over its own density cap only up to that cap, so its own problem names it", () => {
		expect(guardPortableText([callout("!".repeat(FIELD_CAPS["!"] * 20))])).toEqual([`#0 callout body: at most ${FIELD_CAPS["!"]} "!" characters (got ${FIELD_CAPS["!"] * 20})`]);
	});
});

describe("the worst fuzzed pattern of each class renders within budget at its cap", () => {
	const BUDGET_MS = 200;
	const time = (render, text) => {
		let best = Infinity;
		for (let r = 0; r < 3; r++) {
			const t = performance.now();
			render(text);
			best = Math.min(best, performance.now() - t);
		}
		return best;
	};
	// [what, field text at the caps, the same pattern one past a cap (rejected)]
	const CASES = [
		["unclosed link openers", dense("[a](a ", 20), dense("[a](a ", 21)],
		// k glued openers: each one's destination run holds the "(" of every later one, k(k-1)/2 in all
		["dense link openers", dense("[a](", 9), dense("[a](", 10)],
		["( in one link destination", dense(`[a](a${"(".repeat(40)}`, 1), dense(`[a](a${"(".repeat(41)}`, 1)],
		["( in 20 link destinations, 2 each", dense("[a](a(( ", 20), dense(`${"[a](a(( ".repeat(19)}[a](a((( `, 1)],
		["link openers, ( after whitespace", dense(`[a](a((${" [a](a".repeat(19)} (${"a(".repeat(250)}`, 1), dense(`[a](a${"(".repeat(41)}${" [a](a".repeat(19)}`, 1)],
		["*", dense("*a#", 40), dense("*a#", 41)],
		["_", dense("_a", 30), dense("_a", 31)],
		["~", dense("~~a ", 10), dense("~~a ", 11)],
		["`", dense("`a", 80), dense("`a", 81)],
		["!", dense("!_a", 10), dense("!_a", 11)],
		["< with > (tags)", dense(")<<>", 23), dense(")<<>", 24)],
		["\\ escapes", dense("\\*", 10), dense("\\*", 11)],
		["[``\\ (exponential in the link label)", dense("[``\\", 10), dense("[``\\", 11)],
		["list lazy continuation lines", `- a\n${dense("a\n", 133, LIMITS.markdown - 4)}`, `- a\n${dense("a\n", 134, LIMITS.markdown - 4)}`],
		// a long last line that starts with "<" and holds text marked escapes costs the most after lazy lines
		["list lazy lines, then \"<\" and escaped text", `- a\n${"a\n".repeat(133)}<${"&".repeat(25000)}`.slice(0, LIMITS.markdown), `- a\n${"a\n".repeat(134)}<${"&".repeat(25000)}`.slice(0, LIMITS.markdown)],
		["markers on one line", `${"+ ".repeat(8)}a`, `${"+ ".repeat(2000)}a`],
		["ordered markers on one line", `${"1. ".repeat(8)}a`, `${"1. ".repeat(2000)}a`],
	];
	for (const [what, ok, over] of CASES) {
		it(what, () => {
			expect(guardPortableText([callout(ok)])).toEqual([]);
			expect(guardPortableText([callout(over)])).not.toEqual([]);
			expect(time(renderMarkdown, ok)).toBeLessThan(BUDGET_MS);
		});
	}
	it("an inline field at its caps", () => {
		const tagline = dense("[](a ", 20, LIMITS.inlineMarkdown);
		expect(guardPortableText([{ _type: "tool_grid", _key: "g", tools: [{ name: "n", tagline }] }])).toEqual([]);
		expect(time(renderInlineMarkdown, tagline)).toBeLessThan(BUDGET_MS / 10);
	});
});
