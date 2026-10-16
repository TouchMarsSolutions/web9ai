import Callout from "./Callout.astro";
import Details from "./Details.astro";
import Embed from "./Embed.astro";
import HtmlBlock from "./HtmlBlock.astro";
import InvestmentWarning from "./InvestmentWarning.astro";
import Mermaid from "./Mermaid.astro";
import Tabs from "./Tabs.astro";
import ToolGrid from "./ToolGrid.astro";

// Keys must match the `type` of each block in ../index.mjs
export const blockComponents = {
	callout: Callout,
	tabs: Tabs,
	details: Details,
	mermaid: Mermaid,
	tool_grid: ToolGrid,
	investment_warning: InvestmentWarning,
	// Overrides of core renderers (plugin components win over core's, spec §10)
	htmlBlock: HtmlBlock,
	embed: Embed,
};
