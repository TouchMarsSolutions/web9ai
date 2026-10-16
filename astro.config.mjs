import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import tailwindcss from "@tailwindcss/vite";
import { web9Blocks } from "@web9/blocks";

export default defineConfig({
	// Canonical origin for absolute URLs (RSS, OG, SEO). Never derive it from the request Host header.
	site: "https://www.web9.ai",
	output: "server",
	// Old Docusaurus feeds. EmDash's redirect table cannot hold these: its middleware skips any path with
	// a file extension (plan 2 Task 10).
	redirects: {
		"/blog/rss.xml": { status: 301, destination: "/rss.xml" },
		"/blog/atom.xml": { status: 301, destination: "/rss.xml" },
	},
	i18n: {
		defaultLocale: "en",
		locales: ["en", "zh-CN"],
		fallback: { "zh-CN": "en" },
		routing: { prefixDefaultLocale: false },
	},
	// Dev and production both run in workerd; locally D1/R2 are simulated under .wrangler/state.
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [web9Blocks()],
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	vite: { plugins: [tailwindcss()] },
	devToolbar: { enabled: false },
});
