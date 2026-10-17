# AI token 之前的安全前提：设计

- 状态：owner 于 2026-10-17 批准设计：第 1 项用写入闸门（方案 A）加渲染端兜底；AI 改用 Editor 账号的 device flow token。本文按 core 源码核实后有几处收窄或补全，见 §6。owner 授权直接执行，没有再等文字稿审阅。
- 上级 spec：`docs/superpowers/specs/2026-10-15-emdash-migration-design.md`。§10 是安全模型；§12 的"AI PAT 之前"列了 7 项，本文逐项给出做法。
- 计划：`docs/superpowers/plans/2026-10-17-ai-pat-preconditions.md`。

## 1. 背景

计划 2 在 `content:beforeSave` 里放了写入 guard（§10）。有几条写入路径和几类数值没经过它，或者它没限制。AI 账号拿到 token 之前，要先把这 7 项做完。全部改动都在本仓库里完成，不 patch `node_modules/emdash`。

调研结论（emdash 1.3，`node_modules/emdash/src`）：

- **长度**：content 的 `slug`、`data.title`，菜单项的 `label`、`customUrl`，term 的 `label`、`slug`，byline 的 `displayName`、`slug`，REST 和 MCP 的 zod schema 都没有 `.max()`（`api/schemas/content.ts:229,253`、`menus.ts:43,59`、`taxonomies.ts:9,42`、`bylines.ts:88`；`mcp/server.ts` 的 `content_create`、`content_update`、`menu_set_items`、`taxonomy_create_term`、`taxonomy_update_term`、`byline_create`、`byline_update`）。
- **beforeSave 看到什么**：`content:beforeSave` 拿得到 `data` 的字段（包括 `title`），拿不到 `slug`。菜单、taxonomy、byline 没有任何 hook。
- **请求体解析**：core 的 `parseBody` 不看 Content-Type，直接 `request.json()`（`api/parse.ts:27`）。MCP transport 接受 JSON-RPC batch，也就是数组（`@modelcontextprotocol/sdk` `webStandardStreamableHttp.js:504`）。
- **middleware 顺序**：EmDash 的 middleware 都是 `order: "pre"`（`astro/integration/index.ts:411-436`）。Astro 先跑 pre，再跑 `src/middleware.*`，所以项目自己的 middleware 在 EmDash 鉴权之后、路由之前运行，能直接返回 Response。仓库里现在还没有 `src/middleware.*`。
- **发布前 hook**：
  - `content:beforePublish`、`content:beforeSchedule` 需要 `hooks.content-policy:register` 能力（`plugins/hooks.ts:346`）。
  - `checkContentPolicy`（`emdash-runtime.ts:4441`）先用 `hydrateDraftData(..., { includeStagedSlug: true, strict: true })` 把草稿合并到线上数据上，所以 `event.content.data` 就是将要上线的数据，`event.content.slug` 是待生效的 slug。
  - handler 返回 `{ cancel: true, reason }` 即取消。`reason` 去掉首尾空白后必须非空，最多 500 个 code point，并且不含控制字符（`plugins/content-policy.ts`）；不合规的返回值算 handler 出错。
  - `definePlugin` 默认 `errorPolicy: "abort"`（`define-plugin.ts:283`），handler 出错会传到 runtime；runtime 捕获后拒绝发布（`emdash-runtime.ts:4511`）。
- **哪些路径会发布**：
  - REST create 只接受 `status: "draft"`。
  - MCP `content_create` 带 `status: "published"` 时，先建草稿，再走 `handleContentPublish`，会经过 hook。
  - docs、posts、pages 三个 collection 都支持 `drafts` 和 `revisions`，所以 update 产生的是草稿，要发布才上线。
- **schema**：插件声明 `schema:read` 后，`ctx.schema.getCollection(slug)` 返回线上字段 `{ slug, type }`（`plugins/context.ts:381`）。MCP `schema_get_collection` 返回 `blocks` 字段的全部 block type 和全部版本（包括退役版本）。
- **revision**：每个条目保留最新 50 个（`pruneQueuedEntry(..., 50)`）。MCP `revision_list` 一次最多 50 个，没有 cursor，返回 `{ items, total }`。
- **token**：
  - PAT 只能由 Admin 给**自己**生成（`POST /_emdash/api/admin/api-tokens`）。token 的身份就是这个 Admin（角色检查按 Admin，revision 记在 Admin 名下），只靠创建时选的 scope 收窄（REST 在 `astro/middleware/auth.ts` 的 `enforceTokenScope`，MCP 工具里是 `requireScope`）；Editor 拿不到 PAT。
  - OAuth device flow 发的 token 是"请求的 scope ∩ 该角色允许的 scope"（`api/handlers/device-flow.ts:123`，`@emdash-cms/auth rbac.ts` `clampScopes`）。
  - Editor 能持有的 scope：`content:read/write`、`media:read/write`、`schema:read`、`taxonomies:manage`、`menus:manage`、`settings:read`。拿不到的：`schema:write`、`settings:manage`、`admin`、`transfer:*`、`mcp:tools`。
  - `content:write` 隐含 `menus:manage`、`taxonomies:manage`，但不隐含 `content:read`（`tokens.ts:95`）。
  - device flow 不传 `scope` 时，默认给 `content:read/write`、`media:read/write`、`schema:read`。
  - access token 1 小时过期，refresh token 90 天。
