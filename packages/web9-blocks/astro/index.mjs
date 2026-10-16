import Callout from "./Callout.astro";
import Details from "./Details.astro";
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
};
