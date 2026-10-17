import { ContentSaveRejectedError, definePlugin } from "emdash";
import { PT_FIELDS, entryProblems, fieldsFor } from "./lib/entry-guard.mjs";
import { extractBlockText } from "./lib/search-text.mjs";

export { BLOCK_IMAGE_FIELDS, IMAGE_FIELDS, PT_FIELDS } from "./lib/entry-guard.mjs";

const ID = "web9-blocks";
const VERSION = "0.1.0";

const md = (action_id, label) => ({ type: "text_input", action_id, label, multiline: true });
const text = (action_id, label) => ({ type: "text_input", action_id, label });

/** Editor definitions. Each `type` is the Portable Text `_type` and the renderer-map key. */
export const BLOCKS = [
	{
		type: "callout",
		label: "Callout",
		icon: "info",
		category: "Web9",
		description: "Admonition: note / tip / info / warning / danger",
		fields: [
			{
				type: "select",
				action_id: "tone",
				label: "Tone",
				options: ["note", "tip", "info", "warning", "danger", "caution"].map((v) => ({ value: v, label: v })),
				initial_value: "info",
			},
			text("title", "Title"),
			md("body", "Body (Markdown)"),
		],
	},
	{
		type: "tabs",
		label: "Tabs",
		icon: "code",
		category: "Web9",
		description: "Tabbed panels; each tab body is Markdown",
		fields: [
			{
				type: "repeater",
				action_id: "tabs",
				label: "Tabs",
				item_label: "Tab",
				fields: [text("label", "Label"), md("body", "Body (Markdown)")],
			},
			{ type: "number_input", action_id: "default_tab", label: "Default tab (1-based)" },
			{ type: "toggle", action_id: "fullscreen", label: "Show fullscreen button" },
		],
	},
	{
		type: "details",
		label: "Collapsible",
		category: "Web9",
		description: "<details> with a summary; body is Markdown",
		fields: [text("summary", "Summary"), md("body", "Body (Markdown)")],
	},
	{
		type: "mermaid",
		label: "Mermaid diagram",
		icon: "code",
		category: "Web9",
		fields: [md("code", "Mermaid source")],
	},
	{
		type: "tool_grid",
		label: "Tool grid",
		category: "Web9",
		description: "Cards of tools: logo + name + tagline + link",
		fields: [
			text("title", "Title (optional)"),
			{
				type: "repeater",
				action_id: "tools",
				label: "Tools",
				item_label: "Tool",
				fields: [
					text("name", "Name"),
					md("tagline", "Tagline"),
					text("logo", "Logo URL"),
					text("url", "Link URL"),
					{ type: "toggle", action_id: "featured", label: "Featured" },
				],
			},
			{ type: "number_input", action_id: "logo_size", label: "Logo size (px)" },
		],
	},
	{
		type: "investment_warning",
		label: "Investment warning",
		category: "Web9",
		fields: [
			{
				type: "select",
				action_id: "lang",
				label: "Language",
				options: [
					{ value: "zh", label: "中文" },
					{ value: "en", label: "English" },
				],
				initial_value: "zh",
			},
		],
	},
];

/** `_type`s of this plugin's blocks; only their text is mirrored into search_text. */
const BLOCK_TYPES = new Set(BLOCKS.map((b) => b.type));

/**
 * content:beforeSave. Rejects unsafe blocks, image values and over-long fields (spec §10; spec 2026-10-17 §3.1) in the
 * pinned fields plus the live schema's (ctx.schema, schema:read), then mirrors this plugin's block text into
 * search_text, because core search only indexes text/alt/caption/code strings (spec §4).
 */
export async function beforeSave(event, ctx) {
	const { content, collection } = event;
	const problems = entryProblems(content, await fieldsFor(collection, ctx?.schema));
	if (problems.length) throw new ContentSaveRejectedError(`Save rejected (spec §10): ${problems.join("; ")}`.slice(0, 1000));
	// search_text comes from the first pinned Portable Text field: a collection without one keeps its content as it is.
	const main = Object.hasOwn(PT_FIELDS, collection) ? PT_FIELDS[collection][0] : undefined;
	if (main === undefined) return content;
	// Updates pass only the changed fields; when the body didn't change, keep the stored search_text
	// (so a caller-sent one is dropped, not stored).
	if (content[main] === undefined) {
		if (!("search_text" in content)) return content;
		const { search_text: _dropped, ...rest } = content;
		return rest;
	}
	return { ...content, search_text: extractBlockText(content[main], BLOCK_TYPES) };
}

/**
 * hreflang alternates of the home pages. Core derives them from the collection's urlPattern, `/pages/{slug}`,
 * which for the home page is a redirect to `/` (and `/zh-CN/pages/home` redirects to the English home), and a
 * crawler drops hreflang that points at a redirect. These paths are the routes HomePage.astro serves; the test
 * pins them to localizeHref.
 */
export const HOME_ALTERNATES = [
	{ hreflang: "en", path: "/" },
	{ hreflang: "zh-CN", path: "/zh-CN/" },
	{ hreflang: "x-default", path: "/" },
];

/**
 * page:metadata. A contribution from a plugin sits before core's in the list, and the first link per hreflang
 * wins (page/metadata.ts resolvePageMetadata), so these replace core's three home alternates. The home page is
 * the `pages` entry with slug `home` (HomePage.astro passes it as `content`, which keeps the SEO-panel overlay);
 * every other page, and a page without an absolute site URL, is left to core.
 */
export function pageMetadata(event) {
	const page = event?.page;
	if (page?.content?.collection !== "pages" || page.content.slug !== "home") return null;
	try {
		return HOME_ALTERNATES.map(({ hreflang, path }) => ({ kind: "link", rel: "alternate", hreflang, href: new URL(path, page.siteUrl).href }));
	} catch {
		return null;
	}
}

export function web9Blocks() {
	return {
		id: ID,
		version: VERSION,
		format: "native",
		entrypoint: "@web9/blocks",
		componentsEntry: "@web9/blocks/astro",
		options: {},
	};
}

export function createPlugin() {
	return definePlugin({
		id: ID,
		version: VERSION,
		// content:beforeSave is skipped without content:write; ctx.schema exists only with schema:read (plugins/context.ts)
		capabilities: ["content:write", "schema:read"],
		hooks: {
			"content:beforeSave": beforeSave,
			"page:metadata": pageMetadata,
		},
		admin: { portableTextBlocks: BLOCKS },
	});
}

export default createPlugin;