- **import 和 transfer**：
  - transfer 要 `transfer:*` scope；`/_emdash/api/import` 和 `/_emdash/api/admin/*` 要 `admin` scope（`astro/middleware/auth.ts:808-813`）。
  - MCP 的 `site_*` 要 ADMIN 角色。
  - Editor token 走不到这些路径。
- **sections**：core 导出 `getSection`/`getSections`（`index.ts:688`），本仓库没有调用。widget area 已经由 `SafeWidgetArea` 处理（计划 2）。
- **媒体**：
  - `/_emdash/api/media/file/{key}` 带 `sandbox` CSP 和 `nosniff`，SVG、PDF 作为附件下载（`astro/routes/api/media/file/[...key].ts:121-139`）。
  - `r2({ publicUrl })` 可以把媒体放到公开域名，现在没设。

## 2. 决定

| # | 项 | 做法 |
|---|---|---|
| 1 | 长度上限 | `data` 里的字段（title、description、excerpt，docs 的 category）由 guard 检查，保存和发布时都跑；slug、`seo.image`、`seo.canonical`、byline 的 `roleLabel`、菜单项、term、byline 由新增的 `src/middleware.ts` 写入闸门检查；菜单在渲染时截断，widget area（footer、文章侧栏）里的菜单 widget 渲染前检查 |
| 2 | 发布、恢复等不重跑 guard | `content:beforePublish`/`beforeSchedule` 重跑整套 guard 并检查 slug，fail closed；新增 `scripts/guard-scan.mjs`，扫描所有条目、回收站、revision、菜单、term、byline、widget area |
| 3 | 字段表钉在 seed 上 | hook 用 `schema:read` 读线上的 portableText/image 字段，和钉死的表取并集；`migrate verify` 加 schema 漂移检查 |
| 4 | `sections` | 测试锁定 `src/`、`packages/` 不调用 `getSection`/`getSections` |
| 5 | import 和 transfer | AI 用 Editor 账号的 device flow token，scope 只要 `content:read content:write media:read media:write`；发放和核对写成 runbook（§3.5） |
| 6 | 媒体 | 测试锁定 `astro.config.mjs` 和 `wrangler.jsonc` 里不出现 `publicUrl` |
| 7 | 三个"AI PAT 之前修" | guard 加 body 总量上限，深入检查表格单元格和块结构；`Tabs`、`ToolGrid` 渲染时遇到异常结构不崩 |

## 3. 设计

### 3.1 长度上限（第 1 项）

上限都放在 `packages/web9-blocks/lib/limits.mjs`，写入端和渲染端共用。长度按 JavaScript 字符串长度计（UTF-16 code unit）：

| 值 | 上限 | 现有最大值 | 在哪检查 |
|---|---|---|---|
| content `data.title` | 200 | 31 | guard（保存、发布） |
| content `data.description` | 1000 | 227 | guard（保存、发布） |
| content `data.excerpt` | 1000 | 20 | guard（保存、发布） |
| docs `data.category` | 80 | 7 | guard（保存、发布）；侧栏分组名渲染截断 |
| content `slug` | 100 | 16 | 闸门；发布 hook（待生效 slug） |
| content `seo.image` | 2048 | 无 | 闸门 |
| content `seo.canonical` | 2048 | 无 | 闸门 |
| content `bylines[].roleLabel` | 80 | 无 | 闸门 |
| 菜单项 `label` | 80 | 6 | 闸门；渲染截断；widget area 里的菜单 widget 渲染前检查 |
| 菜单项 `customUrl` | 2048 | 44 | 闸门；widget area 里的菜单 widget 渲染前检查 |
| 菜单项 `titleAttr` | 200 | 无 | 闸门；widget area 里的菜单 widget 渲染前检查 |
| 菜单项 `target` | 32 | 6 | 闸门 |
| `menu_set_items` 的项数 | 50 | 4 | 闸门；渲染只取前 50；widget area 里的菜单 widget 渲染前检查 |
| term `label` | 80 | 11 | 闸门 |
| term `slug` | 100 | 11 | 闸门 |
| byline `displayName` | 80 | 无 | 闸门（REST `admin/bylines` 和 MCP） |
| byline `slug` | 100 | 无 | 闸门（REST `admin/bylines` 和 MCP） |

"现有最大值"是 2026-10-17 在本地库里读出来的（MCP 只读，39 个条目、1 个菜单、5 个 term）。`seo.image`、`seo.canonical`、`roleLabel`、`titleAttr` 和 byline 现在库里没有值。`category` 的现有最大值是 2026-10-17 最后一轮修复时读的（39 个条目、38 个 revision）。

