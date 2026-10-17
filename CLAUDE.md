# Web9.AI (EmDash + Astro)

The site is an EmDash CMS on Astro. Content lives in the EmDash database, not in git.
Read `AGENTS.md` for EmDash conventions; agent skills are in `.agents/skills/`.

## Commands

- Dev server: `npm run dev -- --port 4321` (daemon, runs in workerd like production; stop with `npx astro dev stop`)
- First run on an empty local DB: `curl -X POST 'http://localhost:4321/_emdash/api/setup/dev-bypass?token=1&content=0'`, save `data.token` to `.local/dev-token`
- Browser login (dev only): open `/_emdash/api/auth/dev-bypass?redirect=/_emdash/admin`
- MCP from the shell: `node scripts/mcp.mjs <tool> '<json>'`; page assertions: `node scripts/check-page.mjs <url> <marker>...`
- Migration runner (idempotent; stops on any existing entry that differs unless `--overwrite`): `node scripts/migrate.mjs <docs|menu|terms|posts|redirects|home|all>... [--dry-run] [--overwrite]`, then `node scripts/migrate.mjs verify`; env `EMDASH_URL`, `EMDASH_TOKEN` (redirects need an admin token)
- First run on an empty DB: `all --dry-run`, then `menu --overwrite` (the seed menu differs), then `all`; a re-run of `all` writes nothing (every step `unchanged`)
- Tests: `npm test` (vitest; `*.test.mjs` under scripts/, packages/, seed/)
- Build: `npm run build` · Type check: `npm run typecheck` · Content types: `npx emdash types`
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
- Markdown-valued block fields are rendered by `packages/web9-blocks/lib/markdown.mjs` and sanitized there.
- Styling is Tailwind 4 (`src/styles/global.css`, spec §11). Colors are the template tokens (`bg-surface`, `text-muted`, `border-border`, `text-brand`): light values in `@theme static`, dark values in `:root.dark` and `@media (prefers-color-scheme: dark) { :root:not(.light) }`. Never use the `dark:` variant or `light-dark()` (production minify lowers it and breaks the theme toggle).
- Tailwind scans only `src/` and `packages/web9-blocks/astro` (`source(none)` in `global.css`); never point `@source` at tests, docs, scripts or content, or their strings become real utilities (spec §10).
- Content HTML never carries classes. Markdown output is styled only by `prose` on the container and by the whitelisted-class selectors in `packages/web9-blocks/astro/blocks.css` (utilities layer). Never widen the sanitizer's class/style whitelist; any block prop that reaches a `class` attribute must be whitelisted (see `safeTone`). Exception to know about: core `htmlBlock` keeps classes, so agents must not publish `htmlBlock` content (spec §10).
