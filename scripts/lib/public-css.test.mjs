import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { classTokens, classifySheets, extractJsonObject, readServerBundle, scanSheet } from "./public-css.mjs";

const sheet = (css) => scanSheet({ label: "t.css", css });
const hit = (selector, why) => `t.css: ${selector} (${why})`;
const IMPORT_WHY = "a public stylesheet must not import other CSS";

describe("scanSheet", () => {
	it.each([
		[String.raw`.fixed{position:fixed}`, [hit(".fixed", "position:fixed utility"), hit(".fixed", "position:fixed")]],
		[String.raw`.md\:fixed{position:fixed}`, [hit(String.raw`.md\:fixed`, "position:fixed utility"), hit(String.raw`.md\:fixed`, "position:fixed")]],
		[String.raw`.inset-0{inset:0}`, [hit(".inset-0", "inset utility")]],
		[String.raw`.-inset-x-2{left:-.5rem}`, [hit(".-inset-x-2", "inset utility")]],
		[String.raw`.z-50{z-index:50}`, [hit(".z-50", "z-index utility")]],
		[String.raw`.h-screen{height:100vh}`, [hit(".h-screen", "*-screen size utility")]],
		[String.raw`.min-h-dvh{min-height:100dvh}`, [hit(".min-h-dvh", "viewport-unit size utility")]],
		[String.raw`.h-\[80vh\]{height:80vh}`, [hit(String.raw`.h-\[80vh\]`, "arbitrary viewport-unit value")]],
		[String.raw`.emdash-modal{position:fixed;inset:0}`, [hit(".emdash-modal", "position:fixed")]],
		[
			String.raw`.\[position\:fixed\]{position:fixed}`,
			[hit(String.raw`.\[position\:fixed\]`, "arbitrary position:fixed property"), hit(String.raw`.\[position\:fixed\]`, "position:fixed")],
		],
		[
			":root{--color-bg:var(--lightningcss-light,#fff)var(--lightningcss-dark,#000)}",
			["t.css: :root uses --color-bg from a lowered light-dark() (theme B, spec §11)"],
		],
	])("flags %s", (css, expected) => expect(sheet(css)).toEqual(expected));

	// Tailwind 4 appends `!` for the important modifier (`h-screen!`), and the old `!h-screen` form still compiles.
	it.each([
		[String.raw`.h-screen\!{height:100vh!important}`, [hit(String.raw`.h-screen\!`, "*-screen size utility")]],
		[String.raw`.w-screen\!{width:100vw!important}`, [hit(String.raw`.w-screen\!`, "*-screen size utility")]],
		[String.raw`.min-h-dvh\!{min-height:100dvh!important}`, [hit(String.raw`.min-h-dvh\!`, "viewport-unit size utility")]],
		[String.raw`@media (min-width:768px){.md\:h-screen\!{height:100vh!important}}`, [hit(String.raw`.md\:h-screen\!`, "*-screen size utility")]],
		[String.raw`.z-50\!{z-index:50!important}`, [hit(String.raw`.z-50\!`, "z-index utility")]],
		[String.raw`.inset-0\!{inset:0!important}`, [hit(String.raw`.inset-0\!`, "inset utility")]],
		[
			String.raw`.\!fixed{position:fixed!important}`,
			[hit(String.raw`.\!fixed`, "position:fixed utility"), hit(String.raw`.\!fixed`, "position:fixed")],
		],
	])("flags the important modifier: %s", (css, expected) => expect(sheet(css)).toEqual(expected));

	// `[prop:value]` utilities: the colon sits inside the brackets, so it is not a variant separator.
	it.each([
		[String.raw`.\[z-index\:50\]{z-index:50}`, [hit(String.raw`.\[z-index\:50\]`, "arbitrary z-index property")]],
		[String.raw`.\[inset\:0\]{inset:0}`, [hit(String.raw`.\[inset\:0\]`, "arbitrary inset property")]],
		[String.raw`.\[top\:0\]{top:0}`, [hit(String.raw`.\[top\:0\]`, "arbitrary inset property")]],
		[String.raw`.\[inset-inline\:0\]{inset-inline:0}`, [hit(String.raw`.\[inset-inline\:0\]`, "arbitrary inset property")]],
		[String.raw`.\[height\:100vh\]{height:100vh}`, [hit(String.raw`.\[height\:100vh\]`, "arbitrary property with a viewport-unit value")]],
		[String.raw`.\[min-height\:100DVH\]{min-height:100dvh}`, [hit(String.raw`.\[min-height\:100DVH\]`, "arbitrary property with a viewport-unit value")]],
		[
			String.raw`@media (min-width:768px){.md\:\[z-index\:9999\]{z-index:9999}}`,
			[hit(String.raw`.md\:\[z-index\:9999\]`, "arbitrary z-index property")],
		],
		[String.raw`.\[z-index\:50\]\!{z-index:50!important}`, [hit(String.raw`.\[z-index\:50\]\!`, "arbitrary z-index property")]],
	])("flags the arbitrary property: %s", (css, expected) => expect(sheet(css)).toEqual(expected));

	// `\b` fails before `_` (Tailwind's space), the unit is case-insensitive, and vmin/vmax/dvmin exist.
	it.each([
		[String.raw`.h-\[calc\(100vh_-_4rem\)\]{height:calc(100vh - 4rem)}`, String.raw`.h-\[calc\(100vh_-_4rem\)\]`],
		[String.raw`.shadow-\[0_0_0_100vmax_black\]{box-shadow:0 0 0 100vmax black}`, String.raw`.shadow-\[0_0_0_100vmax_black\]`],
		[String.raw`.h-\[100VH\]{height:100vh}`, String.raw`.h-\[100VH\]`],
		[String.raw`.h-\[100dvmin\]{height:100dvmin}`, String.raw`.h-\[100dvmin\]`],
		[String.raw`.w-\[50svw\]{width:50svw}`, String.raw`.w-\[50svw\]`],
		[String.raw`.max-h-\[100lvh\]{max-height:100lvh}`, String.raw`.max-h-\[100lvh\]`],
		[String.raw`.size-\[50vi\]{width:50vi}`, String.raw`.size-\[50vi\]`],
		[String.raw`.h-\[1\.5vb\]{height:1.5vb}`, String.raw`.h-\[1\.5vb\]`],
		[String.raw`.md\:h-\[calc\(100dvh-1px\)\]{height:calc(100dvh - 1px)}`, String.raw`.md\:h-\[calc\(100dvh-1px\)\]`],
	])("flags the arbitrary value: %s", (css, selector) => expect(sheet(css)).toEqual([hit(selector, "arbitrary viewport-unit value")]));

	it.each([
		[String.raw`@import url(/_astro/styles.qJevY_AE.css);.a{color:red}`, [hit("@import url(/_astro/styles.qJevY_AE.css)", IMPORT_WHY)]],
		[String.raw`@import "other.css" layer(base);`, [hit('@import "other.css" layer(base)', IMPORT_WHY)]],
		[String.raw`@IMPORT url(x.css);`, [hit("@IMPORT url(x.css)", IMPORT_WHY)]],
		[String.raw`@layer base{.a{color:red}}@import url(x.css);`, [hit("@import url(x.css)", IMPORT_WHY)]],
	])("rejects @import: %s", (css, expected) => expect(sheet(css)).toEqual(expected));

	// Tailwind and lightningcss write a leading digit as a hex escape: `2xl:z-50` is `.\32 xl\:z-50`.
	it.each([
		[String.raw`@media (width>=96rem){.\32 xl\:z-50{z-index:50}}`, String.raw`.\32 xl\:z-50`, "z-index utility"],
		[String.raw`@media (width>=96rem){.\32 xl\:inset-0{inset:0}}`, String.raw`.\32 xl\:inset-0`, "inset utility"],
		[String.raw`@media (width>=96rem){.\32 xl\:h-screen{height:100vh}}`, String.raw`.\32 xl\:h-screen`, "*-screen size utility"],
		[String.raw`@media (width>=96rem){.\32 xl\:min-h-dvh{min-height:100dvh}}`, String.raw`.\32 xl\:min-h-dvh`, "viewport-unit size utility"],
		[String.raw`@media (width>=96rem){.\32 xl\:h-screen\!{height:100vh!important}}`, String.raw`.\32 xl\:h-screen\!`, "*-screen size utility"],
	])("flags a hex-escaped variant: %s", (css, selector, why) => expect(sheet(css)).toEqual([hit(selector, why)]));

	// `h-(--x,100vh)` is `height:var(--x,100vh)`: a viewport unit in a parenthesised value.
	it.each([
		[String.raw`.h-\(--x\,100vh\){height:var(--x,100vh)}`, String.raw`.h-\(--x\,100vh\)`],
		[String.raw`.min-h-\(--x\,100dvh\){min-height:var(--x,100dvh)}`, String.raw`.min-h-\(--x\,100dvh\)`],
		[String.raw`.w-\(--x\,100vw\){width:var(--x,100vw)}`, String.raw`.w-\(--x\,100vw\)`],
		[String.raw`.size-\(--x\,100vmax\){width:var(--x,100vmax);height:var(--x,100vmax)}`, String.raw`.size-\(--x\,100vmax\)`],
	])("flags the parenthesised value: %s", (css, selector) => expect(sheet(css)).toEqual([hit(selector, "arbitrary viewport-unit value")]));

	// Public CSS has no container-type, so container-query units resolve against the small viewport.
	it.each([
		[String.raw`.h-\[100cqh\]{height:100cqh}`, String.raw`.h-\[100cqh\]`],
		[String.raw`.size-\[100cqmax\]{width:100cqmax;height:100cqmax}`, String.raw`.size-\[100cqmax\]`],
		[String.raw`.w-\[50cqw\]{width:50cqw}`, String.raw`.w-\[50cqw\]`],
		[String.raw`.w-\[50cqi\]{width:50cqi}`, String.raw`.w-\[50cqi\]`],
		[String.raw`.h-\[50cqb\]{height:50cqb}`, String.raw`.h-\[50cqb\]`],
		[String.raw`.h-\[50cqmin\]{height:50cqmin}`, String.raw`.h-\[50cqmin\]`],
	])("flags the container-query unit: %s", (css, selector) => expect(sheet(css)).toEqual([hit(selector, "arbitrary viewport-unit value")]));
	it("flags a container-query unit in an arbitrary property", () => {
		expect(sheet(String.raw`.\[--x\:100cqh\]{--x:100cqh}`)).toEqual([
			hit(String.raw`.\[--x\:100cqh\]`, "arbitrary property with a viewport-unit value"),
		]);
	});

	// The minifier turns `100v\68` (an escape in the value) into `100vh`; the class name still holds the escape.
	it("flags a viewport unit written with a CSS escape", () => {
		expect(sheet(String.raw`.h-\[100v\\68\]{height:100vh}`)).toEqual([hit(String.raw`.h-\[100v\\68\]`, "arbitrary viewport-unit value")]);
		expect(sheet(String.raw`.h-\[100v\68 \]{height:100vh}`)).toEqual([hit(String.raw`.h-\[100v\68 \]`, "arbitrary viewport-unit value")]);
	});

	// A quote hides a bracket from the variant split: `data-[x='[']:z-50`.
	it.each([
		[String.raw`:is(.data-\[x\=\'\[\'\]\:z-50)[data-x='[']{z-index:50}`, String.raw`:is(.data-\[x\=\'\[\'\]\:z-50)[data-x='[']`, "z-index utility"],
		[String.raw`:is(.data-\[x\=\"\[\"\]\:z-50)[data-x="["]{z-index:50}`, String.raw`:is(.data-\[x\=\"\[\"\]\:z-50)[data-x="["]`, "z-index utility"],
		[String.raw`:is(.\[\&\[title\=\'\[\'\]\]\:inset-0)[title='[']{inset:0}`, String.raw`:is(.\[\&\[title\=\'\[\'\]\]\:inset-0)[title='[']`, "inset utility"],
	])("flags a utility behind a quoted variant: %s", (css, selector, why) => expect(sheet(css)).toEqual([hit(selector, why)]));

	// A hex-escaped bracket in an attribute value must not open a bracket in the class name: `data-[x=\5b]:z-50`.
	it.each([
		[String.raw`.data-\[x\=\\5b\]\:z-50[data-x="\5b"]{z-index:50}`, String.raw`.data-\[x\=\\5b\]\:z-50[data-x="\5b"]`, "z-index utility"],
		[String.raw`.data-\[x\=\\28\]\:z-50[data-x="\28"]{z-index:50}`, String.raw`.data-\[x\=\\28\]\:z-50[data-x="\28"]`, "z-index utility"],
		[String.raw`.\[\&\[title\=\\5b\]\]\:inset-0[title=\5b]{inset:0}`, String.raw`.\[\&\[title\=\\5b\]\]\:inset-0[title=\5b]`, "inset utility"],
		[
			String.raw`.group-\[\[x\=\\5b\]\]\:z-50:is(:where(.group):is([x=\5b]) *){z-index:50}`,
			String.raw`.group-\[\[x\=\\5b\]\]\:z-50:is(:where(.group):is([x=\5b]) *)`,
			"z-index utility",
		],
	])("flags a utility behind an escaped-bracket variant: %s", (css, selector, why) => expect(sheet(css)).toEqual([hit(selector, why)]));

	// Tailwind turns `_` into a space, and `\76 ` (v) absorbs it: `h-[100\76_h]` is `height:100vh` after minifying.
	it("flags a viewport unit split by an escape and an underscore", () => {
		expect(sheet(String.raw`.h-\[100\\76_h\]{height:100vh}`)).toEqual([hit(String.raw`.h-\[100\\76_h\]`, "arbitrary viewport-unit value")]);
	});
	it("flags position:fixed written with a leading underscore", () => {
		expect(sheet(String.raw`.\[position\:_fixed\]{position:fixed}`)).toEqual([
			hit(String.raw`.\[position\:_fixed\]`, "arbitrary position:fixed property"),
			hit(String.raw`.\[position\:_fixed\]`, "position:fixed"),
		]);
	});

	it.each([
		[".text-brand{color:var(--color-brand)}"],
		[".site-header{position:sticky;top:0;z-index:100}"],
		[".site-main{min-height:calc(100vh - 364px)}"],
		[".size-full{width:100%;height:100%}"],
		[".max-w-\\[1200px\\]{max-width:1200px}"],
		[":root{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light}"],
		[String.raw`.md\:flex\!{display:flex!important}`],
		[String.raw`.h-\[calc\(1px_\+_2rem\)\]{height:calc(1px + 2rem)}`],
		[String.raw`.w-\[10\%\]{width:10%}`],
		[String.raw`.\[color\:red\]{color:red}`],
		[String.raw`.\[--gap\:1rem\]{--gap:1rem}`],
		[String.raw`.\[position\:sticky\]{position:sticky}`],
		[String.raw`.h-\[10vhx\]{height:1px}`],
		[String.raw`.has-\[\:checked\]\:flex:has(:checked){display:flex}`],
		["@font-face{font-family:x;src:url(/fonts/x.woff2)}"],
		[String.raw`@media (width>=96rem){.\32 xl\:flex{display:flex}}`],
		[String.raw`.h-\(--x\,3rem\){height:var(--x,3rem)}`],
		[String.raw`.w-\[50cqx\]{width:1px}`],
		[".card{container-type:inline-size}"],
		[String.raw`.shadow-\[0_0_0_1px_black\]{box-shadow:0 0 0 1px black}`],
		[String.raw`.\[position\:_sticky\]{position:sticky}`],
		[String.raw`.data-\[x\=\\5b\]\:flex[data-x="\5b"]{display:flex}`],
	])("allows %s", (css) => expect(sheet(css)).toEqual([]));
});