**guard 里的长度**（title、description、excerpt、category）：按字段名作用于所有 collection，值是字符串时才检查，其他类型交给 core。`category` 是 docs 侧栏的分组名：没有对应显示名的 category 原样当分组名打印在每个 doc 页的侧栏上，所以 `docs-nav.mjs` 的 `groupLabel` 渲染时也按 80 截断（分组的 key 不截断）。保存时（`beforeSave`）、发布时（§3.2）、扫描时（§3.2）用的是同一个函数。

**写入闸门**（`src/middleware.ts`，判定逻辑放在纯函数 `packages/web9-site/lib/write-gate.mjs`，单测覆盖）：

- 只看 POST、PUT、PATCH，`context.routePattern` 命中下面的表才读请求体。用 `readGatedBody(request.clone().body)` 读，去掉开头的 BOM（否则 `JSON.parse` 抛错，闸门就放行了），然后 `JSON.parse`，不看 Content-Type，因为 core 也不看。解析失败、stream 出错、请求体不是对象或数组时放行，交给 core 报错。闸门只拦能确定超长的请求。
- 闸门按 `context.routePattern` 判定，也就是 Astro 匹配到的、由 emdash 注入的路由 pattern，从不看 URL。原因：Astro 用解码后的路径字符串做路由匹配，而 `context.url.pathname` 又被 URL setter 规范化了一次（`\` 变成 `/`，dot segment 被解析掉，`node_modules/astro/dist/core/fetch/fetch-state.js:236-239`），按路径判定的闸门和路由会对不上：`PUT …/terms/a%5Cb` 和 `…/terms/%252E%252E` 都到了 `terms/[slug]`，却绕过了按路径判定的闸门（评审时发现，已修，用 live 探针验证）。匹配到的 pattern 就是将要运行的路由，两边不会不一致。
- 请求体上限 10 MiB（`MAX_GATED_BODY_BYTES`，等于 core 的 `MAX_BODY_SIZE`）。超限时（声明的 Content-Length 超限，或没有 Content-Length 的 chunked body 读到超限），闸门自己返回 413，格式同该路由：REST 是 `PAYLOAD_TOO_LARGE`（同 core），MCP 是 SDK 的 JSON-RPC 413（`code: -32000`，`id: null`，message 里写的是 SDK 自己的 4 MiB 上限）。原因：core 的 `parseBody` 只拒绝声明了超限 Content-Length 的请求，chunked body 没有上限（`node_modules/emdash/src/api/parse.ts:31-39`），放行等于闸门对 chunked 的大请求失效。读 body 时边读边数，超限就停，不缓冲剩下的部分。
- REST（路径写成路由 pattern）：

  | 路由 pattern | 检查 |
  |---|---|
  | `/_emdash/api/content/[collection]`、`/_emdash/api/content/[collection]/[id]` | `slug`、`seo.image`、`seo.canonical`、`bylines[].roleLabel` |
  | `/_emdash/api/menus/[name]/items`、`/_emdash/api/menus/[name]/items/[id]` | `label`、`customUrl`、`titleAttr`、`target` |
  | `/_emdash/api/taxonomies/[name]/terms`、`/_emdash/api/taxonomies/[name]/terms/[slug]`、`/_emdash/api/taxonomies/[name]/terms/[slug]/translations` | `label`、`slug` |
  | `/_emdash/api/admin/bylines`、`/_emdash/api/admin/bylines/[id]`、`/_emdash/api/admin/bylines/[id]/translations` | `displayName`、`slug` |

- MCP（`/_emdash/api/mcp`）：请求体是一条消息或消息数组。每条 `method: "tools/call"` 按 `params.name` 检查 `params.arguments`：

  | 工具 | 检查 |
  |---|---|
  | `content_create`、`content_update` | `slug`、`seo.image`、`seo.canonical`、`bylines[].roleLabel` |
  | `menu_set_items` | `items` 的长度，以及每项的 `label`、`customUrl`、`titleAttr`、`target`（items 是平铺的，没有嵌套） |
  | `taxonomy_create_term`、`taxonomy_update_term` | `label`、`slug` |
  | `byline_create`、`byline_update` | `displayName`、`slug` |

- 超长时：
  - REST 返回 400，body 用 core 的错误格式 `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": … } }`，带 `Cache-Control: private, no-store`（同 core `api/error.ts`）；
  - MCP 单条消息返回 HTTP 200 加 JSON-RPC error（`code: -32602`），`id` 照抄请求；batch 返回 HTTP 400 加一个 `id: null` 的 JSON-RPC error。
