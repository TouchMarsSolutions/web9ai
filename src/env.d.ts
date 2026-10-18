// Request-scoped values shared by the components of one render; merges with emdash's App.Locals.
declare namespace App {
	interface Locals {
		/** Doc heading ids by block _key: DocsPage sets them, Heading.astro reads them (spec 2026-10-17 docs UX §3.2). */
		headingIds?: Record<string, string>;
	}
}
