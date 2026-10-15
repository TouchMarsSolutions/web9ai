import { definePlugin } from "emdash";
import { extractBlockText } from "./lib/search-text.mjs";

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
				options: ["note", "tip", "info", "warning", "danger"].map((v) => ({ value: v, label: v })),
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
		// content:beforeSave is skipped without this capability
		capabilities: ["content:write"],
		hooks: {
			// Spec §4: core search does not index custom-block text; mirror it into docs.search_text.
			"content:beforeSave": async ({ content, collection }) => {
				// Updates pass only the changed fields; when body didn't change, keep search_text as is.
				if (collection !== "docs" || content.body === undefined) return content;
				return { ...content, search_text: extractBlockText(content.body) };
			},
		},
		admin: { portableTextBlocks: BLOCKS },
	});
}

export default createPlugin;