- 闸门认识的路由和工具会随 core 升级变化。`packages/web9-site/write-gate.core.test.mjs` 把下面这些钉成快照（emdash 自带 `src/`，从 `node_modules` 读）：
  - `node_modules/emdash/src/mcp/server.ts` 注册的全部 MCP 工具名；
  - `astro/integration/routes.ts` 注入的、content、menus、taxonomies、admin/bylines、widget-areas、mcp 下的全部路由 pattern，闸门用到的每一条都必须在里面；
  - `astro/routes/api/{content,menus,taxonomies,admin/bylines,widget-areas}` 下的路由文件；
  - `parse.ts` 的 10 MiB 上限，以及 MCP SDK 的 413 格式；
  - 闸门读的参数名和 body 字段名：上面每个 MCP 工具的 zod 参数 key（含 `seo`、`bylines` 的子 schema），以及每条 REST 路由 `parseBody` 用的 schema 的 key。core 改名时（例如 `seo.canonical` 换了名字），闸门会静默放行，快照测试让它先失败。
- core 升级新增工具或路由、或改了 pattern 的名字时，测试失败，提醒人重新核对闸门，再更新快照。

**渲染兜底**：
- `Base.astro` 的菜单只取前 50 项，`label` 按 80 截断，超出部分换成 `…`，不切开 surrogate pair。菜单出现在每一页，而且没有 hook 和发布这第二道关；其他字符串的第二道关见 §6。
- widget area（footer、文章侧栏，都经 `SafeWidgetArea` 渲染）里的菜单 widget：`SafeWidgetArea` 对 area 里每个 menu widget 读它指向的菜单（`getMenu`）。任何一个菜单不通过 `menuIsSafe`，或者读取时抛错，整个 area 不渲染（fail closed）。`menuIsSafe` 检查：项数不超过 50，`label` 不超过 80，`url` 不超过 2048，`titleAttr` 不超过 200。原因：core 的 `WidgetRenderer` 把这些字段原样打印，没有截断。`target` 只在写入时限制（闸门和 `guard-scan`），渲染端不查。

### 3.2 发布时重跑 guard、全库扫描（第 2 项）

**发布前 hook**：
- 插件的 `capabilities` 加 `hooks.content-policy:register`，用同一个 handler 注册 `content:beforePublish` 和 `content:beforeSchedule`。
- handler 对 `event.content.data` 跑和 `beforeSave` 相同的检查（块、图片、长度），另外检查 `event.content.slug` 的长度。
- 有问题时返回 `{ cancel: true, reason }`。`reason` 以 `Publish rejected (spec §10): ` 开头，控制字符换成空格，截到 500 个 code point 以内。
- handler 内部出错也返回 cancel，也就是 fail closed。整个 handler 包在 try/catch 里，从不抛错：抛错时 runtime 也会拒绝发布，但不会设 `cancellation`，于是定时发布的条目不会被取消排期，scheduler 每次都会重试（`handleContentPublish` 只在有 `cancellation` 时 unschedule）。清理后的 reason 为空时，用固定文案。
- 检查本身是一个纯函数（`entryProblems`），`beforeSave`、发布 hook、`guard-scan` 共用；`search_text` 的生成留在 `beforeSave` 里。

覆盖情况：
- publish、schedule、MCP 带 `status: "published"` 的 create，都经过这个 hook。
- duplicate 和 `revision_restore` 产生草稿，草稿发布时经过这个 hook。
- trash restore 可能直接恢复成已发布，不经过这个 hook，由下面的扫描覆盖。

**扫描脚本 `scripts/guard-scan.mjs`**（纯逻辑放在 `scripts/lib/guard-scan.mjs`，单测覆盖）：
- 用 admin token 通过 MCP 读取：
  - `schema_list_collections` 给出的每个 collection，字段为线上字段和钉死的表的并集；
  - 每个 collection 的 `content_list`（全部状态、全部 locale，翻页到底）和 `content_list_trashed`；
  - 每个条目的 `revision_list`（`limit: 50`）；
  - `menu_list` 给出的每个菜单（`menu_get`），`taxonomy_list` 给出的每个 taxonomy 的 term（翻页到底），`byline_list`（翻页到底）；
  - widget area 走 REST `GET /_emdash/api/widget-areas`（没有读 widget 的 MCP 工具；要 `widgets:read`，admin token 有）。
