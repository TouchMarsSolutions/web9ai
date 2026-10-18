// The old site's custom heading ids (`## Title {#id}`) for packages/web9-site/lib/legacy-anchors.json (spec 2026-10-17
// docs UX §3.2). The converter drops `{#id}` (mdx-to-pt.mjs), so the ids cannot be derived from the stored text.
// Each source heading is matched by level and text to exactly one heading block of the body the migration stored
// (docPayloads); none or several throws. Not by position: the first H1 becomes the title and headings inside
// <details> become Markdown in a block. Removed together with legacy/.
import { readFileSync } from "node:fs";
import { blockText, isHeading } from "../../packages/web9-site/lib/anchors.mjs";
import { docPayloads } from "./docs-payloads.mjs";
import { readLegacyTree } from "./legacy-tree.mjs";

const HEADING_ID = /^(#{2,6})\s+(.*?)\s*\{#([\w-]+)\}\s*$/;

/** A heading's source text as the converter leaves it in spans: no inline-code backticks, bold markers or link syntax. */
export const plainHeading = (text) =>
	text
		.replace(/`([^`]*)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.trim();

/** { "<locale>/<slug>": { "<heading text>": "<id>" } } for every legacy doc with a custom heading id. */
export function legacyAnchors(tree = readLegacyTree()) {
	const table = {};
	for (const { doc, want } of docPayloads(tree)) {
		const ids = readFileSync(doc.file, "utf8")
			.split("\n")
			.map((line) => HEADING_ID.exec(line))
			.filter(Boolean);
		if (!ids.length) continue;
		const headings = want.data.body.filter(isHeading);
		const page = {};
		for (const [, hashes, source, id] of ids) {
			const text = plainHeading(source);
			const hits = headings.filter((b) => b.style === `h${hashes.length}` && blockText(b) === text);
			if (hits.length !== 1) throw new Error(`${doc.file}: "${text}" {#${id}} matches ${hits.length} heading blocks`);
			page[text] = id;
		}
		table[`${doc.locale}/${doc.slug}`] = page;
	}
	return table;
}
