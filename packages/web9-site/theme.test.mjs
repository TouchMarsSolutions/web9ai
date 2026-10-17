// Theme B (spec §11): light values in @theme static, dark values in :root.dark and in
// @media (prefers-color-scheme: dark) :root:not(.light). Production minify lowers light-dark(), so it
// must not come back.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const css = raw("src/styles/global.css").replace(/\/\*[\s\S]*?\*\//g, "");
// Every declaration in a block, `color-scheme` included.
const decls = (block) => Object.fromEntries([...block.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const vars = (o) => Object.keys(o).filter((k) => k.startsWith("--"));
// Every site file that could carry CSS: all of src/ plus the web9 block renderers and their stylesheet.
const SITE_FILE = /\.(css|astro|mjs|ts|js)$/;
const siteFiles = ["src", "packages/web9-blocks/astro"].flatMap((dir) =>
	readdirSync(new URL(`../../${dir}`, import.meta.url), { recursive: true })
		.filter((f) => SITE_FILE.test(f))
		.map((f) => `${dir}/${f}`),
);
function body(re) {
	const m = re.exec(css);
	if (!m) throw new Error(`block not found: ${re}`);
	return m[1];
}

describe("theme B tokens", () => {
	const light = decls(body(/@theme static \{([^}]*)\}/));
	const dark = decls(body(/:root\.dark \{([^}]*)\}/));
	const media = decls(body(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\.light\) \{([^}]*)\}/));
	it("uses the same dark palette for the toggle and for the OS preference", () => {
		expect(media).toEqual(dark);
		expect(dark["color-scheme"]).toBe("dark");
	});
	it("gives every light colour a dark value, except the ones derived from others", () => {
		const own = vars(light).filter((k) => !["--color-on-brand", "--color-brand-ring"].includes(k));
		expect(vars(dark).sort()).toEqual(own.sort());
		expect(light["--color-bg"]).toBe("#ffffff");
		expect(dark["--color-bg"]).toBe("#0d0d0d");
	});
	it("uses no light-dark() anywhere in src/ or the web9 block renderers", () => {
		expect(siteFiles).toContain("src/layouts/Base.astro");
		expect(siteFiles).toContain("src/styles/global.css");
		expect(siteFiles).toContain("packages/web9-blocks/astro/blocks.css");
		// Raw text, comments included: nothing under src/ may mention it.
		for (const p of siteFiles) expect(raw(p), p).not.toContain("light-dark(");
	});
});