- 对每份 content data 跑 guard。条目查 `slug`，revision 查 `data._slug`。
- 条目另查 `content_list` 返回的 `seo.image`、`seo.canonical` 和 `bylines[].roleLabel`。回收站里的条目查不了这三项：`content_list_trashed` 不返回它们，`content_get` 又排除回收站的行。闸门限制了写入，但从回收站恢复既不经过闸门也不经过 hook。
- 菜单查每项的 `label`、`customUrl`、`url`、`titleAttr`、`target` 和项数；term、byline 查 §3.1 的长度。
- widget area 按 `SafeWidgetArea` 渲染前的检查来查（§3.1）：先 `widgetAreaIsSafe`，再对每个 menu widget 指向的菜单跑 `menuIsSafe`。`getMenu` 按请求的 locale 选菜单，所以同名菜单的每个 locale 都查；菜单用 `menu_get` 的结果，custom 项的 `customUrl` 按 core 的规则当作 `url`（`customUrl || "#"`，`menus/index.ts:297-298`）。菜单名找不到时通过（渲染出来是空的）。返回的形状不对（没有 `items` 数组，或某个 area 没有字符串 `name` 和 `widgets` 数组）时中止。
- `revision_list` 的 `total` 大于返回数时，记一条问题（"只扫了最新的 N 个"）。
- 输出 `collection/id[@revision]: 问题`，每发现一条就打印一条，最后一行是汇总。有任何问题时退出码为 1。
- 汇总单独写出 revision 里的问题数：`…; N problems (M in revisions, which cannot be edited; they age out after 50 newer revisions)`。revision 是存下来的快照，编辑修不了；core 每个条目只留最新 50 个（`cleanup.ts:42`，每小时的系统清理执行），所以再保存 50 次后它们会被清掉。它们仍然让退出码为 1。
- fail loud：读不到的东西不算"0 个问题"。MCP 返回的形状不对、cursor 重复、`nextCursor` 不是非空字符串，或者列出的条数和 core 给的 `total` 对不上，都直接中止：退出码为 1，不打印汇总行。
- 规则收紧后、部署前都要跑它；`CLAUDE.md` 的 Commands 写进这条命令。

### 3.3 线上 schema（第 3 项）

插件加 `schema:read`。`beforeSave` 和发布前 hook 先用 `ctx.schema.getCollection(collection)` 取线上字段：
- type 为 `portableText` 的字段并入要检查的 Portable Text 字段；
- type 为 `image` 的字段并入要检查的图片字段。

没有 `ctx.schema`（例如单测）或读取出错时，只用钉死的表，并用 `console.warn` 记一行。钉死的表覆盖今天所有字段，所以不因此拒绝保存。

`BLOCK_IMAGE_FIELDS`（`blocks` 字段里各 block type 的 image 路径）仍然钉死。`migrate verify` 新增 schema 漂移检查：
- 对线上每个 collection，portableText 字段、image 字段，以及每个 `blocks` 字段里每个 block type 的每个版本中的 image 路径（image 字段，加 repeater 子字段里的 image），都必须在钉死的表里；
- 否则打印 `schema drift: …`，退出码为 1。

`migrate verify` 因此要读 schema（MCP `schema_list_collections`、`schema_get_collection`），需要带 `schema:read` 的 token（Editor 以上；AI 的 token 没有）。读 schema 出错时，在页面和 redirect 的结果都打印之后，以退出码 1 结束，不把读不到当作没有漂移。

### 3.4 `sections` 和媒体（第 4、6 项）

在 `packages/web9-site/render-sinks.test.mjs` 增加两条测试：
- `src/` 和 `packages/` 的非测试源码里不出现 `getSection` / `getSections`；
- `astro.config.mjs` 和 `wrangler.jsonc` 里不出现 `publicUrl`。

### 3.5 AI 的 token（第 5 项）

改写上级 spec §8 的"AI 管理内容"段：AI 用单独的 Editor 账号，token 通过 OAuth device flow 获得。不用 PAT：PAT 只能由 Admin 给自己生成，token 的身份就是这个 Admin，只靠 scope 收窄；Editor 拿不到 PAT。

runbook（写进上级 spec §8）：
1. Admin 在后台建 AI 用户，角色选 Editor。
2. 在 AI 的运行环境里调 `POST /_emdash/api/oauth/device/code`，body 为 `{"scope":"content:read content:write media:read media:write"}`。一定要显式传 scope：不传的话默认还会给 `schema:read`。
3. 用 AI 用户登录后台，打开 `/_emdash/admin/device`，输入 user code 并批准。运行环境轮询 `POST /_emdash/api/oauth/device/token`，body 为 `{"device_code":"…","grant_type":"urn:ietf:params:oauth:grant-type:device_code"}`，拿到 access token 和 refresh token。
4. 核对：
   - 用这个 token 调 MCP `content_list` 应该成功；
   - 调 `schema_list_collections`、`settings_update`、`site_export_start`，以及 REST `GET /_emdash/api/admin/api-tokens`、`GET /_emdash/api/redirects`，都应该被拒。
5. 续期：access token 1 小时后过期，运行环境调 `POST /_emdash/api/oauth/token/refresh`，body 为 `{"grant_type":"refresh_token","refresh_token":"…"}`。refresh token 不轮换，续期不延长它的 90 天，到期后要重新走 device flow。
6. refresh token 只存在 AI 运行环境的 secret 里。停用时调 `/_emdash/api/oauth/token/revoke`，或者在后台禁用这个用户。

`transfer:*`、`admin` 和 import 永远不发给 AI。R2 bucket 不开公开访问（不加 r2.dev 域名，也不绑自定义域名）。

### 3.6 body 总量、表格、块结构（第 7 项）

在 `pt-guard.mjs` 里加三类检查。上限都远高于现有内容，括号里是现有最大值（最后一轮修复新增的上限，即每个 block、表格、单元格的 markDefs、图片数、记录字段数和 `default_tab`，其现有值是 2026-10-17 用 MCP 只读重测的：39 个条目、38 个 revision、73 个 PT 值）：

