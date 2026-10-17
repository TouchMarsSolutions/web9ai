// Delimiter density of Markdown fields (spec 2026-10-17 §3.6, markdown-density.mjs): marked is super-linear in some
// delimiters, so each Markdown field within its length cap holds at most FIELD_CAPS of each class, at most DEST_PARENS[0]
// "(" in link destinations, LINE_BUDGET[0] line breaks × characters, LINE_MARKERS markers on one line, LINK_TAIL steps at
// the end of a bare link and LINK_STARTS link starts in one run, and a value at most VALUE_CAPS, DEST_PARENS[1] and
// LINE_BUDGET[1].
// The render tests take the worst fuzzed pattern of each class at its cap and allow 4× the 50 ms target, so a slow
// machine does not flake them; the measured times are in the spec.
import { createRequire } from "node:module";
import { Lexer } from "marked";
import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.mjs";
import { renderInlineMarkdown, renderMarkdown } from "./markdown.mjs";
import { DEST_PARENS, FIELD_CAPS, LINE_BUDGET, LINE_MARKERS, LINK_STARTS, LINK_TAIL, VALUE_CAPS, markdownDensity } from "./markdown-density.mjs";
import { guardPortableText } from "./pt-guard.mjs";

const require = createRequire(import.meta.url);
const name = (c) => (c === "](" ? '"](" link openers' : `"${c}" characters`);
/** `k` copies of `unit`, then "a" up to `len` characters. */
const dense = (unit, k, len = LIMITS.markdown) => (unit.repeat(k) + "a".repeat(len)).slice(0, len);
const callout = (body) => ({ _type: "callout", _key: "c", body });
/** A bare link whose run fills `len` characters and ends in `tail`. */
const linkWithTail = (tail, len = LIMITS.markdown) => `http://a.b/${"a".repeat(len - 11 - tail.length)}${tail}`;
// What marked's url tokenizer drops from the end of a bare link one per pass
const TAIL_CHARS = [..."?!.,:;*_'\"~)"];

