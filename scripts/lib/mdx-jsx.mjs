// String passes over the MDX body for the legacy JSX that has no block of its own
// (research p2-research-5-legacy.md §5d). They run before the line scanner in mdx-to-pt.mjs.

/** Wrappers and widgets that carry no content of their own: the tags go, their children stay. */
export function dropWrappers(body) {
	return (
		body
			.replace(/^[ \t]*<\/?MDXTemplate>[ \t]*$/gm, "") // mdx-embed context provider
			.replace(/^[ \t]*<\/?AlignedText\b[^>]*>[ \t]*$/gm, "") // its only use wraps a quote, which stays a blockquote
			.replace(/[ \t]*<TwitterFollowButton\b[^>]*\/>/g, "") // always right after a Twitter link, which stays
			.replace(/<style>\s*\{?`[\s\S]*?`\}?\s*<\/style>/g, "") // page-local CSS of the tools gallery
	);
}

/**
 * `<YouTube youTubeId="ID" skipTo={{ h, m, s }} />` (may span lines) -> `%%youtube:N%%`, a one-line token
 * with no Markdown meaning. `videos[N]` holds { id, start }. The scanner turns tokens in prose into embed
 * blocks and tokens in Markdown bodies (callout, details, tabs) into links.
 */
export function youtubeToTokens(body) {
	const videos = [];
	const out = body.replace(/<YouTube\b([\s\S]*?)\/>/g, (all, attrs) => {
		const id = /youTubeId=["']([\w-]{11})["']/.exec(attrs)?.[1];
		if (!id) throw new Error(`YouTube without a valid youTubeId: ${all.slice(0, 80)}`);
		const part = (unit) => Number(new RegExp(`\\b${unit}:\\s*(\\d+)`).exec(attrs)?.[1] ?? 0);
		videos.push({ id, start: part("h") * 3600 + part("m") * 60 + part("s") });
		return `%%youtube:${videos.length - 1}%%`;
	});
	return { body: out, videos };
}

export const YOUTUBE_TOKEN = /%%youtube:(\d+)%%/g;

export const youtubeUrl = ({ id, start }) => `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`;

/**
 * The tools gallery (`<div className="tools-gallery">`, only in 88-usecase/01_tools-summary.mdx) -> one entry
 * per `tool-category`: { title: <h3>, tools: [{ name: <span>, url: href, tagline: title attribute, logo }] }.
 * `img(name)` resolves an image import (`<Image img={X}>` or `<XSvg … />`) to its URL.
 */
export function parseToolsGallery(html, img) {
	return html
		.split(/<div className="tool-category">/)
		.slice(1)
		.map((category) => ({
			title: /<h3>([\s\S]*?)<\/h3>/.exec(category)?.[1].trim() ?? "",
			tools: [...category.matchAll(/<a\s+([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
				name: /<span>([\s\S]*?)<\/span>/.exec(inner)?.[1].trim() ?? "",
				tagline: /title="([^"]*)"/.exec(attrs)?.[1] ?? "",
				logo: img(/<Image\s+img=\{(\w+)\}/.exec(inner)?.[1] ?? /<(\w+(?:Svg|Png))\b/.exec(inner)?.[1] ?? ""),
				url: /href="([^"]+)"/.exec(attrs)?.[1] ?? "",
				featured: false,
			})),
		}));
}

/** src and alt of an `<img …>` tag. */
export function imgAttributes(tag) {
	const attr = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
	return { src: attr("src") ?? "", alt: attr("alt") ?? "" };
}
