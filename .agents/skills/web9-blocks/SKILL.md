---
name: web9-blocks
description: Write and publish Web9.AI docs through the EmDash MCP server, including Web9 custom blocks (callout, tabs, details, mermaid, tool_grid, investment_warning) and core tables. Use whenever an agent creates or edits site content.
---

# Writing Web9.AI content over MCP

Endpoint: `<site>/_emdash/api/mcp` with `Authorization: Bearer <token>`. In this repo: `node scripts/mcp.mjs <tool> '<json>'`.

## Create and publish a doc

`content_create` stores a **draft** unless you pass `"status": "published"`.

```json
{ "collection": "docs", "slug": "my-doc", "status": "published", "locale": "en",
  "data": { "title": "…", "description": "…", "section": "ai", "category": "usecase", "sort_order": 10, "body": "<markdown>" } }
```

- `section` is `ai` or `dev`. `sort_order` orders the sidebar within a category.
- Chinese translation of an existing doc: same payload with `"locale": "zh-CN"` and `"translationOf": "<id of the en doc>"`.
- `search_text` is generated automatically from block text on every save that includes a `body`; never write it.
- Updating: `content_get` (slug as `id`) → `content_update` with `id`, `_rev` and only the changed `data` fields (this writes a draft; `status` still reads "published") → `content_get` again for the new `_rev` → `content_publish`.
- Editing an existing body: `content_get` with `"markdown": true` returns `body` as Markdown plus `ec:block` lines; edit that and send the whole `body` back.
- Translations share the slug with the en doc. `content_get` and `content_update` take `"locale": "zh-CN"` to scope the slug lookup; `content_publish` and `revision_list` have no `locale`, so for a translation use the item's ULID `id` (from `content_get`) in every call.
- Locking: an update or publish fails with `ENTRY_LOCKED` while someone has the doc open in the admin. Tell the user who holds it; use `overrideLock` only if they ask.
- Undo: `revision_list` {collection, id} → `revision_restore` {revisionId} (replaces the draft only) → `content_get` for the new `_rev` → `content_publish`.

## Body = Markdown + block lines

`body` may be a Markdown string. Headings, paragraphs, bold/italic, links, lists and code fences convert automatically. Markdown **tables and `:::` admonitions do not**: use blocks.

Converter limits: use `**bold**` and `_italic_` (`*italic*` stays literal). `_…_` matches across words, so put identifiers like `default_tab` in backticks. Every non-blank line is its own paragraph (no soft wraps); a list item is one line, nested by 2-space indent. Diagrams: use the `mermaid` block (a top-level ```` ```mermaid ```` fence in `body` becomes a plain code block).

Insert a block with its own line, JSON on one line:

```
<!--ec:block {"_type":"callout","_key":"tip-1","tone":"tip","title":"…","body":"Markdown here"} -->
```

Block line rules: start at column 0, valid one-line JSON, end exactly with ` -->` (no trailing space or CR). A line that breaks any rule silently becomes a literal paragraph.

Always include a unique `_key` in every ec:block JSON, unique within the doc: keyless blocks are stored without one, and Tabs derives its DOM ids from `_key` (`w9t-<_key>`), so a missing or duplicate key makes two tabs blocks on one page collide. (The admin editor adds a key to a keyless block the first time someone saves it there, but MCP-only content keeps none, so always write one.)

## Block reference

Full Markdown (GFM, `:::tip Title … :::` admonitions, ```` ```mermaid ```` fences) works only in callout `body`, details `body` and tab `body`. Callout `title`, details `summary` and tool `tagline` are inline Markdown only (bold, links, code); tool_grid `title`, tab `label` and tool `name` are plain text. Raw HTML is sanitized: inline `style` keeps only cosmetic properties (no `position`, no `url()`), and `class`/`id` are removed. Do not try to style content with classes.

Never use `htmlBlock` (`{"_type":"htmlBlock",…}`): raw HTML there keeps `class`/`id` and bypasses the Web9 sanitizer. Use the blocks listed below.

| Block | JSON |
|---|---|
| callout | `{"_type":"callout","_key":"…","tone":"tip","title":"…","body":"md"}`; `tone` is one of: note, tip, info, warning, danger, caution (unknown falls back to info) |
| tabs | `{"_type":"tabs","_key":"…","default_tab":1,"fullscreen":false,"tabs":[{"label":"…","body":"md"}]}` |
| details | `{"_type":"details","_key":"…","summary":"…","body":"md"}` |
| mermaid | `{"_type":"mermaid","_key":"…","code":"graph TD; A-->B"}` |
| tool_grid | `{"_type":"tool_grid","_key":"…","title":"…","logo_size":72,"tools":[{"name":"…","tagline":"md","logo":"/img/…png","url":"https://…","featured":false}]}` |
| investment_warning | `{"_type":"investment_warning","_key":"…","lang":"zh"}`; `lang` is one of: zh, en |
| table (core) | `{"_type":"table","_key":"…","hasHeaderRow":true,"rows":[{"_type":"tableRow","_key":"…","cells":[{"_type":"tableCell","_key":"…","isHeader":true,"markDefs":[],"content":[{"_type":"span","_key":"…","text":"…","marks":[]}]}]}]}` |

- Table cells hold text spans only (marks: `strong`, `em`, `code`, `strike-through`, or a `link` markDef key). Put logos in a `tool_grid`, not a table.
- Images: site images are `/img/...` paths; new uploads go through `media_upload` and are referenced by the returned URL.

## Checks after publishing

Open `<site>/docs/<slug>` (or `/zh-CN/docs/<slug>`) and confirm every block rendered. Leftover block syntax means a malformed block line: `node scripts/check-page.mjs <url> --absent 'ec:block'` must exit 0. `search` with `{"query":"…","collections":["docs"]}` should find the doc.