**body 总量**：
- 顶层节点不超过 2000（141）；
- 整个值里的 span 总数不超过 20000（203）：block 的 children、容器里 block 的 children、表格单元格的 content 都计入；表格按 core 的 normalizer 铺好的网格计，补出来的空格子每个算一个 span；
- 整个值里的 mark 总数不超过 5000（77），同样的计入范围。单页 CPU 主要花在 mark 上：计划 2 实测 1000 span × 20 mark 的块约 0.3 s（`buildMarksTree`）。只限 span 总数时，一页仍可以有 40 万个 mark；限到 5000 个后，按实测比例估算约 0.08 s；
- 整个值里的表格网格格子总数不超过 20000（109）：core 的 normalizer 和 `Table.astro` 对每个网格格子都要做一遍工作，写下来的单元格再少也一样（一个 colspan 100 × rowspan 20 的单元格铺出 2000 个格子，只算 1 个 span）。每张表按 max(网格格子数, 原始行数) 计，因为没有 cell 的行会被排成一个格子，但要先把每一行都加 key 并复制一遍；
- 整个值里的 markDefs 总数不超过 5000（49）：`@portabletext/toolkit` 对每个 mark 做一次 `markDefs.find`（astro-portabletext 3.0.3 的副本，`dist/index.js:81`），渲染成本是 mark 数 × markDefs 数。block、容器里的 block、表格和表格单元格的 markDefs 都计入，在逐项检查和交给 normalizer 之前先计。另外每个 block、每张表格、每个单元格的 markDefs 不超过 100（3；表格和单元格现在都是 0）：总量只管整个值，一个 block 带 5000 个 markDefs 就把整个值的额度用在一处；core 的 `Table.astro` 用 Map 查单元格的 markDefs，交给 toolkit 的只有被引用的那几个，但 block 的 markDefs 整个交给 toolkit，`find` 在一个 block 的列表上跑；表格和单元格的列表同样限 100；
- 换行：一个 span 的文字最多 1000 个换行，整个值最多 5000 个（现有最大值：一个 span 1 个，整个值 3 个）。原因：toolkit 把每个 span 按 `\n` 切开，再从尾部一行一行把 `\n` 节点插回去（`dist/index.js:91-95`），每个 span 是平方级（8 万个换行约 1.6 s）。block、容器里的 block 和表格单元格里的 span 都计入；
- 整个值里的图片不超过 500（14）：`image` 块算 1 张，`gallery` 每张图算 1 张。原因见下面的 blurhash：渲染时每张带 blurhash 的图都要解码一次；
- 一个 `tabs` 块的 tab 不超过 20（6），一个 `tool_grid` 块的 tool 不超过 100（8），一个 `buttons` 块的 button 不超过 10（0）。

span、mark、网格格子、markDefs、换行、图片这六项总量中任何一项超限，检查就在那一处停止，不再往下走，并记一条"最多 N 个"的问题。

**表格**（core 结构：`table.rows[]` 是 `{ _type: "tableRow", cells[] }`，cell 是 `{ _type: "tableCell", content: Span[], markDefs?, ... }`）：
- `rows` 存在时必须是数组，每张表不超过 500 行（13）、写下来的单元格不超过 2000 个（78）；
- row 必须是对象，`cells` 存在时必须是数组；cell 必须是对象，`content` 存在时必须是数组；
- `content` 里只能是 span，span 不能有 children，`marks` 存在时是数组且不超过 20 个；
- 表格、row、cell 的 `_key` 在这张表里不能重复（缺失、空或非字符串的 key 由 core 生成，不查）：core 的 normalizer 对每个 key 做一次线性的后缀扫描来去重（`reserveKey`），重复的 key 让渲染时间变成平方级；
- 表格、row、cell，以及表格和单元格的 markDef，每条记录最多 16 个字段（现有最大值 5）：normalizer 对每条记录的每个 key 跑一遍正则并复制整条记录（`safeFields`，`node_modules/@emdash-cms/admin/dist/portable-text-table.js:494`）。过宽的记录在上面几项检查里就被拒，不会交给 normalizer；
- guard 自己跑 core 的 `normalizePortableTextTable`，和 `Table.astro` 是同一个模块、同一个 specifier：
  - core 排不出来的表直接拒绝，单元格里的 mark 名字和 markDefs 不合法也在这里被拒；
  - "2000 个单元格"指的是 normalizer 铺出来的网格（宽 × 高，colspan 和 rowspan 最多各按 100 算），另外写下来的单元格最多 2000 个；网格格子数还要计入上面 20000 的总量；
  - 只对没有其他问题的表运行，所以 normalizer 看到的永远是已经过了形状、key 和字段数检查的表。

