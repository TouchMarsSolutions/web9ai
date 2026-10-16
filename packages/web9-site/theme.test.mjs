// Theme B (spec §11): light values in @theme static, dark values in :root.dark and in
// @media (prefers-color-scheme: dark) :root:not(.light). Production minify lowers light-dark(), so it
// must not come back.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = read("src/styles/global.css");
const decls = (block) => Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
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
	});
	it("gives every light colour a dark value, except the ones derived from others", () => {
		const own = Object.keys(light).filter((k) => !["--color-on-brand", "--color-brand-ring"].includes(k));
		expect(Object.keys(dark).sort()).toEqual(own.sort());
		expect(light["--color-bg"]).toBe("#ffffff");
		expect(dark["--color-bg"]).toBe("#0d0d0d");
	});
	it("uses no light-dark() in site CSS", () => {
		for (const p of ["src/styles/global.css", "src/styles/tokens.css", "src/styles/theme.css", "src/layouts/Base.astro", "packages/web9-blocks/astro/blocks.css"]) {
			expect(read(p), p).not.toContain("light-dark(");
		}
	});
});
