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
  - PAT 只能由 Admin 给**自己**生成（`POST /_emdash/api/admin/api-tokens`），生成出来就是 Admin 权限。
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
| 1 | 长度上限 | `data` 里的字段（title、description、excerpt）由 guard 检查，保存和发布时都跑；slug、菜单项、term、byline 由新增的 `src/middleware.ts` 写入闸门检查；菜单在渲染时截断兜底 |
| 2 | 发布、恢复等不重跑 guard | `content:beforePublish`/`beforeSchedule` 重跑整套 guard 并检查 slug，fail closed；新增 `scripts/guard-scan.mjs`，扫描所有条目、回收站、revision、菜单、term、byline |
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
| content `slug` | 100 | 16 | 闸门；发布 hook（待生效 slug） |
| 菜单项 `label` | 80 | 6 | 闸门；渲染截断 |
| 菜单项 URL（REST `customUrl`，MCP `url`） | 2048 | 44 | 闸门 |
| `menu_set_items` 的项数 | 50 | 6 | 闸门；渲染只取前 50 |
| term `label` | 80 | 11 | 闸门 |
| term `slug` | 100 | 11 | 闸门 |
| byline `displayName` | 80 | 无 | 闸门 |
| byline `slug` | 100 | 无 | 闸门 |

**guard 里的长度**（title、description、excerpt）：按字段名作用于所有 collection，值是字符串时才检查，其他类型交给 core。保存时（`beforeSave`）、发布时（§3.2）、扫描时（§3.2）用的是同一个函数。

**写入闸门**（`src/middleware.ts`，判定逻辑放在纯函数 `packages/web9-site/lib/write-gate.mjs`，单测覆盖）：

- 只看 POST、PUT、PATCH，路径命中下表才读请求体。用 `request.clone().text()` 读，然后 `JSON.parse`，不看 Content-Type，因为 core 也不看。解析失败、请求体不是对象或数组、Content-Length 超过 10 MB 时一律放行，交给 core 报错。闸门只拦能确定超长的请求。
- 路径按 `/` 切段，每段 `decodeURIComponent`（失败就放行），去掉尾部的空段。
- REST：

  | 路径 | 检查 |
  |---|---|
  | `/_emdash/api/content/{c}`、`/_emdash/api/content/{c}/{id}` | `slug` |
  | `/_emdash/api/menus/{name}/items`、`/_emdash/api/menus/{name}/items/{id}` | `label`、`customUrl` |
  | `/_emdash/api/taxonomies/{name}/terms`、`.../terms/{slug}`、`.../terms/{slug}/translations` | `label`、`slug` |

- MCP（`/_emdash/api/mcp`）：请求体是一条消息或消息数组。每条 `method: "tools/call"` 按 `params.name` 检查 `params.arguments`：

  | 工具 | 检查 |
  |---|---|
  | `content_create`、`content_update` | `slug` |
  | `menu_set_items` | `items` 的长度，以及每项的 `label`、`url` |
  | `taxonomy_create_term`、`taxonomy_update_term` | `label`、`slug` |
  | `byline_create`、`byline_update` | `displayName`、`slug` |

- 超长时：
  - REST 返回 400，body 用 core 的错误格式 `{ "error": { "code": "VALIDATION_ERROR", "message": … } }`；
  - MCP 单条消息返回 HTTP 200 加 JSON-RPC error（`code: -32602`），`id` 照抄请求；batch 返回 HTTP 400 加一个 `id: null` 的 JSON-RPC error。
- 闸门认识的路径和工具会随 core 升级变化：
  - 一个测试把 `node_modules/emdash/src/mcp/server.ts` 注册的全部工具名，以及 `astro/routes/api/{content,menus,taxonomies}` 下的路由文件，钉成快照。
  - core 升级新增工具或路由时，测试失败，提醒人重新核对闸门。