**块结构**：
- `buttons.buttons`、`tabs.tabs`、`tool_grid.tools` 存在时必须是数组，元素必须是对象；
- `buttons.buttons: null` 被拒：core 的 `Buttons.astro` 只给 undefined 设默认值（`buttons = []`），null 会抛错；`tabs.tabs` 和 `tool_grid.tools` 为 null 则通过，因为 web9 的 Tabs、ToolGrid 把 null 当空列表；
- button 的 `text`，tab 的 `label`、`body`，tool 的 `name`、`tagline`、`url`、`logo` 存在时必须是字符串；
- tool 的 `featured` 存在时必须是布尔值；
- `tabs.default_tab` 存在（不是 null 或 undefined）时必须是 1 到 tab 数之间的整数（tab 数按上限 20 计；现有值：6 个 tab 的块用 3，3 个 tab 的块用 1）。后台的数字输入框清空时存的是 undefined，所以不填可以通过。

**blurhash**：guard 不解码 blurhash，只做解码器自己在抛错之前做的结构检查：第一个字符在 base83 字母表里，长度等于 `4 + 2 × numX × numY`（numX、numY 由第一个字符算出）。解码器（`@unpic/placeholder` 0.1.2 的 `blurhashToImageCssString`，内部是 `blurhash` 2.0.5 的 `decode`）只在这两种情况抛错：字符串为空或短于 6，或长度对不上（首字符不在字母表里时按 -1 读，算出的长度是 4，所以总是对不上）；其余字符不在字母表里时也按 -1 读，不抛错。所以这个检查和"解码不抛错"完全等价，不额外要求其余字符在字母表里（那样会拒绝能渲染的值）。`pt-guard.blurhash.test.mjs` 把两边对比了 7 万多个字符串（每个首字符、几种填充字符、长度 0–168），并钉住两个包的版本。原因：原来 guard 对每张图解码一次，一张 9×9 的 blurhash 约 0.13 ms，一个 4 MiB 的 gallery 要 2–3 s CPU；结构检查约 0.03 µs。渲染时仍要解码，500 张 9×9 的图约 67 ms。

**渲染端**：Tabs、ToolGrid 的数据经由纯函数（`lib/tabs.mjs` 的 `tabItems`、`lib/tool-grid.mjs` 的 `toolItems`）整理后再渲染：
- 跳过不是对象的元素；
- 不是字符串的文本当空字符串；
- `featured` 只认 `true`；
- Tabs 的 `default_tab` 不是整数时按 1，超出范围时夹到第一个或最后一个 tab（`lib/tabs.mjs` 的 `activeTab`）。

`buttons` 块用 core 的组件渲染，不合法的结构由写入端和发布 hook 挡住，存量由扫描发现。

## 4. 测试和验收

- 每项先写失败的测试（TDD）。
- 现有 35 篇文档、2 篇 post、2 个 page 必须全部通过新规则：
  - `migrate all --dry-run` 全部 unchanged；
  - `verify` 为 54/54 页面、86/86 redirect，没有 schema drift；
  - `guard-scan` 0 个问题。
- 本地 dev 探针：
  - 超长的 slug、菜单 label、term label、byline displayName 经 REST 和 MCP 写入，都被拒，库里没有写进任何东西；byline 走 REST 的 `/_emdash/api/admin/bylines`；
  - 两条会让路径判定和路由对不上的路径：`PUT /_emdash/api/taxonomies/{name}/terms/a%5Cb` 和 `…/terms/%252E%252E`，超长的 term label 都被拒；
  - 超过 10 MiB 的 chunked body（没有 Content-Length）写到闸门管的路由：返回 413，REST 是 `PAYLOAD_TOO_LARGE`，MCP 是 JSON-RPC 413，库里没有写进任何东西；
  - 超长 title 经 MCP 保存被拒；
  - 一个草稿的 title 超长时（只能用旧规则下写入的数据构造，无法构造时用单测替身验证 handler），发布被取消；
  - batch 请求被拒。
- `npm test`、`npm run build`（包括公开 CSS 检查）和 `npm run typecheck` 都要通过。

## 5. 不在范围内

- 计划 3 的部署和切换；
- 真正创建 AI 用户或 token；
- 其他不属于"AI PAT 之前"的未决事项。

## 6. 对批准设计的调整（执行前核对 core 后）

