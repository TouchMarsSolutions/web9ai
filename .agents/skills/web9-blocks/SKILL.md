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
- Pass a `slug` (at most 100 characters) when the title is long. Without one, core builds the slug from the first 80 letters of the title, and in a script that spends several characters per letter (Thai, Devanagari, Tamil, rare CJK) that slug passes 100, so the entry saves but its publish is rejected.
- Updating: `content_get` (slug as `id`) → `content_update` with `id`, `_rev` and only the changed `data` fields (this writes a draft; `status` still reads "published") → `content_get` again for the new `_rev` → `content_publish`.
- Editing an existing body: `content_get` with `"markdown": true` returns `body` as Markdown plus `ec:block` lines; edit that and send the whole `body` back.
- Translations share the slug with the en doc. `content_get` and `content_update` take `"locale": "zh-CN"` to scope the slug lookup; `content_publish` and `revision_list` have no `locale`, so for a translation use the item's ULID `id` (from `content_get`) in every call.
- Locking: an update or publish fails with `ENTRY_LOCKED` while someone has the doc open in the admin. Tell the user who holds it; use `overrideLock` only if they ask.
- Undo: `revision_list` {collection, id} returns each revision's `data`; send the earlier `body` back with `content_update` (the save check runs on it) → `content_get` for the new `_rev` → `content_publish`. Publish and schedule re-run the save check too: a rejection reads `Publish rejected (spec §10): …` with the same problem list (cut to 500 code points), under the code `PUBLISH_REJECTED` or `SCHEDULE_REJECTED`. But `content_restore` from the trash does not re-run it, so prefer `content_update` over `revision_restore` and `content_restore`.
- Limits (the save, publish and write checks reject more): `title` 200 characters, `description` and `excerpt` 1000, a doc's `category` 80, `slug` 100, `seo.image` and `seo.canonical` 2048; a byline credit's `roleLabel` 80; a menu item `label` 80, `customUrl` 2048, `titleAttr` 200 and `target` 32, at most 50 items per menu; a term `label` 80 and `slug` 100; a byline `displayName` 80, `slug` 100 and `avatarMediaId` 64. In a body: a callout, details or tab `body` 25000, a callout `title`, details `summary` or tool `tagline` 300, `code` and `mermaid` source 20000, a cover's background URLs 2048, and at most 52000 Markdown characters in all (callout, details, tab and tagline text together). In a page's `layout`: a hero or feature_grid `title` and a feature `title` 200, the hero `tagline`, a feature `description` and an image `alt` 1000, a hero button label 80 and link 2048.

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

