# Web9.AI (EmDash + Astro)

The site is an EmDash CMS on Astro. Content lives in the EmDash database, not in git.
Read `AGENTS.md` for EmDash conventions; agent skills are in `.agents/skills/`.

## Commands

- Dev server: `npm run dev -- --port 4321` (daemon, runs in workerd like production; stop with `npx astro dev stop`)
- First run on an empty local DB: `curl -X POST 'http://localhost:4321/_emdash/api/setup/dev-bypass?token=1&content=0'`, save `data.token` to `.local/dev-token`
- Browser login (dev only): open `/_emdash/api/auth/dev-bypass?redirect=/_emdash/admin`
- MCP from the shell: `node scripts/mcp.mjs <tool> '<json>'`; page assertions: `node scripts/check-page.mjs <url> <marker>...`
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