**渲染兜底**：`Base.astro` 的菜单只取前 50 项，`label` 按 80 截断，超出部分换成 `…`，不切开 surrogate pair。菜单出现在每一页，而且没有 hook 和发布这第二道关；其他字符串的第二道关见 §6。

### 3.2 发布时重跑 guard、全库扫描（第 2 项）

**发布前 hook**：
- 插件的 `capabilities` 加 `hooks.content-policy:register`，用同一个 handler 注册 `content:beforePublish` 和 `content:beforeSchedule`。
- handler 对 `event.content.data` 跑和 `beforeSave` 相同的检查（块、图片、长度），另外检查 `event.content.slug` 的长度。
- 有问题时返回 `{ cancel: true, reason }`。`reason` 以 `Publish rejected (spec §10): ` 开头，控制字符换成空格，截到 500 个 code point 以内。
- handler 内部出错也返回 cancel，也就是 fail closed。

覆盖情况：
- publish、schedule、MCP 带 `status: "published"` 的 create，都经过这个 hook。
- duplicate 和 `revision_restore` 产生草稿，草稿发布时经过这个 hook。
- trash restore 可能直接恢复成已发布，不经过这个 hook，由下面的扫描覆盖。

**扫描脚本 `scripts/guard-scan.mjs`**（纯逻辑放在 `scripts/lib/guard-scan.mjs`，单测覆盖）：
- 用 admin token 通过 MCP 读取：
  - `schema_list_collections` 给出的每个 collection，字段为线上字段和钉死的表的并集；
  - 每个 collection 的 `content_list`（全部状态、全部 locale，翻页到底）和 `content_list_trashed`；
  - 每个条目的 `revision_list`（`limit: 50`）；
  - `menu_list` 给出的每个菜单（`menu_get`），`taxonomy_list` 给出的每个 taxonomy 的 term（翻页到底），`byline_list`（翻页到底）。
- 对每份 content data 跑 guard。条目查 `slug`，revision 查 `data._slug`。菜单、term、byline 查 §3.1 的长度。
- `revision_list` 的 `total` 大于返回数时，记一条问题（"只扫了最新的 N 个"）。
- 输出 `collection/id[@revision]: 问题`，最后一行是汇总。有任何问题时退出码为 1。
- 规则收紧后、部署前都要跑它；`CLAUDE.md` 的 Commands 写进这条命令。

### 3.3 线上 schema（第 3 项）

插件加 `schema:read`。`beforeSave` 和发布前 hook 先用 `ctx.schema.getCollection(collection)` 取线上字段：
- type 为 `portableText` 的字段并入要检查的 Portable Text 字段；
- type 为 `image` 的字段并入要检查的图片字段。

没有 `ctx.schema`（例如单测）或读取出错时，只用钉死的表，并用 `console.warn` 记一行。钉死的表覆盖今天所有字段，所以不因此拒绝保存。

`BLOCK_IMAGE_FIELDS`（`blocks` 字段里各 block type 的 image 路径）仍然钉死。`migrate verify` 新增 schema 漂移检查：
- 对线上每个 collection，portableText 字段、image 字段，以及每个 `blocks` 字段里每个 block type 的每个版本中的 image 路径（image 字段，加 repeater 子字段里的 image），都必须在钉死的表里；
- 否则打印 `schema drift: …`，退出码为 1。

### 3.4 `sections` 和媒体（第 4、6 项）

在 `packages/web9-site/render-sinks.test.mjs` 增加两条测试：
- `src/` 和 `packages/` 的非测试源码里不出现 `getSection` / `getSections`；
- `astro.config.mjs` 和 `wrangler.jsonc` 里不出现 `publicUrl`。

### 3.5 AI 的 token（第 5 项）

改写上级 spec §9 的"AI 发布"段：AI 用单独的 Editor 账号，token 通过 OAuth device flow 获得。不用 PAT：PAT 只能由 Admin 给自己生成，生成出来是 Admin 权限。

