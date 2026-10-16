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

/** Class-name patterns that let content build a page overlay (spec §10). */
export const CLASS_DENY = [
	[/^fixed$/, "position:fixed utility"],
	[/^-?inset(?:-[xyse])?(?:-|$)/, "inset utility"],
	[/^-?z-/, "z-index utility"],
	[/-screen$/, "*-screen size utility"],
	[/-[sld]?v[hw]$/, "viewport-unit size utility"],
	[/\[[^\]]*\d(?:[sld]?v[hwib]|vmin|vmax)\b/, "arbitrary viewport-unit value"],
];

/** Class names in a selector, unescaped, without variant prefixes (`.md\:fixed` → "fixed"). */
export function classTokens(selector) {
	return [...selector.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\(.)/g, "$1").split(":").pop());
}

/** Problems in one stylesheet: denied class names, position:fixed, and light-dark() lowered by the minifier. */
export function scanSheet({ label, css }) {
	const problems = [];
	postcss.parse(css).walkRules((rule) => {
		for (const selector of rule.selectors ?? []) {
			for (const cls of classTokens(selector)) {
				for (const [re, why] of CLASS_DENY) if (re.test(cls)) problems.push(`${label}: ${selector.slice(0, 100)} (${why})`);
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
