// Lazy client-side Mermaid renderer shared by every block that can contain diagrams.
// Diagrams inside hidden tabs / closed <details> are rendered when they become visible,
// because Mermaid measures text and mis-sizes diagrams laid out while hidden.
const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs";
let mermaidPromise;

function loadMermaid() {
	mermaidPromise ??= import(/* @vite-ignore */ MERMAID_URL).then(({ default: mermaid }) => {
		const dark = matchMedia("(prefers-color-scheme: dark)").matches;
		mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict" });
		return mermaid;
	});
	return mermaidPromise;
}

async function renderMermaid(root = document) {
	const nodes = [...root.querySelectorAll("pre.mermaid:not([data-processed])")].filter(
		(el) => el.offsetParent !== null,
	);
	if (!nodes.length) return;
	const mermaid = await loadMermaid();
	await mermaid.run({ nodes, suppressErrors: true });
}

if (!window.w9RenderMermaid) {
	window.w9RenderMermaid = renderMermaid;
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => renderMermaid());
	} else {
		renderMermaid();
	}
}