// The selectors above are written by hand; this one asks the pinned Tailwind what it really emits for each class.
describe("scanSheet on Tailwind's own output", () => {
	const THEME = "@theme { --spacing: .25rem; --breakpoint-sm: 40rem; --breakpoint-md: 48rem; --breakpoint-2xl: 96rem; } @tailwind utilities;";
	const emit = async (cls) => (await compile(THEME)).build([cls]);
	const flaggedOf = async (classes) => {
		const out = [];
		for (const cls of classes) if (scanSheet({ label: "tw", css: await emit(cls) }).length) out.push(cls);
		return out;
	};
	const OVERLAY = [
		"fixed", "md:fixed", "sm:md:fixed", "data-[state=open]:fixed", "[&_p]:fixed", "[position:fixed]",
		"inset-0", "-inset-x-2", "inset-y-px", "!inset-0", "max-md:inset-0", "peer-checked:inset-0",
		"z-50", "-z-10", "z-[999]", "group-hover:z-50", "has-[:checked]:z-50",
		"h-screen", "w-screen", "min-h-screen", "max-h-screen", "h-screen!", "w-screen!", "!h-screen", "md:h-screen!",
		"w-dvw", "h-svh", "h-lvh", "min-h-dvh", "min-h-dvh!", "sm:h-dvh!",
		"h-[80vh]", "h-[100VH]", "h-[100dvmin]", "h-[calc(100vh_-_4rem)]", "w-[calc(100%+100vw)]", "top-[100vh]", "md:top-[100vh]",
		"shadow-[0_0_0_100vmax_black]",
		"2xl:z-50", "2xl:inset-0", "2xl:h-screen", "2xl:min-h-dvh", "2xl:h-screen!",
		"h-(--x,100vh)", "min-h-(--x,100dvh)", "w-(--x,100vw)", "size-(--x,100vmax)",
		"h-[100cqh]", "size-[100cqmax]", "w-[50cqw]", "w-[50cqi]", "h-[50cqb]", "h-[50cqmin]", "[--x:100cqh]",
		"data-[x=\\5b]:z-50", "data-[x=\\28]:z-50", "[&[title=\\5b]]:inset-0", "group-[[x=\\5b]]:z-50", "h-[100\\76_h]",
		"h-[100v\\68]", "data-[x='[']:z-50", "data-[x=\"[\"]:z-50", "[&[title='[']]:inset-0",
		"[z-index:50]", "md:[z-index:9999]", "[inset:0]", "[inset-inline:0]", "[top:0]", "[left:-5px]", "[height:100vh]", "hover:[inset:0]!",
	];
	const HARMLESS = ["flex", "md:flex!", "p-4", "h-full", "size-full", "sticky", "absolute", "h-[3rem]", "w-[10%]", "[color:red]", "[--gap:1rem]"];

	it("flags every overlay class", async () => expect(await flaggedOf(OVERLAY)).toEqual(OVERLAY));
	it("leaves harmless classes alone, and each of them does emit CSS", async () => {
		expect(await flaggedOf(HARMLESS)).toEqual([]);
		const silent = [];
		for (const cls of HARMLESS) if (!(await emit(cls))) silent.push(cls);
		expect(silent).toEqual([]);
	});
});

