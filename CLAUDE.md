# Web9.AI (EmDash + Astro)

The site is an EmDash CMS on Astro. Content lives in the EmDash database, not in git.
Read `AGENTS.md` for EmDash conventions; agent skills are in `.agents/skills/`.

## Commands

- Dev server: `npm run dev` (http://localhost:4321, admin at `/_emdash/admin`)
- Headless dev login + PAT: `curl -X POST 'http://localhost:4321/_emdash/api/setup/dev-bypass?token=1'`
- Build: `npm run build`
- Type check: `npm run typecheck`
- Tests: `npm test` (vitest; `*.test.mjs` under scripts/, packages/, seed/)
- Regenerate content types: `npx emdash types`

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