runbook（写进上级 spec §9）：
1. Admin 在后台建 AI 用户，角色选 Editor。
2. 在 AI 的运行环境里调 `POST /_emdash/api/oauth/device/code`，body 为 `{"scope":"content:read content:write media:read media:write"}`。一定要显式传 scope：不传的话默认还会给 `schema:read`。
3. 用 AI 用户登录后台，打开 `/_emdash/admin/device`，输入 user code 并批准。运行环境轮询 `/_emdash/api/oauth/device/token`，拿到 access token 和 refresh token。
4. 核对：
   - 用这个 token 调 MCP `content_list` 应该成功；
   - 调 `schema_list_collections`、`settings_update`、`site_export_start`，以及 REST `GET /_emdash/api/admin/api-tokens`、`GET /_emdash/api/redirects`，都应该被拒。
5. refresh token 只存在 AI 运行环境的 secret 里。停用时调 `/_emdash/api/oauth/token/revoke`，或者在后台禁用这个用户。

`transfer:*`、`admin` 和 import 永远不发给 AI。R2 bucket 不开公开访问（不加 r2.dev 域名，也不绑自定义域名）。

### 3.6 body 总量、表格、块结构（第 7 项）

在 `pt-guard.mjs` 里加三类检查。上限都远高于现有内容，括号里是现有最大值：

**body 总量**：
- 顶层节点不超过 2000（141）；
- 整个值里的 span 总数不超过 20000（203）：block 的 children、容器里 block 的 children、表格单元格的 content 都计入；
- 一个 `tabs` 块的 tab 不超过 20（6），一个 `tool_grid` 块的 tool 不超过 100（8），一个 `buttons` 块的 button 不超过 10（0）。

**表格**（core 结构：`table.rows[]` 是 `{ _type: "tableRow", cells[] }`，cell 是 `{ _type: "tableCell", content: Span[], markDefs?, ... }`）：
- `rows` 存在时必须是数组，每张表不超过 500 行（13）、2000 个单元格（109）；
- row 必须是对象，`cells` 存在时必须是数组；cell 必须是对象，`content` 存在时必须是数组；
- `content` 里只能是 span，span 不能有 children，`marks` 存在时是数组且不超过 20 个；
- mark 的名字和 markDefs 交给 core 的 `normalizePortableTextTable` 处理，它已经有边界。

**块结构**：
- `buttons.buttons`、`tabs.tabs`、`tool_grid.tools` 存在时必须是数组，元素必须是对象；
- button 的 `text`，tab 的 `label`、`body`，tool 的 `name`、`tagline`、`url`、`logo` 存在时必须是字符串；
- tool 的 `featured` 存在时必须是布尔值。

**渲染端**：Tabs、ToolGrid 的数据经由纯函数（`lib/tabs.mjs` 的 `tabItems`、`lib/tool-grid.mjs` 的 `toolItems`）整理后再渲染：
- 跳过不是对象的元素；
- 不是字符串的文本当空字符串；
- `featured` 只认 `true`。

`buttons` 块用 core 的组件渲染，不合法的结构由写入端和发布 hook 挡住，存量由扫描发现。

## 4. 测试和验收

- 每项先写失败的测试（TDD）。
- 现有 35 篇文档、2 篇 post、2 个 page 必须全部通过新规则：
  - `migrate all --dry-run` 全部 unchanged；
  - `verify` 为 54/54 页面、86/86 redirect，没有 schema drift；
  - `guard-scan` 0 个问题。
- 本地 dev 探针：
  - 超长的 slug、菜单 label、term label、byline displayName 经 REST 和 MCP 写入，都被拒，库里没有写进任何东西；
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
| AI 的 scope 改成 `content:read content:write media:read media:write` | `content:write` 不隐含 `content:read`，没有读权限 AI 无法 `content_list`；`menus:manage`、`taxonomies:manage` 已被 `content:write` 隐含 | AI 缺权限时报错，再按需加 |
