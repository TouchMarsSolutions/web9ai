import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOCKS } from "../index.mjs";

// vitest has no Astro plugin, so check the module's source instead of importing the .astro files.
const source = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");

describe("astro/index.mjs", () => {
	it("maps htmlBlock and embed to the web9 components, not core's", () => {
		expect(source).toMatch(/import HtmlBlock from "\.\/HtmlBlock\.astro";/);
		expect(source).toMatch(/import Embed from "\.\/Embed\.astro";/);
		expect(source).toMatch(/^\thtmlBlock: HtmlBlock,$/m);
		expect(source).toMatch(/^\tembed: Embed,$/m);
	});
	it("registers a renderer for every block type the plugin defines", () => {
		for (const { type } of BLOCKS) expect(source).toMatch(new RegExp(`^\\t${type}: \\w+,$`, "m"));
	});
	it("exports SafeWidgetArea", () => {
		expect(source).toMatch(/export \{ default as SafeWidgetArea \} from "\.\/SafeWidgetArea\.astro";/);
	});
});