describe("classTokens", () => {
	it("unescapes and drops variants", () => {
		expect(classTokens(".sm\\:h-16 .aria-pressed\\:bg-bg:hover")).toEqual(["h-16", "bg-bg"]);
	});
	it("drops the important modifier, trailing or leading", () => {
		expect(classTokens(String.raw`.md\:h-screen\! .\!fixed .min-h-dvh\!`)).toEqual(["h-screen", "fixed", "min-h-dvh"]);
	});
	it("keeps an arbitrary property whole, with or without variants", () => {
		expect(classTokens(String.raw`.\[z-index\:50\] .md\:\[z-index\:9999\] .hover\:\[inset\:0\]\!:hover`)).toEqual([
			"[z-index:50]",
			"[z-index:9999]",
			"[inset:0]",
		]);
	});
	it("decodes hex escapes, so a leading digit survives", () => {
		expect(classTokens(String.raw`.\32 xl\:z-50 .\32 xl\:h-screen\! .\32xl\:inset-0`)).toEqual(["z-50", "h-screen", "inset-0"]);
	});
	it("decodes a hex escape in a value, also behind an escaped backslash", () => {
		expect(classTokens(String.raw`.h-\[100v\68 \] .h-\[100v\\68\]`)).toEqual(["h-[100vh]", "h-[100vh]"]);
	});
	it("decodes the second time only after the variants are split off", () => {
		expect(classTokens(String.raw`.data-\[x\=\\5b\]\:z-50 .data-\[x\=\\28\]\:z-50 .\[\&\[title\=\\5b\]\]\:inset-0 .group-\[\[x\=\\5b\]\]\:z-50`)).toEqual([
			"z-50",
			"z-50",
			"inset-0",
			"z-50",
		]);
	});
	it("turns an underscore into a space before the second decode, so an escape can absorb it", () => {
		expect(classTokens(String.raw`.h-\[100\\76_h\] .shadow-\[0_0_0_100vmax_black\]`)).toEqual(["h-[100vh]", "shadow-[0 0 0 100vmax black]"]);
	});
	it("ignores quoted brackets when dropping variants", () => {
		expect(classTokens(String.raw`.data-\[x\=\'\[\'\]\:z-50 .\[\&\[title\=\'\[\'\]\]\:inset-0 .data-\[x\=\"\[\"\]\:z-50`)).toEqual([
			"z-50",
			"inset-0",
			"z-50",
		]);
	});
	it("ignores colons inside brackets when dropping variants", () => {
		expect(classTokens(String.raw`.has-\[\:checked\]\:fixed .data-\[state\=open\]\:z-50`)).toEqual(["fixed", "z-50"]);
	});
});

