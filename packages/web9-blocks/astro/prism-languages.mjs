// The code-block languages Prism highlights on this site (spec 2026-10-17 docs UX §3.4, final review #3): every name and
// alias of the components prism-client.mjs loads. Page scripts import this small module statically to decide whether a
// page needs Prism at all, so a block in a language Prism does not bundle (the old site's `chat-completions`) downloads
// nothing. prism-client.test.mjs checks the list against what the client really loads.

export const PRISM_LANGUAGES = Object.freeze([
	"markup", "html", "xml", "svg", "mathml", "ssml", "atom", "rss",
	"css",
	"clike",
	"javascript", "js",
	"yaml", "yml",
	"markdown", "md",
	"python", "py",
	"bash", "sh", "shell",
	"typescript", "ts",
	"json", "webmanifest",
	"kotlin", "kt", "kts",
	"java",
	"csharp", "cs", "dotnet",
	"swift",
]);

const KNOWN = new Set(PRISM_LANGUAGES);

/** The language of a code element as Prism reads it: its first `language-*` class, lower-cased ("" when it has none). */
function languageOf(className) {
	for (const token of String(className).split(/\s+/)) {
		const match = /^language-([\w-]+)$/i.exec(token);
		if (match) return match[1].toLowerCase();
	}
	return "";
}

/** True when `root` holds a `pre code` block whose language Prism bundles. */
export function hasHighlightable(root) {
	for (const code of root.querySelectorAll("pre code")) if (KNOWN.has(languageOf(code.className))) return true;
	return false;
}
