// Pure parts of scripts/check-public-css.mjs (spec §10). The check reads the build output only:
// Astro's SSR manifest (embedded in dist/server as `deserializeManifest({...})`) lists the stylesheets
// each route loads; Rolldown leaves a `//#region <source>.css?url` marker above every `?url` CSS import,
// which is how the admin bundle's stylesheet is told apart from public ones. Anything else fails.
import postcss from "postcss";

/** The JSON object literal that starts at src[start] ("{"), string-aware. */
export function extractJsonObject(src, start) {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < src.length; i++) {
		const c = src[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (c === "\\") escaped = true;
			else if (c === '"') inString = false;
			continue;
		}
		if (c === '"') inString = true;
		else if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
	}
	throw new Error("unbalanced JSON object literal");
}

const MANIFEST_MARK = 'deserializeManifest({"rootDir"';
const URL_REGION = /\/\/#region ([^\n]+?\.css)\?url\nvar \w+ = "([^"]+)"/g;

/** Reads the manifest and the `?url` CSS imports out of the server bundle's source files. */
export function readServerBundle(sources) {
	let manifest = null;
	const urlImports = [];
	for (const src of sources) {
		const at = src.indexOf(MANIFEST_MARK);
		if (!manifest && at >= 0) manifest = JSON.parse(extractJsonObject(src, src.indexOf("{", at)));
		for (const m of src.matchAll(URL_REGION)) urlImports.push({ source: m[1], file: m[2].replace(/^\//, "") });
	}
	return { manifest, urlImports };
}

const isPublicPage = (r) => ["page", "fallback"].includes(r.routeData?.type) && !r.routeData.route.startsWith("/_emdash");
const ADMIN_SOURCE = /^node_modules\/@emdash-cms\/admin\//;

/**
 * Sorts every CSS file in dist/client into public / inlined duplicate / admin-only, and collects the
 * sheets public routes load. `clientCss` maps a path relative to dist/client ("_astro/x.css") to its text.
 * Returns { sheets: [{ label, css }], report: [[file, verdict]], errors: [string] }.
 */
export function classifySheets({ manifest, urlImports, clientCss }) {
	const errors = [];
	if (!manifest?.routes?.length) return { sheets: [], report: [], errors: ["no Astro SSR manifest in dist/server (Astro internals changed?)"] };
	const sheets = new Map();
	const linked = new Set();
	for (const r of manifest.routes.filter(isPublicPage)) {
		for (const s of r.styles ?? []) {
			if (s.type === "inline") {
				sheets.set(`inline:${s.content}`, { label: `inline style of ${r.routeData.route}`, css: s.content });
				continue;
			}
			const file = String(s.src).replace(/^\//, "");
			if (!clientCss.has(file)) {
				errors.push(`route ${r.routeData.route} loads ${s.src}, which is not a file in dist/client`);
				continue;
			}
			linked.add(file);
			sheets.set(`file:${file}`, { label: file, css: clientCss.get(file) });
		}
	}
	const inlineBodies = new Set([...sheets.values()].filter((s) => !linked.has(s.label)).map((s) => s.css));
	const report = [];
	for (const [file, css] of [...clientCss].sort(([a], [b]) => a.localeCompare(b))) {
		const via = urlImports.find((u) => u.file === file);
		if (linked.has(file)) report.push([file, "public (loaded by a public route)"]);
		else if (inlineBodies.has(css)) report.push([file, "public (same text is inlined into a public route)"]);
		else if (via && ADMIN_SOURCE.test(via.source)) report.push([file, `admin only (${via.source}?url)`]);
		else if (via) {
			report.push([file, `public (?url import of ${via.source})`]);
			sheets.set(`file:${file}`, { label: file, css });
		} else {
			report.push([file, "UNKNOWN"]);
			errors.push(`${file}: cannot tell whether public pages load it`);
		}
	}
	return { sheets: [...sheets.values()], report, errors };
}

// Viewport units (`100vh`, `50DVW`, `100vmax`, `100dvmin`...) and container-query units (`100cqh`...): public CSS
// has no `container-type`, so `cq*` falls back to the small viewport. `(?![a-z])` instead of `\b`: Tailwind writes
// spaces inside arbitrary values as `_`, and `_` is a word character, so `\b` never matched in `100vmax_black`.
const VIEWPORT_UNIT = /\d(?:[sld]?v(?:[hwib]|min|max)|cq(?:[whib]|min|max))(?![a-z])/i;

/** Class-name patterns that let content build a page overlay (spec §10). */
export const CLASS_DENY = [
	[/^fixed$/, "position:fixed utility"],
	[/^-?inset(?:-[xyse])?(?:-|$)/, "inset utility"],
	[/^-?z-/, "z-index utility"],
	[/-screen$/, "*-screen size utility"],
	[/-[sld]?v[hw]$/, "viewport-unit size utility"],
	// `[...]` (`h-[80vh]`) and `(...)` (`h-(--x,100vh)` is `height:var(--x,100vh)`) arbitrary values.
	[new RegExp(String.raw`[\[(][^\]]*${VIEWPORT_UNIT.source}`, "i"), "arbitrary viewport-unit value"],
];

/** Arbitrary properties (`[z-index:50]`, `md:[inset:0]`) as a whole class name, important modifier already dropped. */
const ARBITRARY_PROPERTY = /^\[([a-z-]+):(.*)\]$/i;
const ARBITRARY_PROPERTY_DENY = [
	[(prop, value) => prop === "position" && /^_*fixed(?![a-z])/i.test(value), "arbitrary position:fixed property"],
	[(prop) => /^(?:inset(?:-.+)?|top|right|bottom|left)$/.test(prop), "arbitrary inset property"],
	[(prop) => prop === "z-index", "arbitrary z-index property"],
	[(_prop, value) => VIEWPORT_UNIT.test(value), "arbitrary property with a viewport-unit value"],
];

/** Why a class name (variants and `!` already dropped) can build an overlay; empty when it cannot. */
export function denyReasons(cls) {
	const arbitrary = ARBITRARY_PROPERTY.exec(cls);
	if (arbitrary) {
		const prop = arbitrary[1].toLowerCase();
		return ARBITRARY_PROPERTY_DENY.filter(([test]) => test(prop, arbitrary[2])).map(([, why]) => why);
	}
	return CLASS_DENY.filter(([re]) => re.test(cls)).map(([, why]) => why);
}

/**
 * The part of a class name after its last variant, ignoring colons inside `[...]` and `(...)`. Quoted text is skipped:
 * a bracket inside quotes (`data-[x='[']:z-50`) does not open anything. A quote that never closes is an ordinary character.
 */
function utilityPart(cls) {
	let depth = 0;
	let start = 0;
	for (let i = 0; i < cls.length; i++) {
		const c = cls[i];
		if (c === "'" || c === '"') {
			const end = cls.indexOf(c, i + 1);
			if (end > i) i = end;
		} else if (c === "[" || c === "(") depth++;
		else if (c === "]" || c === ")") depth = Math.max(0, depth - 1);
		else if (c === ":" && depth === 0) start = i + 1;
	}
	return cls.slice(start);
}

/** CSS escapes: 1 to 6 hex digits and one optional space (`\32 ` is "2"), or any other character after a backslash. */
const CSS_ESCAPE = /\\([0-9a-f]{1,6})[ \t\n\r\f]?|\\([\s\S])/gi;
const decodeEscapes = (s) =>
	s.replace(CSS_ESCAPE, (_, hex, ch) => {
		if (ch !== undefined) return ch;
		const cp = parseInt(hex, 16);
		return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? "\ufffd" : String.fromCodePoint(cp);
	});

/**
 * Class names in a selector, unescaped, without variant prefixes and without the important modifier
 * (`.md\:fixed` → "fixed", `.h-screen\!` → "h-screen", `.\32 xl\:z-50` → "z-50", `.md\:\[z-index\:9\]` → "[z-index:9]").
 * The name is decoded twice: once for the selector, once more for escapes the class name itself carries into the value
 * (`h-[100v\68]` is selector `.h-\[100v\\68\]` and declaration `height:100v\68`, which the minifier writes as `100vh`).
 */
export function classTokens(selector) {
	return [...selector.matchAll(/\.((?:\\[0-9a-f]{1,6}[ \t\n\r\f]?|\\[\s\S]|[\w-])+)/gi)].map((m) =>
		utilityPart(decodeEscapes(decodeEscapes(m[1]))).replace(/^!|!$/g, ""),
	);
}

/** Problems in one stylesheet: denied class names, position:fixed, `@import`, and light-dark() lowered by the minifier. */
export function scanSheet({ label, css }) {
	const problems = [];
	const root = postcss.parse(css);
	// An `@import` of the admin sheet would put its position:fixed rules on every public page.
	root.walkAtRules(/^import$/i, (rule) => {
		problems.push(`${label}: @${rule.name} ${rule.params.slice(0, 100)} (a public stylesheet must not import other CSS)`);
	});
	root.walkRules((rule) => {
		for (const selector of rule.selectors ?? []) {
			for (const cls of classTokens(selector)) {
				for (const why of denyReasons(cls)) problems.push(`${label}: ${selector.slice(0, 100)} (${why})`);
			}
		}
		rule.walkDecls((d) => {
			if (d.prop === "position" && /^fixed\b/i.test(d.value)) problems.push(`${label}: ${rule.selector.slice(0, 100)} (position:fixed)`);
			if (/var\(--lightningcss-(?:light|dark)\b/.test(d.value))
				problems.push(`${label}: ${rule.selector.slice(0, 100)} uses ${d.prop} from a lowered light-dark() (theme B, spec §11)`);
		});
	});
	return problems;
}
