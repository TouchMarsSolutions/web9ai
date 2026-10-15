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
- Undo: `revision_list` → `revision_restore`.

## Body = Markdown + block lines

`body` may be a Markdown string. Headings, paragraphs, bold/italic, links, lists and code fences convert automatically. Markdown **tables and `:::` admonitions do not**: use blocks.

Insert a block with its own line, JSON on one line:

```
<!--ec:block {"_type":"callout","_key":"tip-1","tone":"tip","title":"…","body":"Markdown here"} -->
```

Always include a unique "_key" in every ec:block JSON: keyless blocks are stored without one, and the admin editor relies on keys.

## Block reference

Markdown-valued fields (`body`, tab `body`, `tagline`) support GFM, `:::tip Title … :::` admonitions and ```` ```mermaid ```` fences. Raw HTML is sanitized: inline `style` keeps only cosmetic properties (no `position`, no `url()`), and `class`/`id` are removed. Do not try to style content with classes.

| Block | JSON |
|---|---|
| callout | `{"_type":"callout","_key":"…","tone":"note\|tip\|info\|warning\|danger\|caution","title":"…","body":"md"}` |
| tabs | `{"_type":"tabs","_key":"…","default_tab":1,"fullscreen":false,"tabs":[{"label":"…","body":"md"}]}` |
| details | `{"_type":"details","_key":"…","summary":"…","body":"md"}` |
| mermaid | `{"_type":"mermaid","_key":"…","code":"graph TD; A-->B"}` |
| tool_grid | `{"_type":"tool_grid","_key":"…","title":"…","logo_size":72,"tools":[{"name":"…","tagline":"md","logo":"/img/…png","url":"https://…","featured":false}]}` |
| investment_warning | `{"_type":"investment_warning","_key":"…","lang":"zh\|en"}` |
| table (core) | `{"_type":"table","_key":"…","hasHeaderRow":true,"rows":[{"_type":"tableRow","_key":"…","cells":[{"_type":"tableCell","_key":"…","isHeader":true,"markDefs":[],"content":[{"_type":"span","_key":"…","text":"…","marks":[]}]}]}]}` |

- Table cells hold text spans only (marks: `strong`, `em`, `code`, `strike-through`, or a `link` markDef key). Put logos in a `tool_grid`, not a table.
- Images: site images are `/img/...` paths; new uploads go through `media_upload` and are referenced by the returned URL.

## Checks after publishing

Open `<site>/docs/<slug>` (or `/zh-CN/docs/<slug>`) and confirm every block rendered. `search` with `{"query":"…","collections":["docs"]}` should find the doc.
