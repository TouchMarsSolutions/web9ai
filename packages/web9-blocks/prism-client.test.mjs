// prism-client.mjs runs in the browser; here, Prism core runs in Node (it sets global.Prism there too). The test reads the
// client's import groups from its source and loads the same components in the same order, which checks that every
// bundled language loads on Prism core alone, that each loads after what it extends, and that the language list the
// page triggers use (prism-languages.mjs) is exactly what the client loads.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { PRISM_LANGUAGES, hasHighlightable } from "./astro/prism-languages.mjs";

const source = readFileSync(new URL("./astro/prism-client.mjs", import.meta.url), "utf8");
// Code only: a comment may use the words the parsing below looks for
const code = source.replace(/\/\/.*$/gm, "");
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const catalog = createRequire(import.meta.url)("prismjs/components.json").languages;

// The client awaits one import group at a time: [[core], [markup, clike], ...], in the order it runs them
const groups = code
	.split(/\bawait\b/)
	.slice(1)
	.map((chunk) => [...chunk.matchAll(/import\("prismjs\/components\/prism-([a-z]+)\.js"\)/g)].map((m) => m[1]))
	.filter((names) => names.length);
const components = groups.flat().filter((name) => name !== "core");
const groupOf = (name) => groups.findIndex((names) => names.includes(name));
const asList = (value) => (value === undefined ? [] : [].concat(value));

let Prism;
beforeAll(async () => {
	Prism = (await import("prismjs/components/prism-core.js")).default;
	for (const names of groups.slice(1)) await Promise.all(names.map((name) => import(`prismjs/components/prism-${name}.js`)));
});

describe("prism-client", () => {
	it("bundles the old site's code-block languages, json, and the core languages prism.js used to include", () => {
		expect([...components].sort()).toEqual([
			"bash",
			"clike",
			"csharp",
			"css",
			"java",
			"javascript",
			"json",
			"kotlin",
			"markdown",
			"markup",
			"python",
			"swift",
			"typescript",
			"yaml",
		]);
	});
	it("loads Prism core first and by itself, never the main prismjs entry (it bundles the file-highlight plugin)", () => {
		expect(groups[0]).toEqual(["core"]);
		expect(code).not.toMatch(/import\("prismjs"\)|from "prismjs"|prismjs\/plugins|prism-file-highlight/);
	});
	it("sets the manual flag before Prism core loads", () => {
		expect(source.indexOf("manual: true")).toBeGreaterThan(-1);
		expect(source.indexOf("manual: true")).toBeLessThan(source.indexOf('import("prismjs/components/prism-core.js")'));
	});
	it("loads every language in a later group than the languages it requires or may read at load", () => {
		for (const name of components) {
			for (const dep of [...asList(catalog[name].require), ...asList(catalog[name].optional)].filter((d) => components.includes(d))) {
				expect(groupOf(dep), `${dep} before ${name}`).toBeLessThan(groupOf(name));
			}
		}
		// beyond the catalog: markdown reads Prism.languages.yaml at load; css and javascript hook into markup when it exists
		expect(groupOf("yaml")).toBeLessThan(groupOf("markdown"));
		expect(groupOf("markup")).toBeLessThan(groupOf("css"));
		expect(groupOf("markup")).toBeLessThan(groupOf("javascript"));
	});
	it("clears the cached load on failure so a later call can retry", () => {
		expect(code).toMatch(/\.catch\(\(err\) => \{\s*prismPromise = undefined;\s*throw err;\s*\}\)/);
	});
	it("is exported as @web9/blocks/prism-client and @web9/blocks/prism-languages", () => {
		expect(pkg.exports["./prism-client"]).toBe("./astro/prism-client.mjs");
		expect(pkg.exports["./prism-languages"]).toBe("./astro/prism-languages.mjs");
	});
	it("highlights every bundled language and alias with Prism core alone", () => {
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
			markup: "<p class='a'>x</p>",
			css: "a { color: red; }",
		};
		for (const [lang, snippet] of Object.entries(samples)) expect(Prism.highlight(snippet, Prism.languages[lang], lang), lang).toContain('class="token');
		for (const alias of ["py", "sh", "shell", "yml", "ts", "cs", "kt", "md", "js", "html", "xml", "svg"]) expect(Prism.languages[alias], alias).toBeDefined();
	});
	it("highlights the yaml front matter of a markdown sample (yaml loads before markdown)", () => {
		const html = Prism.highlight("---\ntitle: x\n---\n\n# Hi", Prism.languages.markdown, "markdown");
		expect(html).toContain("front-matter-block");
		expect(html).toContain('<span class="token key atrule">title</span>');
	});
});

describe("PRISM_LANGUAGES", () => {
	it("is every language name and alias Prism has after the client's loads, and nothing else", () => {
		const loaded = Object.keys(Prism.languages).filter((key) => typeof Prism.languages[key] === "object" && !["plain", "plaintext", "text", "txt"].includes(key));
		expect([...PRISM_LANGUAGES].sort()).toEqual([...loaded].sort());
	});
	it("is every loaded component's name and the aliases the Prism catalog gives it", () => {
		const expected = components.flatMap((name) => [name, ...asList(catalog[name].alias)]);
		expect([...PRISM_LANGUAGES].sort()).toEqual([...new Set(expected)].sort());
	});
	it("holds lower-case names, once each", () => {
		expect(PRISM_LANGUAGES.every((name) => name === name.toLowerCase())).toBe(true);
		expect(new Set(PRISM_LANGUAGES).size).toBe(PRISM_LANGUAGES.length);
	});
});

describe("hasHighlightable", () => {
	// a root with just the part of Element the function uses: querySelectorAll("pre code") giving elements with a className
	const root = (...classNames) => ({
		queried: [],
		querySelectorAll(selector) {
			this.queried.push(selector);
			return classNames.map((className) => ({ className }));
		},
	});
	it("is true for a pre code block of a bundled language", () => {
		const r = root("language-python");
		expect(hasHighlightable(r)).toBe(true);
		expect(r.queried).toEqual(["pre code"]);
	});
	it("is true for an alias, a mixed-case class, and a language class among others", () => {
		expect(hasHighlightable(root("language-sh"))).toBe(true);
		expect(hasHighlightable(root("language-JSON"))).toBe(true);
		expect(hasHighlightable(root("hljs language-yml extra"))).toBe(true);
	});
	it("is true when any one of the blocks qualifies", () => {
		expect(hasHighlightable(root("language-chat-completions", "language-markdown"))).toBe(true);
	});
	it("is false for a language Prism does not bundle", () => {
		expect(hasHighlightable(root("language-chat-completions"))).toBe(false);
		expect(hasHighlightable(root("language-mermaid", "language-"))).toBe(false);
		expect(hasHighlightable(root("language-pythonic"))).toBe(false);
	});
	it("is false for a code block without a language class, and for no code at all", () => {
		expect(hasHighlightable(root("", "plain", "lang-python"))).toBe(false);
		expect(hasHighlightable(root())).toBe(false);
	});
	it("takes the first language class, as Prism does", () => {
		expect(hasHighlightable(root("language-chat-completions language-python"))).toBe(false);
		expect(hasHighlightable(root("language-python language-chat-completions"))).toBe(true);
	});
});