describe("extractJsonObject / readServerBundle", () => {
	it("ignores braces inside strings", () => {
		const src = 'x = f({"a":"}{","b":{"c":1}}); rest }';
		expect(JSON.parse(extractJsonObject(src, src.indexOf("{")))).toEqual({ a: "}{", b: { c: 1 } });
	});
	it("finds the manifest and ?url regions", () => {
		const src = [
			'var _manifest = deserializeManifest({"rootDir":"file:///x/","routes":[]});',
			"//#region node_modules/@emdash-cms/admin/dist/styles.css?url",
			'var styles_default = "/_astro/styles.abc.css";',
		].join("\n");
		const { manifest, urlImports } = readServerBundle(["", src]);
		expect(manifest.rootDir).toBe("file:///x/");
		expect(urlImports).toEqual([{ source: "node_modules/@emdash-cms/admin/dist/styles.css", file: "_astro/styles.abc.css" }]);
	});
});

describe("classifySheets", () => {
	const route = (route, styles, type = "page") => ({ routeData: { type, route }, styles });
	const manifest = {
		routes: [
			route("/", [{ type: "external", src: "_astro/Base.css" }, { type: "inline", content: ".a{}" }]),
			route("/_emdash/admin/[...path]", [{ type: "inline", content: ".admin{position:fixed}" }]),
			route("/api", [], "endpoint"),
		],
	};
	const admin = { source: "node_modules/@emdash-cms/admin/dist/styles.css", file: "_astro/styles.css" };
	it("classifies public, inlined duplicate and admin-only files", () => {
		const clientCss = new Map([
			["_astro/Base.css", ".b{}"],
			["_astro/dup.css", ".a{}"],
			["_astro/styles.css", ".x{position:fixed}"],
		]);
		const out = classifySheets({ manifest, urlImports: [admin], clientCss });
		expect(out.errors).toEqual([]);
		expect(out.report.map(([f, v]) => `${f} ${v.split(" ")[0]}`)).toEqual(["_astro/Base.css public", "_astro/dup.css public", "_astro/styles.css admin"]);
		expect(out.sheets.map((s) => s.label)).toEqual(["_astro/Base.css", "inline style of /"]);
	});
	it("fails closed on an unknown file, a missing file and a missing manifest", () => {
		const out = classifySheets({ manifest, urlImports: [], clientCss: new Map([["_astro/other.css", ".o{}"]]) });
		expect(out.errors).toEqual([
			"route / loads _astro/Base.css, which is not a file in dist/client",
			"_astro/other.css: cannot tell whether public pages load it",
		]);
		expect(classifySheets({ manifest: null, urlImports: [], clientCss: new Map() }).errors).toHaveLength(1);
	});
	it("treats ?url CSS from anywhere but the admin package as public", () => {
		const out = classifySheets({
			manifest,
			urlImports: [{ source: "node_modules/emdash/src/x.css", file: "_astro/x.css" }],
			clientCss: new Map([["_astro/Base.css", ""], ["_astro/x.css", ".fixed{}"]]),
		});
		expect(out.errors).toEqual([]);
		expect(out.report).toEqual([
			["_astro/Base.css", "public (loaded by a public route)"],
			["_astro/x.css", "public (?url import of node_modules/emdash/src/x.css)"],
		]);
		expect(out.sheets.map((s) => s.label)).toEqual(["_astro/Base.css", "inline style of /", "_astro/x.css"]);
	});
});
