// Client-side syntax highlighting (spec 2026-10-17 docs UX §3.4). Pages import this module only when hasHighlightable
// (prism-languages.mjs) finds a code block in a bundled language, so other pages download nothing. Prism is bundled from
// npm into lazy chunks served from this site: core alone (`prismjs/components/prism-core.js`, not the main `prism.js`,
// which bundles the file-highlight plugin and with it a fetch for any `pre[data-src]`), then the components below. Any
// other language stays plain text. Prism reads textContent and writes escaped token spans; the classes it adds exist
// only in the live DOM, never in stored content.
//
// A component extends or reads the languages it needs when it loads, so the loads run in groups, each finished before
// the next starts: markup and clike (the base grammars); yaml, css and javascript (javascript extends clike; css and
// javascript hook into markup for inline <style> and <script> when it exists); then markdown, which extends markup and
// reads Prism.languages.yaml as it loads (so a markdown block's front matter is highlighted as yaml), together with the
// rest, which extend javascript (typescript) or clike (kotlin, java, csharp) or nothing (python, bash, json, swift).
// PRISM_LANGUAGES lists every name and alias these load; prism-client.test.mjs pins the groups against Prism's catalog.
import { hasHighlightable } from "./prism-languages.mjs";

let prismPromise;

function loadPrism() {
	prismPromise ??= (async () => {
		// Core reads this flag as it loads: no automatic highlighting of the whole document. Core then replaces window.Prism.
		// A retry after a failed chunk finds core loaded already (a module is evaluated once), so this runs only for the first.
		if (!window.Prism?.highlightAllUnder) window.Prism = { ...window.Prism, manual: true };
		const { default: Prism } = await import("prismjs/components/prism-core.js");
		await Promise.all([import("prismjs/components/prism-markup.js"), import("prismjs/components/prism-clike.js")]);
		await Promise.all([
			import("prismjs/components/prism-yaml.js"),
			import("prismjs/components/prism-css.js"),
			import("prismjs/components/prism-javascript.js"),
		]);
		await Promise.all([
			import("prismjs/components/prism-markdown.js"),
			import("prismjs/components/prism-typescript.js"),
			import("prismjs/components/prism-python.js"),
			import("prismjs/components/prism-bash.js"),
			import("prismjs/components/prism-json.js"),
			import("prismjs/components/prism-kotlin.js"),
			import("prismjs/components/prism-java.js"),
			import("prismjs/components/prism-csharp.js"),
			import("prismjs/components/prism-swift.js"),
		]);
		return Prism;
	})().catch((err) => {
		// a failed chunk must not poison later calls
		prismPromise = undefined;
		throw err;
	});
	return prismPromise;
}

/** Highlights every language-tagged code block under `root`; does nothing, and loads nothing, when none is in a bundled language. */
export async function highlightUnder(root) {
	if (!hasHighlightable(root)) return;
	const Prism = await loadPrism();
	Prism.highlightAllUnder(root);
}
