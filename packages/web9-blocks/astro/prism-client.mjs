// Client-side syntax highlighting (spec 2026-10-17 docs UX §3.4). Pages import this module only when they hold a
// `pre code[class*="language-"]`, so pages without code download nothing. Prism is bundled from npm into lazy chunks
// served from this site. Only these languages are bundled: the old site's code blocks, plus javascript (in core) and
// json; any other language stays plain text. Prism reads textContent and writes escaped token spans; the classes it
// adds exist only in the live DOM, never in stored content.
let prismPromise;

function loadPrism() {
	prismPromise ??= (async () => {
		// Core reads this flag as it loads: no automatic highlighting of the whole document. Core then replaces window.Prism.
		window.Prism = { ...window.Prism, manual: true };
		const { default: Prism } = await import("prismjs");
		// Core includes markup, css, clike and javascript; each language below extends only those, so any order works
		await Promise.all([
			import("prismjs/components/prism-python.js"),
			import("prismjs/components/prism-bash.js"),
			import("prismjs/components/prism-yaml.js"),
			import("prismjs/components/prism-typescript.js"),
			import("prismjs/components/prism-json.js"),
			import("prismjs/components/prism-kotlin.js"),
			import("prismjs/components/prism-java.js"),
			import("prismjs/components/prism-csharp.js"),
			import("prismjs/components/prism-swift.js"),
			import("prismjs/components/prism-markdown.js"),
		]);
		return Prism;
	})();
	return prismPromise;
}

/** Highlights every language-tagged code block under `root`. */
export async function highlightUnder(root) {
	const Prism = await loadPrism();
	Prism.highlightAllUnder(root);
}
