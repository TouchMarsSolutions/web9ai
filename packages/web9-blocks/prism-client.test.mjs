// prism-client.mjs runs in the browser; here, Prism core runs in Node (it sets global.Prism there too), which checks
// that every bundled language loads on core alone, in any order, as the client loads them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./astro/prism-client.mjs", import.meta.url), "utf8");
const languages = [...source.matchAll(/import\("prismjs\/components\/prism-([a-z]+)\.js"\)/g)].map((m) => m[1]);
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

describe("prism-client", () => {
	it("bundles exactly the languages of the old site's code blocks, plus javascript (in core) and json", () => {
		expect([...languages].sort()).toEqual(["bash", "csharp", "java", "json", "kotlin", "markdown", "python", "swift", "typescript", "yaml"]);
	});
	it("sets the manual flag before Prism core loads", () => {
		expect(source.indexOf("manual: true")).toBeGreaterThan(-1);
		expect(source.indexOf("manual: true")).toBeLessThan(source.indexOf('import("prismjs")'));
	});
	it("is exported as @web9/blocks/prism-client", () => {
		expect(pkg.exports["./prism-client"]).toBe("./astro/prism-client.mjs");
	});
	it("highlights every bundled language and alias with Prism core alone", async () => {
		const { default: Prism } = await import("prismjs");
		await Promise.all(languages.map((l) => import(`prismjs/components/prism-${l}.js`)));
		const samples = {
			python: "def f():\n    return 1",
			bash: "echo $HOME",
			yaml: "key: value",
			typescript: "const x: number = 1;",
			javascript: "const x = 1;",
			json: '{"a": 1}',
			kotlin: "fun main() {}",
			java: "class A {}",
			csharp: "class A {}",
			swift: "let x = 1",
			markdown: "# Title",
		};
		for (const [lang, code] of Object.entries(samples)) expect(Prism.highlight(code, Prism.languages[lang], lang), lang).toContain('class="token');
		for (const alias of ["py", "sh", "shell", "yml", "ts", "cs", "kt", "md"]) expect(Prism.languages[alias], alias).toBeDefined();
	});
});
