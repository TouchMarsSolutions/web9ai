// Lazy client-side Mermaid renderer shared by every block that can contain diagrams.
// Diagrams inside hidden tabs / closed <details> are rendered when they become visible,
// because Mermaid measures text and mis-sizes diagrams laid out while hidden.
// Mermaid is bundled from npm (a lazy chunk served from this site), not loaded from a CDN at runtime.
let mermaidPromise;

// The theme toggle sets .dark/.light on <html>; without either, follow the OS like the page does.
function isDark() {
	const root = document.documentElement.classList;
	if (root.contains("dark")) return true;
	if (root.contains("light")) return false;
	return matchMedia("(prefers-color-scheme: dark)").matches;
}

function loadMermaid() {
	mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
		const dark = isDark();
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
