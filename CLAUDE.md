# Web9.AI (EmDash + Astro)

The site is an EmDash CMS on Astro. Content lives in the EmDash database, not in git.
Read `AGENTS.md` for EmDash conventions; agent skills are in `.agents/skills/`.

## Commands

- Dev server: `npm run dev -- --port 4321` (daemon, runs in workerd like production; stop with `npx astro dev stop`)
- First run on an empty local DB: `curl -X POST 'http://localhost:4321/_emdash/api/setup/dev-bypass?token=1&content=0'`, save `data.token` to `.local/dev-token`
- Browser login (dev only): open `/_emdash/api/auth/dev-bypass?redirect=/_emdash/admin`
- MCP from the shell: `node scripts/mcp.mjs <tool> '<json>'`; page assertions: `node scripts/check-page.mjs <url> <marker>...`
- MCP as the AI Editor (`ai-agent@web9.ai`, content and media scopes only): `EMDASH_URL=https://www.web9.ai EMDASH_AUTH=ai node scripts/mcp.mjs <tool> '<json>'` (`scripts/mcp.mjs` only; other scripts refuse it); the access token (`.local/ai-access-token`, 1 hour) is renewed from `.local/ai-refresh-token` before it expires and on a 401, one refresh at a time; tokens go only to the site in `.local/ai-token-site`, which `EMDASH_URL=<site> node scripts/ai-token.mjs refresh` records (run it once after each device flow, with `EMDASH_URL` checked, since it sends the refresh token there; until then no other call sends a token); `node scripts/ai-token.mjs status|refresh` shows or renews them; the refresh token lasts 90 days from its device-code approval (`status` shows the date), then the owner approves a new one (spec 2026-10-17-ai-pat-preconditions §3.5)
- Heading ids: `node scripts/check-heading-ids.mjs [baseUrl]` (pages come from the header-menu/sidebar crawl, cross-checked against `/sitemap-docs.xml`; on each: every h2–h6 has an id and a # link, every TOC link resolves, no duplicate ids; renderer titles marked `data-w9-chrome` (ToolGrid) are exempt; fails on thin coverage: a sitemap doc the crawl missed, the sitemap unreadable or listing no en docs, or 0 headings or 0 TOC links checked; run after an emdash/astro-portabletext upgrade and before deploying)
- Migration runner (idempotent; stops on any existing entry that differs unless `--overwrite`): `node scripts/migrate.mjs <docs|menu|terms|posts|redirects|home|all>... [--dry-run] [--overwrite]`, then `node scripts/migrate.mjs verify`; env `EMDASH_URL`, `EMDASH_TOKEN` (redirects need an admin token; `verify` also reads the schema over MCP, so its token needs `schema:read`, and it exits 1 when that read fails)
- First run on an empty DB: `all --dry-run`, then `menu --overwrite` (the seed menu differs), then `all`; a re-run of `all` writes nothing (every step `unchanged`)
- Guard scan (after tightening a guard rule, before deploying; exits 1 on any problem or any answer it cannot read): `node scripts/guard-scan.mjs` (all entries incl. trashed, all revisions, menus, terms, bylines, widget areas; admin token; the summary counts the problems in revisions apart, as no edit fixes them)
- Tests: `npm test` (vitest; `*.test.mjs` under scripts/, packages/, seed/)
- Images: after adding a PNG or JPEG under `public/img` or `public/cover`, run `node scripts/optimize-images.mjs` (in place, same URL; it exits 1 and prints `over` for a file it cannot bring under 1600 px wide and 1 MiB, which `scripts/lib/raster-images.test.mjs` then fails on)
- Build: `npm run build` · Type check: `npm run typecheck` (both need the dev server stopped) · Content types: `npx emdash types`
- Local D1/R2 state lives in `.wrangler/state` (delete it to start over); secrets in `.dev.vars`

## Layout

- `src/` — Astro routes, layouts, `DocsPage.astro`
- `packages/web9-blocks/` — custom Portable Text blocks (editor definitions in `index.mjs`, renderers in `astro/`)
- `scripts/lib/mdx-to-pt.mjs` — Docusaurus MDX -> EmDash `docs` payload (`convertMdx`); `scripts/convert-mdx.mjs` is its CLI
- `legacy/` — the old Docusaurus site; input for the migration only, removed after cutover
- `public/img/` — static images, same `/img/...` URLs as the old site

## Rules

- Doc bodies are a `portableText` field plus inline custom blocks; never a `blocks` field (not searchable).
- Adding a block type = definition in `packages/web9-blocks/index.mjs` + renderer in `astro/` + deploy before content uses it.
- Markdown-valued block fields are rendered by `packages/web9-blocks/lib/markdown.mjs` and sanitized there. marked is super-linear in some delimiters and in list lazy lines, so the save check caps delimiter density and line breaks × field length per field and per value, and the trailing punctuation and starts of bare links per field (`lib/markdown-density.mjs`, spec 2026-10-17 §3.6); the caps were measured on marked 16.4.2 (a test pins it), so an upgrade has to be re-measured first.
- Styling is Tailwind 4 (`src/styles/global.css`, spec §11). Colors are the template tokens (`bg-surface`, `text-muted`, `border-border`, `text-brand`): light values in `@theme static`, dark values in `:root.dark` and `@media (prefers-color-scheme: dark) { :root:not(.light) }`. Never use the `dark:` variant or `light-dark()` (production minify lowers it and breaks the theme toggle).
- Tailwind scans only `src/` and `packages/web9-blocks/astro` (`source(none)` in `global.css`); never point `@source` at tests, docs, scripts or content, or their strings become real utilities (spec §10).
- Content HTML never carries classes. Markdown output is styled only by `prose` on the container and by the whitelisted-class selectors in `packages/web9-blocks/astro/blocks.css` (utilities layer). Never widen the sanitizer's class/style whitelist; a content value never reaches a `class` or `style` attribute unvalidated (whitelist it like `safeTone`, check styles with `isSafeCssValue`). Core's `htmlBlock` renderer keeps classes, so the save hook rejects `htmlBlock` (`SAVE_REJECTED`) and web9's `HtmlBlock.astro` replaces core's renderer for rows stored some other way (spec §10).
- Widget areas render only through `SafeWidgetArea` (`@web9/blocks/astro`), never core's `WidgetArea`; `packages/web9-site/render-sinks.test.mjs` pins this and every `set:html` site (`src/` and the block renderers) with its expression.
- Length and size limits live in `packages/web9-blocks/lib/limits.mjs` and `lib/pt-guard.mjs`. The write gate (`src/middleware.ts` → `packages/web9-site/lib/write-gate.mjs`) checks a content slug, `seo.image`, `seo.canonical` and byline `roleLabel`, menu items (`label`, `customUrl`, `titleAttr`, `target`), terms and bylines (`displayName`, `slug`, `avatarMediaId`); it keys on `context.routePattern`, never the URL, and answers a body over 10 MiB with 413 itself. `write-gate.core.test.mjs` pins the MCP tool names and the route patterns under content/menus/taxonomies/admin/bylines/widget-areas/mcp: an emdash upgrade that adds a tool or route, or renames a pattern, fails it, so re-check the gate before updating the snapshot.
