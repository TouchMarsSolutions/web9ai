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
- Posts and pages work the same way: their block text also goes into an auto-generated `search_text` (field `content` instead of `body`).
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

Always include a unique `_key` in every ec:block JSON, unique within the doc: keyless blocks are stored without one, and the admin editor assigns its own key the first time someone saves that block there, so the doc's keys change behind your back. Write your own and keep them stable across updates.

## Block reference

Full Markdown (GFM, `:::tip Title … :::` admonitions, ```` ```mermaid ```` fences) works only in callout `body`, details `body` and tab `body`. Callout `title`, details `summary` and tool `tagline` are inline Markdown only (bold, links, code); tool_grid `title`, tab `label` and tool `name` are plain text. Raw HTML is sanitized: inline `style` keeps only cosmetic properties (no `position`, no `url()`), and `class`/`id` are removed. Do not try to style content with classes.

The site rejects some blocks on save (`SAVE_REJECTED`, the message lists each problem as `body: #<index> <type> …`):
- `htmlBlock`, `iframe` and any `_type` outside this allow list: `block` (paragraphs, headings, list items), `blockquoteGroup`, `break`, `table`, `file`, `pullquote`, `video`, `image`, `gallery`, `columns`, `cover`, `button`, `buttons`, `code`, `embed`, `callout`, `tabs`, `details`, `mermaid`, `tool_grid`, `investment_warning`;
- a `block` whose `children` hold anything but `span` (no blocks, covers, images or iframes inside a paragraph), a `span` with its own `children`, and any other node with `children`;
- a `block` with a `style` other than normal, h1–h6, blockquote, a `listItem` other than bullet, number, menu, a `level` outside 1–20, `marks` that are not a decorator (strong, em, underline, strike-through, subscript, superscript, code) or the `_key` of one of that block's `markDefs`, or a `markDefs` entry that is not a `link` with a string `href` (the same rules apply to blocks inside `cover.content`, `columns[].content` and `blockquoteGroup.blocks`, which may hold blocks only);
- a span with more than 20 `marks`, a block with more than 1000 `children`, or a `_key` that is not a string;
- a `url` or `logo` that is not a string on `button`, `buttons[]`, `file`, `embed` and `tool_grid` tools;
- an `embed` with `html` (an `embed` takes only `url`; YouTube and Vimeo render as a player, anything else as a link);
- core block fields outside their allowed values: `image.alignment` (left, center, right, wide, full), colours that are not `#hex`/`rgb()`, `cover.minHeight` other than a plain length, `code.language` with spaces, `tool_grid.logo_size` outside 16–300;
- an image whose `dominantColor` is not `#hex`/`rgb()` or whose `blurhash` does not decode: the `image` and `gallery` blocks, and the `featured_image` field of posts (including its `meta` and `darkVariant`).
Fix the block and send the save again; never try to get around the check.

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

## Widgets

Content widgets (rich text in a widget area) are not rendered: an area that holds one is hidden whole, the footer on every page included. Put that text in a doc or page instead. Component widgets take only the props their component declares; any other key hides the area too, and so do a `title` or string prop over 200 characters, a `menuName` over 100, or more than 20 widgets in one area.

## Checks after publishing

Open `<site>/docs/<slug>` (or `/zh-CN/docs/<slug>`) and confirm every block rendered. Leftover block syntax means a malformed block line: `node scripts/check-page.mjs <url> --absent 'ec:block'` must exit 0. `search` with `{"query":"…","collections":["docs"]}` should find the doc.