| 调整 | 原因 | 如果错了的代价 |
|---|---|---|
| title 不进闸门，改由 guard 检查，另加 description、excerpt | guard 覆盖所有写入路径（后台、REST、MCP、import），闸门只覆盖 REST 和 MCP；这两个字段也出现在列表页和 llms.txt | 上限不合适时，改 `limits.mjs` 一个数 |
| 闸门另加菜单 URL、`menu_set_items` 项数、term slug、term 翻译、byline | 同属"渲染到很多页的字符串"，Editor token 都能写，走的也是同一套代码 | 多拒了合法写入：上限远高于现有值，可以调整 |
| 渲染截断只做菜单，不做标题、term、byline | 标题和 slug 有发布 hook 做第二道关；term、byline 只出现在 post 列表和 tag 页，绕过闸门的存量由 `guard-scan` 发现；菜单在每一页、又没有第二道关 | 绕过闸门的超长 term 或 byline 会让列表页变长，直到扫描发现 |
| 另加 mark 总数上限 5000 | 批准的设计只限 span 总数；单页 CPU 由 mark 数决定（计划 2 的测量），20000 个 span 各带 20 个 mark 时约 6 s | 合法内容的 mark 超过 5000（现有最大 77）时被拒，可以调高 |
| AI 的 scope 改成 `content:read content:write media:read media:write` | `content:write` 不隐含 `content:read`，没有读权限 AI 无法 `content_list`；`menus:manage`、`taxonomies:manage` 已被 `content:write` 隐含 | AI 缺权限时报错，再按需加 |
| 闸门按 `context.routePattern` 判定，不看 URL（批准的设计和 §3.1 初稿用 `context.url.pathname`） | Astro 用解码后的路径字符串做路由匹配，`context.url.pathname` 又被规范化过一次，两者会对不上，`terms/a%5Cb` 和 `terms/%252E%252E` 就绕过了按路径判定的闸门；匹配到的 pattern 就是将要运行的路由 | emdash 升级改了 pattern 的名字时，快照测试失败；在人处理之前，那条路由不受检查 |
| 闸门另加 `seo.image`、byline 的 `roleLabel`、菜单项的 `titleAttr` 和 `target`，以及 REST `admin/bylines` | 同属 Editor token 能写、core 的 schema 没有上限的字符串，又渲染到页面上：`seo.image` 进 og:image，`roleLabel` 进文章页的署名，`titleAttr` 进 widget area 里的菜单 widget；byline 原来只管了 MCP 一条路 | 合法的长值被拒：上限远高于现有值，可以调整 |
| 超过 10 MiB 的请求体由闸门返回 413，批准的设计是放行交给 core | core 只拒绝声明了超限 Content-Length 的请求，chunked body 没有上限；放行等于闸门对 chunked 的大请求失效 | 合法的、超过 10 MiB 的写入被拒；声明了长度时，core 本来就会拒 |
| `SafeWidgetArea` 检查 widget area（footer、文章侧栏）里的菜单 widget，不通过就不渲染 | core 的 `WidgetRenderer` 不截断菜单项的 `label` 和 `titleAttr`；菜单没有 hook，也没有发布这第二道关 | footer 或文章侧栏的 area 消失，直到菜单修好；`guard-scan` 会报告是哪个菜单 |
| guard 自己跑 core 的表格 normalizer（`@emdash-cms/admin/portable-text-table`） | `Table.astro` 渲染的就是它的输出；只有跑同一个函数，才知道 core 排不排得出这张表、铺出多少格子 | 它是 emdash 的传递依赖，没有写进 `web9-blocks/package.json`：emdash 升级把它挪走时 import 失败，测试会发现 |
| 表格的"单元格"改指网格格子 | 渲染成本跟网格格子数成正比，一个 colspan × rowspan 的单元格就能占几千个格子，写下来的单元格数管不住 | 合法的大表被拒：网格上限 2000，现有最大 78 |
| 发布和定时发布被拒时，reason 文案相同（`Publish rejected (spec §10): …`），错误码不同（`PUBLISH_REJECTED`、`SCHEDULE_REJECTED`） | 同一个 handler 注册为 `beforePublish` 和 `beforeSchedule`，错误码由 core 按动作给出 | 只看 reason 分不出是发布还是定时发布，要看错误码 |
| blurhash 改为结构检查，不再解码（最后一轮修复） | 解码一张 9×9 的 blurhash 约 0.13 ms，一个 4 MiB 的 gallery 让一次保存花 2–3 s CPU；结构检查和"解码不抛错"完全等价（§3.6），测试对比两边并钉住版本 | `blurhash` 或 `@unpic/placeholder` 升级改了抛错的条件：版本钉死的测试和对比测试先失败 |
| 每个 block、表格、单元格的 markDefs 上限 100，整个值的图片上限 500，表格记录字段上限从 32 降到 16 | 总量只管整个值，一个 block 就能用掉 5000 个 markDefs；图片数决定渲染时的解码次数；16 仍是现有最大值（5）的 3 倍多 | 合法内容被拒：现有最大值分别是 3、14、5，可以调高 |
| `seo.canonical` 进闸门，docs 的 `category` 进 guard（上限 80），侧栏分组名渲染时也截到 80 | 同属 Editor token 能写、core 没有上限、又渲染到页面上的字符串：`canonical` 进 `<link rel="canonical">`，没有显示名的 `category` 原样当侧栏分组名，出现在每个 doc 页 | 合法的长值被拒：现有 category 最长 7 |
| `guard-scan` 经 REST 扫 widget area，汇总单列 revision 里的问题 | widget 没有 MCP 工具可读，原来不在扫描范围内；revision 里的问题编辑修不了，要和能修的分开说 | REST 返回的形状变了时扫描中止（fail loud），不会当作 0 个 area |
