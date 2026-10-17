// Cross-task invariants of the security model (spec §10) that no other test pins.
// vitest has no Astro plugin, so these read the source of src/ instead of rendering it.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const srcFiles = readdirSync(new URL("../../src", import.meta.url), { recursive: true })
	.filter((f) => /\.(astro|mjs|ts|tsx|js)$/.test(f))
	.map((f) => `src/${f}`);

describe("widget areas", () => {
	it("render through SafeWidgetArea in Base.astro (footer) and posts/[slug].astro (sidebar)", () => {
		for (const [file, area] of [
			["src/layouts/Base.astro", "footer"],
			["src/pages/posts/[slug].astro", "sidebar"],
		]) {
			const source = raw(file);
			expect(source, file).toMatch(/^import \{ SafeWidgetArea \} from "@web9\/blocks\/astro";$/m);
			expect(source, file).toContain(`<SafeWidgetArea name="${area}" />`);
		}
	});
	it("never render through core's WidgetArea anywhere in src/ (it renders content widgets unchecked)", () => {
		expect(srcFiles).toContain("src/layouts/Base.astro");
		for (const file of srcFiles) expect(raw(file), file).not.toMatch(/\bWidgetArea\b/);
	});
});

describe("set:html in src/", () => {
	it("appears only for the static theme icons and the search snippet core has already escaped", () => {
		const sites = srcFiles.flatMap((file) => [...raw(file).matchAll(/set:html=\{([^}]*)\}/g)].map((m) => [file, m[1]]));
		expect(sites).toEqual([
			["src/layouts/Base.astro", "ICONS[b.theme]"],
			["src/pages/search.astro", "result.snippet"],
		]);
		expect(srcFiles.filter((file) => raw(file).includes("set:html")).sort()).toEqual(["src/layouts/Base.astro", "src/pages/search.astro"]);
	});
});
