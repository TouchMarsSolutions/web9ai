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

describe("layout block text", () => {
	it("prints only what heroText, heroButtons and featureGridItems give (a stored non-string renders as nothing)", () => {
		const hero = raw("src/components/blocks/Hero.astro");
		expect(hero).toMatch(/^import \{ heroText \} from "\.\.\/\.\.\/\.\.\/packages\/web9-site\/lib\/layout-blocks\.mjs";$/m);
		expect(hero).toContain("const { title, tagline, image, alt } = heroText(b);");
		const grid = raw("src/components/blocks/FeatureGrid.astro");
		expect(grid).toMatch(/^import \{ featureGridItems \} from "\.\.\/\.\.\/\.\.\/packages\/web9-site\/lib\/layout-blocks\.mjs";$/m);
		expect(grid).toContain("const { title, features } = featureGridItems(b);");
		// the block value is read only by those helpers; core's <Image> gets the alt they give
		for (const [name, source] of [["Hero", hero], ["FeatureGrid", grid]]) {
			const template = source.split("---")[2];
			expect(template, name).not.toMatch(/\bb\.\w/);
			expect(template, name).not.toMatch(/\bf\.image\.alt\b|\bb\.features\b/);
		}
		expect(hero).toContain("<Image image={image} alt={alt}");
		expect(grid).toContain("<Image image={f.image} alt={f.alt}");
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
		// header site links, header external links, drawer, footer
		expect(targets.length).toBe(4);
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
	it("appears only at these sites: the search snippet core has escaped, and sanitized Markdown or HTML", () => {
		expect(sinks).toEqual([
			["packages/web9-blocks/astro/Callout.astro", "renderInlineMarkdown(title)"],
			["packages/web9-blocks/astro/Callout.astro", "renderMarkdown(node?.body)"],
			["packages/web9-blocks/astro/Details.astro", 'renderInlineMarkdown(node?.summary ?? "Details")'],
			["packages/web9-blocks/astro/Details.astro", "renderMarkdown(node?.body)"],
			["packages/web9-blocks/astro/HtmlBlock.astro", "html"],
			["packages/web9-blocks/astro/Tabs.astro", "renderMarkdown(tab.body)"],
			["packages/web9-blocks/astro/ToolGrid.astro", 'renderInlineMarkdown(tool.tagline.replace(/\\n/g, "<br>"))'],
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

describe("footer menu widget", () => {
	it("is checked by SafeWidgetArea before core renders it: getMenu, menuIsSafe, and an area that fails is not rendered", () => {
		const source = raw("packages/web9-blocks/astro/SafeWidgetArea.astro");
		expect(source).toMatch(/^import \{ getMenu, getWidgetArea \} from "emdash";$/m);
		expect(source).toMatch(/^import \{ menuIsSafe, widgetAreaIsSafe \} from "\.\.\/lib\/widgets\.mjs";$/m);
		expect(source).toContain("await getMenu(widget.menuName)");
		expect(source).toContain("menuIsSafe(");
		expect(source).toContain("{safe && <WidgetArea");
	});
	it("fails closed: `safe` becomes true only by the last statement of the try, after the widget check and every menu read", () => {
		const frontmatter = raw("packages/web9-blocks/astro/SafeWidgetArea.astro").split("---")[1];
		// Every assignment to `safe`: the initial false, and the verdict `ok` (so a throw from getMenu leaves it false)
		expect([...frontmatter.matchAll(/\bsafe = ([^;]+);/g)].map((m) => m[1])).toEqual(["false", "ok"]);
		// ...and no other write in any spelling the pattern above misses: `safe=true`, a logical or arithmetic assignment
		// (`safe ||= true`, `safe += 1`), or an increment (false + 1 is truthy)
		const writes = (source) =>
			[...source.matchAll(/\bsafe\s*(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*/%&|^])?=(?!=)|\bsafe\s*(?:\+\+|--)|(?:\+\+|--)\s*safe\b/g)].length;
		expect(writes(frontmatter)).toBe(2);
		for (const extra of ["safe=true;", "safe ||= true;", "safe &&= ok;", "safe ??= true;", "safe |= 1;", "safe += 1;", "safe **= 1;", "safe >>>= 0;", "safe++;", "++safe;", "safe--;"]) {
			expect(writes(`${frontmatter}\n${extra}`), extra).toBe(3);
		}
		for (const read of ["if (safe === true) {}", "if (safe == ok) {}", "if (safe !== ok) {}", "if (safe <= ok) {}", "if (safe >= ok) {}", "unsafe = 1;", "isSafe = 1;"]) {
			expect(writes(`${frontmatter}\n${read}`), read).toBe(2);
		}
		// `ok` starts as the widget check and can only be set to false afterwards
		expect([...frontmatter.matchAll(/\bok = ([^;]+);/g)].map((m) => m[1])).toEqual(["widgetAreaIsSafe(area)", "false"]);
		// `safe = ok;` is the last statement of the try block: nothing but whitespace between it and the catch
		expect(frontmatter).toMatch(/\n\tsafe = ok;\n\} catch \(error\) \{/);
		// ...and it comes after the menu read
		expect(frontmatter.indexOf("await getMenu(widget.menuName)")).toBeLessThan(frontmatter.indexOf("safe = ok;"));
	});
});

describe("write gate middleware", () => {
	it("keys on the matched route pattern and never on the URL: the router and the gate agree by construction", () => {
		const source = raw("src/middleware.ts");
		expect(source).toMatch(/defineMiddleware\(async \(\{ request, routePattern \}, next\)/);
		expect(source).toContain("gatedRequest(request.method, routePattern)");
		expect(source).toContain("writeGateResponse(request.method, routePattern, body)");
		expect(source).not.toMatch(/pathname/i);
		expect(source).not.toMatch(/request\.url|\burl\b/);
	});
	it("reads the body through readGatedBody (capped at MAX_GATED_BODY_BYTES, BOM stripped), never request.text()", () => {
		const source = raw("src/middleware.ts");
		expect(source).toContain("readGatedBody(request.clone().body)");
		expect(source).toContain("MAX_GATED_BODY_BYTES");
		expect(source).not.toMatch(/\.text\(\)/);
	});
	it("answers a body over the cap itself with payloadTooLarge (core caps only a declared length): both branches, never next()", () => {
		const source = raw("src/middleware.ts");
		expect(source).toContain("payloadTooLarge(routePattern)");
		expect(source).toMatch(/content-length"\)\) > MAX_GATED_BODY_BYTES\) return tooLarge\(\);/);
		expect(source).toMatch(/if \(text === null\) return tooLarge\(\);/);
		expect([...source.matchAll(/return tooLarge\(\)/g)]).toHaveLength(2);
	});
});

describe("AI token preconditions (spec 2026-10-17 §3.4)", () => {
	const sourceFiles = (dir) =>
		readdirSync(new URL(`../../${dir}`, import.meta.url), { recursive: true })
			.filter((f) => /\.(astro|mjs|ts|tsx|js)$/.test(f) && !/\.test\.mjs$/.test(f) && !f.includes("node_modules"))
			.map((f) => `${dir}/${f}`);
	it("no page renders sections: they are writable with content:write and have no guard", () => {
		const files = [...sourceFiles("src"), ...sourceFiles("packages")];
		expect(files).toContain("src/layouts/Base.astro");
		for (const file of files) expect(raw(file), file).not.toMatch(/\bgetSections?\b/);
	});
	it("media stay behind /_emdash/api/media/file (sandbox CSP, nosniff): no public R2 URL", () => {
		for (const file of ["astro.config.mjs", "wrangler.jsonc"]) expect(raw(file), file).not.toMatch(/publicUrl/);
	});
});