describe("caps", () => {
	it("were measured on marked 16.4.2: an upgrade has to be fuzzed again before this pin moves (spec 2026-10-17 §3.6)", () => {
		expect(require("marked/package.json").version).toBe("16.4.2");
	});
	it("are the measured ones, each at least twice the corpus maximum", () => {
		expect(FIELD_CAPS).toEqual({ "*": 40, _: 30, "~": 20, "`": 80, "!": 10, "<": 46, "\\": 10, "](": 20 });
		expect(VALUE_CAPS).toEqual({ "*": 224, _: 110, "~": 40, "`": 236, "!": 90, "<": 54, "\\": 10, "](": 34 });
		// twice the stored maxima: 272 line breaks in a 6196-character field, 3135629 summed over one value
		expect([LINE_BUDGET, DEST_PARENS, LINE_MARKERS]).toEqual([[2 * 272 * 6196, 2 * 3135629], [40, 200], 8]);
		// stored at most 2 of each
		expect([LINK_TAIL, LINK_STARTS]).toEqual([16, 16]);
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
	it("counts the steps at the end of a bare link: each trailing character marked drops, and each \"&name;\" entity", () => {
		expect(markdownDensity("see http://a.b/x).").linkTail).toBe(2);
		expect(markdownDensity(`www.a/${TAIL_CHARS.join("")}&amp;&a1;`).linkTail).toBe(14);
		// "&#41;" is not an entity to marked, so only its ";" is dropped
		expect(markdownDensity("http://a.b/&#41;").linkTail).toBe(1);
		// a link start is "www." in lower case or a protocol in any case, then a domain character
		expect(markdownDensity("HTTPS://a.b/)) ftp://a)").linkTail).toBe(2);
		expect(markdownDensity("WWW.a/)) http://)) www.-))").linkTail).toBe(2);
		expect(markdownDensity("a/)) (b).").linkTail).toBe(0);
	});
	it("counts the steps before each | (a table cell ends there) and before each ( (an unmatched one cuts the first pass)", () => {
		expect(markdownDensity("|http://a.b/)))|x|").linkTail).toBe(3);
		expect(markdownDensity("http://a.b/...(x").linkTail).toBe(4);
		// before the link start, or after a space or "<", it is another run
		expect(markdownDensity(")))|http://a.b/ x))) y<)))").linkTail).toBe(0);
	});
	it("counts the link starts in one run without whitespace or \"<\"", () => {
		expect(markdownDensity("[http://a.b](http://a.b) www.a").linkStarts).toBe(2);
		// "wwww.a" holds one start, "www.a"; the "<" ends the run
		expect(markdownDensity("wwww.a(www.a(http://a<http://a").linkStarts).toBe(3);
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
	it("caps the steps at the end of a bare link, each trailing character and entity at 16 and 17", () => {
		const message = (n) => [`#0 callout body: at most ${LINK_TAIL} punctuation characters or entities at the end of a link (got ${n})`];
		for (const c of TAIL_CHARS) {
			// "!" has its own cap of 10
			const tail = (n) => (c === "!" ? `${".".repeat(n - FIELD_CAPS["!"])}${"!".repeat(FIELD_CAPS["!"])}` : c.repeat(n));
			expect(guardPortableText([callout(linkWithTail(tail(LINK_TAIL)))]), c).toEqual([]);
			expect(guardPortableText([callout(linkWithTail(tail(LINK_TAIL + 1)))]), c).toEqual(message(LINK_TAIL + 1));
		}
		expect(guardPortableText([callout(linkWithTail("&amp;".repeat(LINK_TAIL)))])).toEqual([]);
		expect(guardPortableText([callout(linkWithTail("&amp;".repeat(LINK_TAIL + 1)))])).toEqual(message(LINK_TAIL + 1));
		// one closing parenthesis, as in a Wikipedia link inside parentheses
		expect(guardPortableText([callout("(see http://a.b/x) and https://en.wikipedia.org/wiki/A_(b).)")])).toEqual([]);
	});
	it("caps each shape marked backpedals at 16 and 17: trailing ), entities, a table cell, a cut at an unmatched (", () => {
		const SHAPES = {
			"trailing )": (n) => linkWithTail(")".repeat(n)),
			entities: (n) => linkWithTail("&a;".repeat(n)),
			// marked ends the cell's run at the "|"; the raw run ends with it
			"a table cell": (n) => `|a|\n|-|\n|${linkWithTail(")".repeat(n), LIMITS.markdown - 10)}|`,
			// the first pass stops at the "(", then the dots go one per pass
			"a cut at an unmatched (": (n) => linkWithTail(`${".".repeat(n - 1)}(a`),
		};
		for (const [what, text] of Object.entries(SHAPES)) {
			expect(guardPortableText([callout(text(LINK_TAIL))]), what).toEqual([]);
			expect(guardPortableText([callout(text(LINK_TAIL + 1))]), what).toEqual([
				`#0 callout body: at most ${LINK_TAIL} punctuation characters or entities at the end of a link (got ${LINK_TAIL + 1})`,
			]);
		}
	});
	it("accepts a bare link that ends in one closing parenthesis", () => {
		expect(markdownDensity("http://a.b/x)").linkTail).toBe(1);
		expect(guardPortableText([callout("http://a.b/x)")])).toEqual([]);
	});
	it("rejects the bare-link payloads that took 0.3-0.8 s within every other cap", () => {
		const message = (n) => [`#0 callout body: at most ${LINK_TAIL} punctuation characters or entities at the end of a link (got ${n})`];
		for (const c of [")", ";", '"', "'", ":", "?"]) expect(guardPortableText([callout(`http://a.b/${c.repeat(24000)}`)]), c).toEqual(message(24000));
		expect(guardPortableText([callout(`www.a/${",".repeat(24000)}`)])).toEqual(message(24000));
		expect(guardPortableText([callout(`http://a.b/${"&a;".repeat(8000)}`)])).toEqual(message(8000));
		expect(guardPortableText([callout(`|a|\n|-|\n|http://a.b/${")".repeat(24000)}|`)])).toEqual(message(24000));
		expect(guardPortableText([callout(`http://a.b/${".".repeat(24000)}(a`)])).toEqual(message(24001));
	});
	it("caps the link starts in one run at 16 and 17", () => {
		expect(guardPortableText([callout("www.a(".repeat(LINK_STARTS))])).toEqual([]);
		expect(guardPortableText([callout("www.a(".repeat(LINK_STARTS + 1))])).toEqual([
			`#0 callout body: at most ${LINK_STARTS} link starts (http://, www. and the like) in one run without spaces (got ${LINK_STARTS + 1})`,
		]);
		expect(guardPortableText([callout("www.a( ".repeat(1000))])).toEqual([]);
	});
	it("never counts fewer steps than marked's own url tokenizer takes (marked 16.4.2's url and _backpedal rules)", () => {
		const { _backpedal, url } = Lexer.rules.inline.gfm;
		const passes = (s) => {
			let n = -1;
			for (let prev; prev !== s; n++) [prev, s] = [s, _backpedal.exec(s)?.[0] ?? ""];
			return n;
		};
		const units = ["http://a", "www.b", ...TAIL_CHARS, "(", "|", "&a;", "&", "&#1;", "x", "/"];
		let seed = 1;
		const random = (n) => (seed = (seed * 48271) % 2147483647) % n;
		for (let t = 0; t < 4000; t++) {
			let run = "http://a";
			for (let k = random(14); k > 0; k--) run += units[random(units.length)];
			const { linkTail } = markdownDensity(run);
			// every link start, ending at the run end or at a "|" as a table cell does
			for (let i = 0; i < run.length; i++) {
				for (const end of [run.length, ...[...run].keys()].filter((e) => e > i && (e === run.length || run[e] === "|"))) {
					const link = url.exec(run.slice(i, end));
					if (link && link[2] !== "@") expect(passes(link[0]), run).toBeLessThanOrEqual(linkTail);
				}
			}
		}
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
		// a bare link's run is rescanned once per trailing character or entity marked drops
		...TAIL_CHARS.map((c) => [
			`"${c}" at the end of a bare link`,
			linkWithTail(c === "!" ? `${".".repeat(6)}${"!".repeat(10)}` : c.repeat(16)),
			`http://a.b/${c.repeat(24000)}`,
		]),
		["entities at the end of a bare link", linkWithTail("&a;".repeat(16)), `http://a.b/${"&a;".repeat(8000)}`],
		["a bare link in a table cell", `|a|\n|-|\n|${linkWithTail(")".repeat(16), LIMITS.markdown - 10)}|`, `|a|\n|-|\n|http://a.b/${")".repeat(24000)}|`],
		["a bare link cut at an unmatched (", linkWithTail(`${".".repeat(15)}(a`), `http://a.b/${".".repeat(24000)}(a`],
		["link starts in one run, each cut at (", dense("www.a(", 16), "www.a(".repeat(4166)],
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
