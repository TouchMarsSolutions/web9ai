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

describe("hero buttons", () => {
	it("take their hrefs from heroButtons (safeHref), never straight from the block", () => {
		const hero = raw("src/components/blocks/Hero.astro");
		expect(hero).toMatch(/^import \{ heroButtons \} from "\.\.\/\.\.\/\.\.\/packages\/web9-site\/lib\/hero-buttons\.mjs";$/m);
		expect(hero).toContain("heroButtons(b)");
		expect(hero).not.toMatch(/_href/);
	});
});

// The raw-HTML sinks: every set:html in the site (src/) and in the block renderers. An expression is read up
// to its matching brace (strings skipped), so one that holds a brace still shows whole; anything this cannot
// read as `set:html={...}` is listed as it stands, which fails the exact-list test below.
const blockFiles = readdirSync(new URL("../web9-blocks/astro", import.meta.url))
	.filter((f) => /\.(astro|mjs|ts|js)$/.test(f))
	.map((f) => `packages/web9-blocks/astro/${f}`);
function closing(source, open) {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		const c = source[i];
		if (c === '"' || c === "'" || c === "`") {
			for (i++; i < source.length && source[i] !== c; i++) if (source[i] === "\\") i++;
		} else if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return i;
	}
	return -1;
}
function setHtmlSites(file) {
	const source = raw(file);
	return [...source.matchAll(/set:html/g)].map((m) => {
		const after = source.slice(m.index + m[0].length);
		const open = /^\s*=\s*\{/.exec(after);
		const end = open ? closing(after, open[0].length - 1) : -1;
		return [file, end < 0 ? `<unreadable> ${after.slice(0, 40).trim()}` : after.slice(open[0].length, end).trim()];
	});
}
const sinks = [...srcFiles, ...blockFiles].sort().flatMap(setHtmlSites);

describe("menu links in Base.astro", () => {
	const base = raw("src/layouts/Base.astro");
	it("take rel from linkRel (nav.mjs) wherever they set a target", () => {
		expect(base).toMatch(/^import \{[^}]*\blinkRel\b[^}]*\} from "\.\.\/\.\.\/packages\/web9-site\/lib\/nav\.mjs";$/m);
		expect(base).not.toMatch(/\bconst linkRel\b/);
		const targets = base.match(/target=\{item\.target\}/g) ?? [];
		expect(targets.length).toBe(2);
		expect(base.match(/target=\{item\.target\} rel=\{linkRel\(item\.target\)\}/g) ?? []).toHaveLength(targets.length);
	});
});

describe("nested headings in prose", () => {
	// @tailwindcss/typography sizes headings in em, so `<h1><div><h1>…` in a Markdown field would compound
	// the size at every level. The reset must live in the utilities layer with .prose, and beat the plugin's
	// (0,1,0) `.prose :where(h1)`: `.prose` plus two `:is()` of tag names is (0,1,2).
	const HEADINGS = ":is(h1, h2, h3, h4, h5, h6)";
	const stripped = raw("src/styles/global.css").replace(/\/\*[\s\S]*?\*\//g, "");
	const utilities = [...stripped.matchAll(/@layer utilities\s*\{/g)].map((m) => {
		const open = m.index + m[0].length - 1;
		return stripped.slice(open + 1, closing(stripped, open));
	});
	it("resets font-size to inherit for a heading inside a heading, in the utilities layer", () => {
		const rules = utilities.flatMap((layer) => [...layer.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [selector.replace(/\s+/g, " ").trim(), body.trim()]));
		expect(rules).toContainEqual([`.prose ${HEADINGS} ${HEADINGS}`, "font-size: inherit;"]);
	});
});

describe("set:html in src/ and the block renderers", () => {
	it("appears only at these sites: static theme icons, the search snippet core has escaped, and sanitized Markdown or HTML", () => {
		expect(sinks).toEqual([
			["packages/web9-blocks/astro/Callout.astro", "renderInlineMarkdown(node.title)"],
			["packages/web9-blocks/astro/Callout.astro", "renderMarkdown(node?.body)"],
			["packages/web9-blocks/astro/Details.astro", 'renderInlineMarkdown(node?.summary ?? "Details")'],
			["packages/web9-blocks/astro/Details.astro", "renderMarkdown(node?.body)"],
			["packages/web9-blocks/astro/HtmlBlock.astro", "html"],
			["packages/web9-blocks/astro/Tabs.astro", "renderMarkdown(tab.body)"],
			["packages/web9-blocks/astro/ToolGrid.astro", 'renderInlineMarkdown(tool.tagline.replace(/\\n/g, "<br>"))'],
			["src/layouts/Base.astro", "ICONS[b.theme]"],
			["src/pages/search.astro", "result.snippet"],
		]);
	});
	it("lets a block renderer pass only sanitizeHtmlFragment or renderMarkdown output, imported from ../lib/", () => {
		const blockSinks = sinks.filter(([file]) => file.startsWith("packages/"));
		expect(blockSinks.length).toBeGreaterThan(0);
		for (const [file, expr] of blockSinks) {
			expect(expr, file).toMatch(/^(?:renderMarkdown|renderInlineMarkdown|sanitizeHtmlFragment)\(|^html$/);
			const source = raw(file);
			const importsMarkdown = /^import \{[^}]*\b(?:renderMarkdown|renderInlineMarkdown)\b[^}]*\} from "\.\.\/lib\/markdown\.mjs";$/m;
			const importsHtml = /^import \{ sanitizeHtmlFragment \} from "\.\.\/lib\/html\.mjs";$/m;
			expect(source, `${file} imports its sanitizer from ../lib/`).toMatch(/^render/.test(expr) ? importsMarkdown : importsHtml);
			// A bare identifier must come from the sanitizer in the same file, not from node props.
			if (expr === "html") expect(source, file).toMatch(/^const html = sanitizeHtmlFragment\(node\?\.html\);$/m);
		}
	});
});

describe("menu", () => {
	it("is bounded on render: at most LIMITS.menuItems items, labels cut to LIMITS.label (spec 2026-10-17 §3.1)", () => {
		const base = raw("src/layouts/Base.astro");
		expect(base).toMatch(/^import \{ LIMITS, clampText \} from "\.\.\/\.\.\/packages\/web9-blocks\/lib\/limits\.mjs";$/m);
		expect(base).toContain(".slice(0, LIMITS.menuItems)");
		expect(base).toContain("label: clampText(item.label, LIMITS.label)");
	});
});
