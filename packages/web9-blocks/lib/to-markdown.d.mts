export interface ToMarkdownOptions {
	/** Absolute origin (Astro.site.origin) that site-relative links and images are made absolute against. */
	origin?: string;
}
/** Markdown for a Portable Text value; "" when it is not an array or nothing is left. Never throws on a malformed value. */
export function blocksToMarkdown(body: unknown, options?: ToMarkdownOptions): string;
/** `# title`, the description as a quote, then the body. */
export function docToMarkdown(doc: { title?: unknown; description?: unknown; body?: unknown } | null | undefined, options?: ToMarkdownOptions): string;