Full Markdown (GFM, `:::tip Title … :::` admonitions, ```` ```mermaid ```` fences) works only in callout `body`, details `body` and tab `body`. Callout `title`, details `summary` and tool `tagline` are inline Markdown only (bold, links, code); tool_grid `title`, tab `label` and tool `name` are plain text. Raw HTML is sanitized: inline `style` keeps only cosmetic properties (no `position`, no `url()`), and `class`/`id` are removed. Do not try to style content with classes. A link there must be a site path (`/docs/x`), a `#fragment` or an absolute `https:`, `http:`, `mailto:` or `tel:` url; any other href (a relative path, `//host`) and any `//host` image src is dropped when the page renders, with no save error.

The site rejects some blocks on save (`SAVE_REJECTED`, the message lists each problem as `body: #<index> <type> …`):
- `htmlBlock`, `iframe` and any `_type` outside this allow list: `block` (paragraphs, headings, list items), `blockquoteGroup`, `break`, `table`, `file`, `pullquote`, `video`, `image`, `gallery`, `columns`, `cover`, `button`, `buttons`, `code`, `embed`, `callout`, `tabs`, `details`, `mermaid`, `tool_grid`, `investment_warning`;
- a `block` whose `children` hold anything but `span` (no blocks, covers, images or iframes inside a paragraph), a `span` with its own `children`, and any other node with `children`;
- a `block` with a `style` other than normal, h1–h6, blockquote, a `listItem` other than bullet, number, menu, a `level` outside 1–20, `marks` that are not a decorator (strong, em, underline, strike-through, subscript, superscript, code) or the `_key` of one of that block's `markDefs`, or a `markDefs` entry that is not a `link` with a string `href` (the same rules apply to blocks inside `cover.content`, `columns[].content` and `blockquoteGroup.blocks`, which may hold blocks only);
- a span with more than 20 `marks`, a block with more than 1000 `children`, or a `_key` that is not a string;
- a `url` or `logo` that is not a string on `button`, `buttons[]`, `file`, `embed` and `tool_grid` tools;
- an `embed` with `html` (an `embed` takes only `url`; YouTube and Vimeo render as a player, anything else as a link);
- core block fields outside their allowed values: `image.alignment` (left, center, right, wide, full), colours that are not `#hex`/`rgb()`, `cover.minHeight` other than a plain length, `code.language` with spaces, `tool_grid.logo_size` outside 16–300;
- an image whose `dominantColor` is not `#hex`/`rgb()` or whose `blurhash` the decoder rejects (its first character sets the length; any other length throws): the `image` and `gallery` blocks, the `featured_image` field of posts and the images of a page's `layout` blocks (`hero.image`, `feature_grid` `features[].image`); for those two fields this includes `meta` and `darkVariant`, and a `meta.storageKey` that is not a string;
- more than 2000 top-level blocks, 20000 spans or 5000 marks in one body (table cells count, and so do the empty cells core pads a table with); more than 5000 `markDefs` or 5000 line breaks in one body, more than 100 `markDefs` on one block, table or cell, or more than 1000 line breaks in one span; more than 500 images in one body (an `image` block counts one, a `gallery` one per image);
- a table whose `rows` or `cells` are not arrays of objects, a cell whose `content` holds anything but spans, more than 500 rows or 2000 cells in a table, or more than 1000 spans in a cell; a table whose grid (width × height, `colspan` and `rowspan` included) is over 2000 cells, or more than 20000 grid cells in one body; a table, row or cell `_key` that repeats within its table; a table, row, cell, or a table's or cell's markDef, with more than 16 fields; a table core's own layout code rejects (for example a bad mark name or markDef in a cell);
- a printed text field that is present (not null) but not a string: `image` `title`/`caption`, `code` `code`/`filename`, `pullquote` `text`/`citation`, `file` `filename`, `video` `caption`, `button` `text`, `cover` `backgroundImage`/`backgroundVideo`, `embed` `caption`, `callout` `title`/`body`, `details` `summary`/`body`, `mermaid` `code`, `tool_grid` `title`, a `block`'s `textAlign`, and in a page's `layout` every hero and feature_grid text (`layout: #0 hero title: …`); or one of these over its limit above (`#3 callout body: at most 25000 characters (got …)`), or a body over 52000 Markdown characters;
- `buttons.buttons`, `tabs.tabs` or `tool_grid.tools` that are not arrays of objects (`buttons.buttons: null` is rejected too; null is fine for `tabs` and `tools`), or hold more than 10, 20 or 100 items; a `tabs.default_tab` that is not a whole number from 1 to the number of tabs; a tab `label`/`body`, tool `name`/`tagline` or button `text` that is not a string, or a tool `featured` that is not true or false.
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

Content widgets (rich text in a widget area) are not rendered: an area that holds one is hidden whole, the footer on every page included. Put that text in a doc or page instead. Component widgets take only the props their component declares (`core:recent-posts` takes no `urlTemplate`: post links stay `/posts/<slug>`); any other key hides the area too, and so do a `title` or string prop over 200 characters, a `menuName` over 100, the same component twice in one area, more than 2 menu widgets, more than 20 widgets, or a recent-posts `count` over 20, a tags `limit` over 50 or an archives `limit` over 24.

## Checks after publishing

Open `<site>/docs/<slug>` (or `/zh-CN/docs/<slug>`) and confirm every block rendered. Leftover block syntax means a malformed block line: `node scripts/check-page.mjs <url> --absent 'ec:block'` must exit 0. `search` with `{"query":"…","collections":["docs"]}` should find the doc.
