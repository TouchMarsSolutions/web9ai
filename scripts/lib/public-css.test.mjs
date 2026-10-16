import { describe, expect, it } from "vitest";
import { classTokens, classifySheets, extractJsonObject, readServerBundle, scanSheet } from "./public-css.mjs";

const sheet = (css) => scanSheet({ label: "t.css", css });

describe("scanSheet", () => {
	it.each([
		[".fixed{position:fixed}", 2],
		[".md\\:fixed{position:fixed}", 2],
		[".inset-0{inset:0}", 1],
		[".-inset-x-2{left:-.5rem}", 1],
		[".z-50{z-index:50}", 1],
		[".h-screen{height:100vh}", 1],
		[".min-h-dvh{min-height:100dvh}", 1],
		[".h-\\[80vh\\]{height:80vh}", 1],
		[".emdash-modal{position:fixed;inset:0}", 1],
		[".\\[position\\:fixed\\]{position:fixed}", 1],
		[":root{--color-bg:var(--lightningcss-light,#fff)var(--lightningcss-dark,#000)}", 1],
	])("flags %s", (css, n) => expect(sheet(css)).toHaveLength(n));
	it.each([
		[".text-brand{color:var(--color-brand)}"],
		[".site-header{position:sticky;top:0;z-index:100}"],
		[".site-main{min-height:calc(100vh - 364px)}"],
		[".size-full{width:100%;height:100%}"],
		[".max-w-\\[1200px\\]{max-width:1200px}"],
		[":root{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light}"],
	])("allows %s", (css) => expect(sheet(css)).toEqual([]));
});

describe("classTokens", () => {
	it("unescapes and drops variants", () => {
		expect(classTokens(".sm\\:h-16 .aria-pressed\\:bg-bg:hover")).toEqual(["h-16", "bg-bg"]);
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
		expect(out.sheets.map((s) => s.label)).toContain("_astro/x.css");
	});
});
