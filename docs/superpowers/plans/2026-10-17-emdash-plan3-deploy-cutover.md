# 计划 3：部署、生产迁移、切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把站点部署到 Cloudflare Workers，在生产 D1 上跑完迁移，再把 `www.web9.ai` 从 GitHub Pages 切到 Worker。

**Architecture:**
- 一个 Worker `web9-ai`，账号 `eb04f0cb…`，和 zone `web9.ai` 在同一个账号。
- Worker 的 binding：
  - D1 `web9-ai`；
  - R2 `web9-ai-media`；
  - KV `SESSION`，首次部署时由 wrangler 建成 `web9-ai-session`；
  - `IMAGES`。
- 首次部署只开 `https://web9-ai.jhcao23.workers.dev`：
  - owner 在这个地址完成 setup；
  - 我用 owner 批准的 device flow token 跑迁移；
  - 验证通过后，删掉 GitHub Pages 的 5 条 DNS 记录，把 `www.web9.ai` 和 `web9.ai` 绑成 Worker 的 Custom Domain。
- `src/worker.ts` 把 apex 和 http 的请求 301 到 `https://www.web9.ai`。
- 部署方式：
  - 首次部署和切换都用本机 `wrangler deploy`（`CLOUDFLARE_API_TOKEN`）；
  - 切换稳定后，owner 在后台连接 Workers Builds，之后 `main` 自动部署。

**Tech Stack:** wrangler 4.151、EmDash 1.3（Astro 7、`@astrojs/cloudflare` 14）、Cloudflare REST API（D1、DNS、Workers Custom Domains）、`scripts/migrate.mjs`、`scripts/guard-scan.mjs`、vitest。

**Spec:** `docs/superpowers/specs/2026-10-15-emdash-migration-design.md`（§1、§6、§8、§9、§12）。路线图在 `docs/superpowers/plans/2026-10-15-emdash-plan2-migration-local.md` 文末"计划 3 路线图"。参照物：同一账号下的 `~/git/itouchmars.com` 和 `~/git/touchmars.technology`，2026-10-09 到 10-10 用同样的栈完成过切换，两个仓库的 `CLAUDE.md` 记了踩过的坑。

## 已核实的前提（2026-10-17）

| 前提 | 结论 | 依据 |
|---|---|---|
| worker 体积 | 没有压缩后上限，只限未压缩 64 MiB（Free 和 Paid 一样）。本站 19238.86 KiB（gzip 5061.54 KiB 只作参考）。spec §1 的"付费还是裁剪"不再成立 | developers.cloudflare.com/workers/platform/limits；`wrangler deploy --dry-run` |
| 账号套餐 | Workers Paid，每个请求 CPU 默认上限 30 s。Free 只有 10 ms，渲染重的 doc 页会超 | owner 2026-10-09 确认，记录在 `touchmars.technology/CLAUDE.md` |
| D1、R2 | 2026-10-17 已建（owner 授权）：D1 `web9-ai`，id `721318a8-ef7b-46b0-9e7c-423d1496882a`，WNAM，read replication `auto`；R2 `web9-ai-media`，WNAM，没有公开访问 | `wrangler d1 create`、`wrangler r2 bucket create`、`PUT …/d1/database/{id}` |
| KV `SESSION` | 配置里没有名字，首次部署时 wrangler 不提示，直接建成 `web9-ai-session`（`--x-auto-create` 默认开） | wrangler `runProvisioningFlow`、`autoProvisionedResourceName` |
| read replication | `astro.config.mjs` 里 `d1({session:"auto"})` 要求 D1 开 read replication（已开）。不能加 `global_fetch_strictly_public` flag | `@emdash-cms/cloudflare` `D1Config.session` 文档 |
| passkey 的域名 | 我们没设 `siteUrl`，也没设 `EMDASH_SITE_URL`，所以 rpId 等于请求的 hostname：在 workers.dev 注册的 passkey 只能在 workers.dev 上用。setup 时把 `emdash:site_url` 记成 `https://web9-ai.jhcao23.workers.dev`。切换后用 Change domain 迁移 | `emdash/dist/passkey-config-*.mjs`、`api/setup/index.mjs`、`site-domain-*.mjs` |
| Change domain | 检查方式是 Worker 自己 POST `https://<新域名>/_emdash/api/site/domain-proof`，而 Cloudflare 不会把 Worker 发往自己 Custom Domain 的请求送回这个 Worker，所以检查一定失败。做法：先从外部 curl 确认新域名由本站服务，再点 **Use … anyway**。目标域名不能有跳转，所以填 `www.web9.ai` | `itouchmars.com/CLAUDE.md`（2026-10-10 实测）、`site-domain-*.mjs` |
| setup 抢占 | 空库时，第一个完成 `/_emdash/admin` setup 的人就是管理员。首次部署后 owner 要马上完成 setup | `itouchmars.com/CLAUDE.md` |
| DNS（zone `web9.ai`，Free） | apex 有 4 条 A 记录（`185.199.108–111.153`，proxied），`www` 是 CNAME 到 `touchmarssolutions.github.io`（proxied），都指向 GitHub Pages。另有 MX ×5、DKIM、SPF、2 条 openai、1 条 google-site-verification TXT，与本计划无关 | `GET /zones/{id}/dns_records` |
| zone 设置 | Browser Integrity Check 开着，Always Use HTTPS 关着，SSL `full` | `GET /zones/{id}/settings/*` |
| GitHub Pages | 从 `gh-pages` 构建（legacy），cname `www.web9.ai`，证书覆盖 `www.web9.ai` 和 `web9.ai`，2026-12-01 到期 | `gh api repos/TouchMarsSolutions/web9ai/pages` |
| branch protection | `main` 没有 required status check，所以 spec §12 里 CI 改名那一项不阻塞 | `gh api …/branches/main/protection` |
| 迁移 token 的 scope | `admin`：`hasScope` 把 `admin` 当成除 `mcp:tools` 外的全部 scope，没列进 SCOPE_RULES 的 REST 路径（如 `/_emdash/api/redirects`）也要 `admin`。MCP 端点不过 SCOPE_RULES | `emdash/dist/astro/middleware/auth.mjs`、`@emdash-cms/auth` |
| 首次请求 | 空库的第一次请求（或第一次 cron tick）要跑 core migration，约 30 s；2026-10-17 实测 36 s | `touchmars.technology/CLAUDE.md` |
| Custom Domain 和已有 DNS 记录 | stdout 不是 TTY 时（agent 的 shell 就是这样），`wrangler deploy` 不提示，直接覆盖和 Custom Domain 冲突的 DNS 记录（`override_existing_dns_record`）；只有在交互终端里才会提示。所以带 `routes` 的配置一旦部署，GitHub Pages 的记录会被无声替换，并不会报错 | `node_modules/wrangler/wrangler-dist/cli.js:164347-164385`（PR #6 评审 I1） |
| API token 权限 | wrangler deploy 需要 Workers Scripts:Edit、Workers KV Storage:Edit、D1:Read、R2:Read、Account Settings:Read；Task 4 另需 zone `web9.ai` 的 DNS:Edit 和 Workers Routes:Edit。缺 KV 权限时 wrangler 会跳过 provisioning 继续部署，然后在后面才失败 | `cli.js:175311-175318`（评审 M6）。2026-10-17 首次部署成功，说明 Task 2 需要的权限都有；DNS:Edit 等到 Task 4 才知道 |
| 仓库是公开的 | 计划和 PR 会公开 workers.dev 的地址。setup 没完成之前，谁看到都能抢先注册管理员，所以部署后要立刻完成 setup，并在 Task 3 核对管理员只有一个 | `gh api repos/TouchMarsSolutions/web9ai`（评审 I3） |

## Owner 检查点

| | 什么时候 | owner 做什么 | 大约多久 |
|---|---|---|---|
| A | Task 2，首次部署 | 说"可以部署"，然后待在浏览器前，部署完马上打开 workers.dev 完成 setup（title `Web9.AI`，tagline `square of web3 to the power of AI`，不勾 sample content，创建 passkey） | 5 分钟 |
| B | Task 3 开头 | 在 `https://web9-ai.jhcao23.workers.dev/_emdash/admin/device` 输入我给的 user code 并批准 | 1 分钟 |
| C | Task 4 | 说"可以切换"：我删掉 5 条 GitHub Pages DNS 记录、绑 Custom Domain、部署 | 1 句话 |
| D | Task 4 之后 | 后台 Settings › General › Change domain，填 `www.web9.ai` → **Use … anyway** → **Continue on www.web9.ai** → 在 `www.web9.ai` 注册新 passkey | 3 分钟 |
| E | 切换稳定后 | Cloudflare 后台给 Worker `web9-ai` 连接 Workers Builds（设置见 Task 5） | 5 分钟 |
| F | 之后任意时间 | 按 spec §8 runbook 邀请 AI 的 Editor 账号并走 device flow | 10 分钟 |

## Global Constraints

- 文档用中文，技术术语保留英文；代码注释用英文，注释密度和用词跟周围代码一致。
- **对外操作**只在本计划写明的步骤里做。首次部署（检查点 A）和删 DNS、绑域名（检查点 C）都要等 owner 明确说可以。D1、R2 已经按 owner 2026-10-17 的授权建好。别的 Cloudflare 资源、zone 设置、GitHub 设置一律不动；需要改时先问。
- **永远不碰的 DNS 记录**：MX ×5、`google._domainkey`、SPF、两条 `openai-domain-verification`、`google-site-verification`。
- 不设 `siteUrl`、`EMDASH_SITE_URL`、`SITE_URL`，也不设 `EMDASH_ALLOWED_ORIGINS`：passkey 跟着请求的域名走，setup 之后再设会让已注册的 passkey 失效。
- secret 和 token 只放在 `.local/`（已 gitignore，权限 600）：
  - 不打印、不进聊天、不进 commit；
  - token 最多显示前 8 个字符；
  - 迁移用的 admin token 在 Task 4 验证完后 revoke，并删除本地文件。
- 不改 `gh-pages` 分支，不停用 GitHub Pages（它是回退目标），不从 `legacy/` 部署任何东西。
- **带 `routes` 的配置**：在 Task 4 Step 2 的 DNS 备份做完、Step 3 删掉那 5 条记录之前，routes PR 不能合并，任何带 `routes` 的 checkout 都不能运行 `wrangler deploy`，原因见上表"Custom Domain 和已有 DNS 记录"。
- 永远不运行 `wrangler dev --remote`：它连的是生产 D1，第一次请求就会对生产库跑 core migration。
- 环境变量不会在 Bash 调用之间保留：每条 `node scripts/...` 命令前面都直接带上 `EMDASH_URL=... EMDASH_TOKEN=...`，不要用 `export`。
- 后台里的操作由 owner 本人完成：2026-10-17 agent 用 CDP 替 owner 点 setup 的 "Continue" 时，被 Claude Code 的 auto mode 拦下（Unrequested Commit in a Connected App）。
- 提交：按文件名 `git add`，永远不提交 `.env`、`.dev.vars`、`.local/`、`.wrangler/`、`data.db`、`dist/`、`.superpowers/`。提交信息最后一行写 `Co-Authored-By: <你的模型名> <noreply@anthropic.com>`。
- PR 合并前要跑一次独立的 Fable `code-reviewer` 评审（只读，不发 GitHub 评论）。按评审意见修完后，把评审结果和处理结果合成一条 PR comment 贴上。CI 绿、PR 状态 CLEAN 后，用 merge commit 合并，标题 "Merge <PR title> (#N)"。
- dev server：
  - dev 在跑时不要跑 `npm run build` 或 `npm run typecheck`；
  - 启动 `npm run dev -- --port 4321`，停止 `npx astro dev stop`；
  - `astro dev` 不经过 `src/worker.ts`，worker 层的行为只能靠单元测试和部署后的 curl 验证。
- 部署前在 `main` 的 HEAD 上重新跑 `npm run build`。部署用的是 `dist/`，所以 `dist/` 必须是当前 HEAD 的构建结果。
- 浏览器：只通过 CDP :9222 借用已有标签页（`list_pages` → `select_page` → `navigate_page`），不开新标签页、不开新实例。setup、批准 device code、Change domain、注册 passkey 只能 owner 本人做。
- Shell：`grep` 是 ugrep，用 `command grep`；`sed -i ''` 不可用；zsh 里 `echo ====` 会被当成命令展开，分隔线要加引号。
- Cloudflare API 调用用 `curl`，不用 Python urllib（Browser Integrity Check 按 User-Agent 拦 Python，返回 403 `1010`）。

## File Structure

| 文件 | 任务 | 职责 |
|---|---|---|
| `packages/web9-site/lib/canonical-host.mjs`（新） | 1 | 判断一个请求要不要 301 到 `https://www.web9.ai` |
| `packages/web9-site/lib/canonical-host.test.mjs`（新） | 1 | 上面的单元测试，外加 `src/worker.ts` 调用它的源码钉子 |
| `src/worker.ts` | 1 | 在 EmDash 之前先做 canonical host 301 |
| `wrangler.jsonc` | 1、4 | Task 1：`workers_dev`、`preview_urls`、`observability`；Task 4：Custom Domain `routes` |
| `docs/superpowers/specs/2026-10-15-emdash-migration-design.md` | 1、6 | 把核实结果写回 §1、§9、§12，最后写上线状态 |
| `docs/superpowers/plans/2026-10-15-emdash-plan2-migration-local.md` | 1 | 路线图指向本计划 |
| `.local/prod-secrets.env`、`.local/prod-token`、`.local/dns-backup.json`（不提交） | 2–4 | 生产 encryption key、迁移 token、DNS 备份 |

---

### Task 1: 部署配置和 canonical host（代码 + 文档，一个 PR）

**状态**：PR #6。评审（Approve with fixes）之后有这些改动，下面的代码块是评审前的版本：
- `canonical-host.mjs` 新增 `canonicalResponse(request)`：GET 和 HEAD 返回 301，其他方法返回 308，这样 API 客户端跟随跳转时不会把写操作变成 GET。`new URL` 解析失败时返回 null。
- `src/worker.ts` 的 `fetch` 改成 `return canonicalResponse(request) ?? handler.fetch!(request, env, ctx)`。
- `preview_urls` 的注释改为如实说明：它只是不给版本分配预览 URL。

**Files:**
- Create: `packages/web9-site/lib/canonical-host.mjs`、`packages/web9-site/lib/canonical-host.test.mjs`
- Modify: `src/worker.ts`、`wrangler.jsonc`、两份文档（见 Step 6）

**Interfaces:**
- Produces: `canonicalRedirect(requestUrl: string): string | null`，以及 `CANONICAL_ORIGIN = "https://www.web9.ai"`

- [ ] **Step 1: 写失败的测试** `packages/web9-site/lib/canonical-host.test.mjs`

```js
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANONICAL_ORIGIN, canonicalRedirect } from "./canonical-host.mjs";

describe("canonicalRedirect", () => {
	it("leaves the canonical origin alone", () => {
		expect(canonicalRedirect("https://www.web9.ai/")).toBeNull();
		expect(canonicalRedirect("https://www.web9.ai/docs/intro?q=1")).toBeNull();
	});
	it("sends the apex to www, keeping path and query", () => {
		expect(canonicalRedirect("https://web9.ai/")).toBe("https://www.web9.ai/");
		expect(canonicalRedirect("https://web9.ai/zh-CN/docs/intro?q=a%20b")).toBe("https://www.web9.ai/zh-CN/docs/intro?q=a%20b");
	});
	it("sends plain http to https", () => {
		expect(canonicalRedirect("http://www.web9.ai/posts")).toBe("https://www.web9.ai/posts");
		expect(canonicalRedirect("http://web9.ai/")).toBe("https://www.web9.ai/");
	});
	it("leaves every other host alone: workers.dev, local dev, look-alikes", () => {
		for (const url of [
			"https://web9-ai.jhcao23.workers.dev/_emdash/admin",
			"http://localhost:4321/",
			"https://web9.ai.example.com/",
			"https://xweb9.ai/",
		])
			expect(canonicalRedirect(url), url).toBeNull();
	});
	it("matches astro.config's site", () => {
		const config = readFileSync(new URL("../../../astro.config.mjs", import.meta.url), "utf8");
		expect(config).toContain(`site: "${CANONICAL_ORIGIN}"`);
	});
	it("runs in src/worker.ts before EmDash's fetch handler", () => {
		const worker = readFileSync(new URL("../../../src/worker.ts", import.meta.url), "utf8");
		expect(worker).toMatch(/const location = canonicalRedirect\(request\.url\);[\s\S]*return handler\.fetch!\(request, env, ctx\);/);
	});
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx vitest run packages/web9-site/lib/canonical-host.test.mjs`
Expected: FAIL（找不到 `./canonical-host.mjs`）

- [ ] **Step 3: 实现** `packages/web9-site/lib/canonical-host.mjs`

```js
// The Worker answers on two Custom Domains (plan 3 Task 4). https://www.web9.ai is canonical (astro.config `site`):
// a request on the apex or over plain http is sent there with a 301 that keeps the path and query. Any other host
// (workers.dev, local wrangler dev) passes through untouched.
export const CANONICAL_ORIGIN = "https://www.web9.ai";
const PRODUCTION_HOSTS = new Set(["web9.ai", "www.web9.ai"]);

/** The 301 target for a request on a production host that is not the canonical origin, else null. */
export function canonicalRedirect(requestUrl) {
	const url = new URL(requestUrl);
	if (!PRODUCTION_HOSTS.has(url.hostname) || url.origin === CANONICAL_ORIGIN) return null;
	return CANONICAL_ORIGIN + url.pathname + url.search;
}
```

- [ ] **Step 4: 改** `src/worker.ts`

```ts
import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { canonicalRedirect } from "../packages/web9-site/lib/canonical-host.mjs";

export { PluginBridge };

export default {
	...handler,
	// The apex and plain http answer 301 to https://www.web9.ai before EmDash runs. Files under public/ are served by
	// static assets before the Worker is invoked, so they answer on any host without the redirect.
	fetch(request, env, ctx) {
		const location = canonicalRedirect(request.url);
		if (location) return new Response(null, { status: 301, headers: { Location: location } });
		return handler.fetch!(request, env, ctx);
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
```

- [ ] **Step 5: 改** `wrangler.jsonc`，在 `compatibility_flags` 后面加。routes 留给 Task 4：非交互的 `wrangler deploy` 会不提示、直接覆盖冲突的 DNS 记录，所以 routes 只能在 DNS 备份之后再进 `main`。

```jsonc
	"observability": { "enabled": true },
	// The Worker answers on workers.dev until the cutover and keeps it after: the owner's first passkey is bound to
	// that hostname until Change domain moves the login (plan 3 Task 4). wrangler may turn workers.dev off once
	// routes are configured unless it is set explicitly.
	"workers_dev": true,
	// No preview URLs: a preview version shares the production D1 and R2 bindings, and EmDash runs core migrations
	// on the first request, so a branch that upgrades emdash would migrate the production database (plan 3).
	"preview_urls": false,
```

- [ ] **Step 6: 把核实结果写回文档**

1. spec 第 5 行"进度"：把"计划 3（部署、生产迁移、切换）未开始"改成"计划 3（部署、生产迁移、切换）进行中，见 `docs/superpowers/plans/2026-10-17-emdash-plan3-deploy-cutover.md`"。
2. spec §1：把以"**待定（owner，计划 3）**：worker 压缩后 5044.82 KiB"开头的那句换成：
   > **已定（2026-10-17，计划 3）**：Workers 已经取消了压缩后体积的上限，只限未压缩 64 MiB，Free 和 Paid 一样。本站 `wrangler deploy --dry-run` 为 19238.86 KiB（gzip 5061.54 KiB 只作参考），不用裁剪。账号是 Workers Paid（owner 2026-10-09 确认，记在 touchmars.technology 仓库），每个请求的 CPU 默认上限 30 s；Free 只有 10 ms，渲染重的 doc 页会超。
3. spec §9：
   - "切换步骤"第 1 步改成：首次部署用本机 `wrangler deploy`（`CLOUDFLARE_API_TOKEN`），Workers Builds 在切换稳定后由 owner 连接（计划 3 Task 5）。
   - 两条"**待验证**"换成：
     > **已验证（2026-10-17）**：wrangler 按 `wrangler.jsonc` 里的名字连接资源，找不到就创建。D1 `web9-ai`（`721318a8-ef7b-46b0-9e7c-423d1496882a`，WNAM，read replication `auto`，`d1({session:"auto"})` 需要它）和 R2 `web9-ai-media`（WNAM，没有公开访问）已于 2026-10-17 建好。KV `SESSION` 不写名字，首次部署时由 wrangler 建成 `web9-ai-session`。`IMAGES` 不需要另建资源。`wrangler.jsonc` 只写名字、不写 id，和同账号的 itouchmars、touchmars.technology 一样。
     >
     > **已定（2026-10-17）**：不开预览（`preview_urls: false`，Workers Builds 关掉非生产分支构建）。预览版本和生产共用 D1、R2 binding，而 EmDash 在第一次请求时跑 core migration，一个升级了 emdash 的分支一旦有预览，就会改生产库的 schema。以后需要预览时，加一个用独立 D1、R2 的 staging environment。
   - 在"**首次启动**"那条后面加一条：
     > **登录域名（2026-10-17 核实）**：没设 `siteUrl` 和 `EMDASH_SITE_URL`，passkey 的 rpId 就是请求的 hostname。setup 在 workers.dev 上做，passkey 只在 workers.dev 能用；切换后在后台用 Settings › General › Change domain 迁到 `www.web9.ai`。它的自动检查注定失败（Worker 请求自己的 Custom Domain 不会回到本 Worker），所以先从外部 curl `POST /_emdash/api/site/domain-proof` 确认，再点 **Use … anyway**。setup 之后不要再设 `EMDASH_SITE_URL`，否则已有的 passkey 都会失效。
4. spec §12，"CI job 已改名"那条末尾加："**已核实（2026-10-17）**：`main` 的 branch protection 没有 required status check，不阻塞。"
5. 计划 2 文末"计划 3 路线图"标题下第一行加："执行计划：`docs/superpowers/plans/2026-10-17-emdash-plan3-deploy-cutover.md`（2026-10-17）。"

- [ ] **Step 7: 验证**

Run: `npx vitest run packages/web9-site/lib/canonical-host.test.mjs`，然后 `npm test`。
Expected: PASS。

接着先停 dev（`npx astro dev stop`），再跑 `npm run typecheck`（0 errors）、`npm run build`（`check-public-css: ok`）和 `npx wrangler deploy --dry-run --outdir <scratchpad>/p3-dryrun`。dry-run 的输出里要有 `env.SESSION`、`env.DB (web9-ai)`、`env.MEDIA (web9-ai-media)`、`env.IMAGES`、`env.ASSETS`。最后重启 dev。

- [ ] **Step 8: 提交，开 PR，评审，合并**

```bash
git add packages/web9-site/lib/canonical-host.mjs packages/web9-site/lib/canonical-host.test.mjs src/worker.ts wrangler.jsonc docs/superpowers/specs/2026-10-15-emdash-migration-design.md docs/superpowers/plans/2026-10-15-emdash-plan2-migration-local.md docs/superpowers/plans/2026-10-17-emdash-plan3-deploy-cutover.md
git commit -m "feat(deploy): canonical host redirect, workers.dev on, no preview URLs; plan 3"
```

push 之后开 PR，跑 Fable 评审，修完合并（见 Global Constraints）。合并后 `git checkout main && git pull --ff-only`。

---

### Task 2: 首次部署和 setup（检查点 A）

**前提**：owner 已经说"可以部署"，并且人在浏览器前。

**状态（2026-10-17）**：
- owner 说"部署"后，从 PR #6 分支的 HEAD `be8e11b7` 部署，没有等合并。原因：canonical redirect 只对 `web9.ai` 和 `www.web9.ai` 生效，而这两个域名还没绑到 Worker 上；合并后会再部署一次。
- 部署结果：
  - version `b0be8077-506e-4405-962c-25fc3d108824`；
  - KV `web9-ai-session`（`eb64a983…`）已自动创建；
  - D1 和 R2 按名字连上了已有资源；
  - `EMDASH_ENCRYPTION_KEY` 已上传为 secret。
- 第一次请求 `setup/status` 用了 36 s，返回 `needsSetup:true, step:"start"`。
- 现在等 owner 完成 setup。

- [x] **Step 1: 生成生产用的 encryption key**（只用于加密插件 secret。现在没有插件 secret，但要在第一次保存之前设好）

```bash
mkdir -p .local && umask 077 && npx emdash secrets generate --write .local/prod-secrets.env
```

文件只有一行 `EMDASH_ENCRYPTION_KEY=...`，权限 600，在聊天里不显示。key 怎么保管由 owner 决定（2026-10-17）：只放在 Cloudflare 的 Worker secret 里，不另做备份，部署后删掉本地文件（见 spec §9"备份"）。

- [x] **Step 2: 构建并部署**

```bash
npx astro dev stop; npm run build && npx wrangler deploy --secrets-file .local/prod-secrets.env && rm .local/prod-secrets.env
```

Expected:
- 输出 `https://web9-ai.jhcao23.workers.dev`。
- provisioning 的输出只有 `Provisioning SESSION (KV Namespace)...` 和 `Creating new KV Namespace "web9-ai-session"`。D1 和 R2 按名字连上已有资源，不会进入 provisioning，所以没有对应的输出。
- bindings 表里有 `env.DB (web9-ai)`、`env.MEDIA (web9-ai-media)`、`env.SESSION`、`env.IMAGES`、`env.ASSETS` 和 `env.EMDASH_ENCRYPTION_KEY`。

部署后立刻：
1. 由 agent 先 `curl` `/_emdash/api/setup/status`，这一步会把约 30 s 的 migration 跑完。
2. 确认返回的是 `needsSetup:true, step:"start"`，再告诉 owner 打开 `/_emdash/admin` 完成 setup。如果返回 `step` 不是 `start`，或者 `needsSetup:false`，而 owner 还没动过，说明有人抢先了，立刻停下。

如果改在交互终端里部署，wrangler 可能把 `database_id` 写进 `wrangler.jsonc`。部署后看一下 `git status`，有这类改动就丢掉。

- [ ] **Step 3: owner 做 setup**（检查点 A）

- 第一次请求约 30 s（跑 core migration）。
- 填 title `Web9.AI`，tagline `square of web3 to the power of AI`。
- 不勾 sample content：seed 里没有内容；terms 由 Task 3 的 runner 补建。
- 用 passkey 创建管理员账号。

- [ ] **Step 4: 确认部署状态**（不需要 token）

```bash
curl -s https://web9-ai.jhcao23.workers.dev/_emdash/api/setup/status
curl -s -o /dev/null -w '%{http_code}\n' https://web9-ai.jhcao23.workers.dev/
npx wrangler secret list
```

Expected:
- setup 显示已完成；
- 首页返回 200，库里还没有首页，所以显示占位；
- secret 列表里有 `EMDASH_ENCRYPTION_KEY`。

"只有一个管理员"留到 Task 3 拿到 token 后核对。

---

### Task 3: 生产迁移（检查点 B）

- [ ] **Step 1: 用 device flow 拿 admin token**（字段名已对照 `node_modules/emdash/dist/astro/routes/api/oauth/device/*.mjs` 和 `device-flow-*.mjs` 核实，见 PR #6 评审 M3）

```bash
curl -s -X POST https://web9-ai.jhcao23.workers.dev/_emdash/api/oauth/device/code \
  -H 'Content-Type: application/json' -d '{"scope":"admin"}'
```

- 返回格式是 `{success:true, data:{device_code, user_code, verification_uri, expires_in, interval}}`，code 15 分钟过期。
- 把 `user_code` 和 `verification_uri` 给 owner（检查点 B），owner 在 `/_emdash/admin/device` 输入 code 并批准。
- 轮询 token：

  ```bash
  curl -s -X POST https://web9-ai.jhcao23.workers.dev/_emdash/api/oauth/device/token \
    -H 'Content-Type: application/json' \
    -d '{"device_code":"<device_code>","grant_type":"urn:ietf:params:oauth:grant-type:device_code"}'
  ```

  - 每 6 s 一次，也就是 `interval` 加 1 秒。这个接口每个 IP 每分钟限 12 次；轮询太快会收到 `slow_down`，间隔再加 5 s。
  - 还没批准时返回 400 `{error:"authorization_pending"}`。
  - 批准后返回 `data.access_token`（1 小时过期）和 `data.refresh_token`（90 天过期）。分别写进 `.local/prod-token` 和 `.local/prod-refresh-token`，权限都是 600。
- access token 过期后，用 refresh token 换新的：

  ```bash
  POST /_emdash/api/oauth/token/refresh
  {"refresh_token":"…","grant_type":"refresh_token"}
  ```

- [ ] **Step 2: 核对只有一个管理员**

```bash
curl -s https://web9-ai.jhcao23.workers.dev/_emdash/api/admin/users -H "Authorization: Bearer $(cat .local/prod-token)" -H 'X-EmDash-Request: 1'
```

Expected: 只有 1 个用户，role 是 admin，邮箱是 owner 的。如果多出别人，立刻停下，告诉 owner（说明有人抢先完成了 setup）。

- [ ] **Step 3: 跑迁移**（顺序见 spec §12 和计划 2 路线图第 4 步）

每条命令前面都要带上 `EMDASH_URL=https://web9-ai.jhcao23.workers.dev EMDASH_TOKEN=$(cat .local/prod-token)`（环境变量不会在 Bash 调用之间保留）：

```bash
node scripts/migrate.mjs all --dry-run
node scripts/migrate.mjs menu --overwrite
node scripts/migrate.mjs all
node scripts/migrate.mjs all
node scripts/migrate.mjs verify
node scripts/guard-scan.mjs
```

Expected:
- `--dry-run` 只报 `menu/primary` 一处差异，也就是 seed 里的菜单；
- 第二次 `all` 每一步都是 `unchanged`；
- `verify` 是 54/54 页面、86/86 redirect，没有 schema drift；
- `guard-scan` 报 0 problems。

access token 1 小时过期。过期后按 Step 1 用 refresh token 换新的，不要让 owner 再批一次。

- [ ] **Step 4: 线上抽查**

1. 用 `node scripts/check-page.mjs` 抽查 workers.dev 上这些页面：`/`、`/zh-CN/`、`/docs/intro`、`/docs/tools-summary`、`/posts`、`/search?q=Coze`、`/rss.xml`、`/blog/rss.xml`（301）、一条旧 doc URL（301）。
2. 用浏览器（CDP 借用已有标签页）看首页和一篇 doc 的浅色、深色主题。看完导航回原页面。
3. 用 `wrangler tail web9-ai --format json` 采样 20 个请求，记下 CPU 和 wall time。

---

### Task 4: 切换（检查点 C、D）

**前提**：Task 3 全部通过；owner 已经说"可以切换"。

- [ ] **Step 1: 提前准备 routes 的 PR**（可以和 Task 3 同时做，评审通过后先不合并；Step 2 的备份和 Step 3 第 1 步的删除做完之前，绝对不能合并，也不能从这个分支部署）

在 `wrangler.jsonc` 的 `"workers_dev": true` 前面加：

```jsonc
	// Custom Domains (not routes): EmDash's Change domain only accepts a Custom Domain. www.web9.ai is canonical;
	// src/worker.ts sends the apex there with a 301.
	"routes": [
		{ "pattern": "www.web9.ai", "custom_domain": true },
		{ "pattern": "web9.ai", "custom_domain": true },
	],
```

- 提交信息 `feat(deploy): bind www.web9.ai and web9.ai as Custom Domains`；
- 同一个 PR 里把 spec §9"切换步骤"第 4 步改成"已完成"的状态说明，日期和 version 等切换后补上；
- 评审照常进行。

- [ ] **Step 2: 备份 DNS**

把 zone 的**全部** DNS 记录导出到 `.local/dns-full-before.json`，供 Step 3 比对。再把要删的 5 条（apex 的 4 条 A 和 `www` 的 CNAME）单独导出到 `.local/dns-backup.json`，每条包括 id、type、name、content、proxied 和 ttl。用 `jq length` 确认正好是 5 条。

- [ ] **Step 3: 删记录、合并、部署**

做法是先按 id 手动删掉这 5 条，再部署；不靠 wrangler 自动覆盖。原因：
- 自动覆盖时，apex 上哪些记录会被认为"冲突"，是 Cloudflare 那边定的，我们看不到。apex 上还有 MX、SPF、验证用的 TXT，这些绝不能动。
- 先删，部署时就没有冲突，覆盖逻辑什么都不会做。

代价是：从删记录到 Custom Domain 生效，站点会有一两分钟不可用。这一步要连着做完。

1. 按 id 逐条 `DELETE /zones/{zone}/dns_records/{id}`，只删这 5 条。
2. 合并 Step 1 的 PR，然后 `git pull`、停 dev、`npm run build`、`npx wrangler deploy`。
3. 预期输出里有 `www.web9.ai (custom domain)` 和 `web9.ai (custom domain)`。
4. 再拉一次 zone 的全部 DNS 记录，和 `.local/dns-backup.json` 之前的完整列表比对：
   - 只少了那 5 条；
   - 多了 Custom Domain 的记录；
   - MX、TXT 一条不少，内容不变。

   不一致就停下，按"回退"处理。

- [ ] **Step 4: 验证**

```bash
curl -sI 'https://www.web9.ai/' | head -5                  # 200，没有 x-github-request-id
curl -sI 'https://web9.ai/docs/intro?x=1' | command grep -i '^location'   # 301 https://www.web9.ai/docs/intro?x=1
curl -sI 'http://www.web9.ai/posts' | command grep -i '^location'         # 301 https://www.web9.ai/posts
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -X POST 'https://web9.ai/_emdash/api/mcp'  # 308 https://www.web9.ai/_emdash/api/mcp
curl -sI 'https://www.web9.ai/blog/rss.xml' | command grep -i '^location' # 301 /rss.xml
curl -sIL 'https://web9.ai/blog/rss.xml' | command grep -i '^location'    # 两跳：/rss.xml（asset 层的 _redirects），再到 https://www.web9.ai/rss.xml
curl -s -o /dev/null -w '%{http_code}\n' 'https://www.web9.ai/docs/%E0%A4%A'   # spec §12：记下实际状态码
EMDASH_URL=https://www.web9.ai EMDASH_TOKEN=$(cat .local/prod-token) node scripts/migrate.mjs verify
EMDASH_URL=https://www.web9.ai EMDASH_TOKEN=$(cat .local/prod-token) node scripts/mcp.mjs content_list '{"collection":"docs","limit":1}'
```

最后一条检查 Browser Integrity Check 会不会拦 Node 发出的 MCP 请求。如果返回 403 `1010`，记下来，问 owner 要不要关掉 BIC 或加一条 WAF 跳过规则，不要自己改。

- [ ] **Step 5: Change domain**（检查点 D）

```bash
curl -s -X POST -H 'X-EmDash-Request: 1' https://www.web9.ai/_emdash/api/site/domain-proof
```

Expected：EmDash 的 JSON，没有检查在进行时是 404 `No domain check in progress`，说明 `www.web9.ai` 由本站服务。然后 owner：
1. 在 workers.dev 后台打开 Settings › General › Change domain，填 `www.web9.ai`；
2. 检查失败时点 **Use … anyway**，再点 **Continue on www.web9.ai**；
3. 在 `www.web9.ai` 上注册新 passkey，并确认用它能登录。

- [ ] **Step 6: 收尾**

```bash
curl -s -X POST https://www.web9.ai/_emdash/api/oauth/token/revoke -H 'Content-Type: application/json' -H 'X-EmDash-Request: 1' -d "{\"token\":\"$(cat .local/prod-refresh-token)\"}"
rm .local/prod-token .local/prod-refresh-token
```

revoke 的 body 字段以 core 路由为准。revoke 之后再用旧 token 请求一次，确认返回 401。

---

### Task 5: Workers Builds（检查点 E）

在切换稳定之后由 owner 在后台操作。切换前不连，原因有两个：一是连上后，合并 routes PR 会自动部署，可能抢在删 DNS 之前；二是预览会共用生产库（见 spec §9）。

owner 的操作：在 Workers & Pages › `web9-ai` › Settings › Build 里连接 GitHub 仓库 `TouchMarsSolutions/web9ai`，然后设置：
- 生产分支 `main`；
- build command `npm run build`；
- deploy command `npx wrangler deploy`；
- **Builds for non-production branches：关**；
- 环境变量 `NODE_VERSION=22.22.0`（`package.json` engines 是 `>=22.22.0`）。

连上后，下一次合并到 `main` 的部署日志里应该能看到 `check-public-css: ok`，部署的 version 和本地部署的一致。

---

### Task 6: 切换后

- [ ] **AI 账号**（检查点 F）：按 spec §8 的 runbook，域名用 `https://www.web9.ai`。runbook 第 4 步的核对（`content_list` 能用，其他应被拒）我可以用 owner 给的 token 跑；token 只放 `.local/`，跑完删掉。
- [ ] **观察一周**：
  - 每天看 `/_emdash/api/redirects/404s`，给还在被访问的旧 URL 补规则；
  - `wrangler tail` 采样 CPU 和 wall time。同账号的 itouchmars 测到 D1 往返让 P50 wall time 达到 0.7–2.2 s，我们开了 read replication，要看实际效果，再决定要不要加页面缓存。
- [ ] **回写 spec**：§9 的切换步骤和"已定"里写上线日期、version id、Custom Domain，以及 Change domain 已经完成；§12 补上 BIC 和百分号编码的实测结果。
- [ ] **GitHub Pages**：证书 2026-12-01 到期后，GitHub 续不了期（DNS 已经不指向它），回退就不能用了。到时问 owner 要不要 unpublish `gh-pages`。

## 回退

切换后出问题时，按顺序：
1. **先撤掉 routes**：开一个 revert routes PR 的 PR 并合并，或者从 `wrangler.jsonc` 删掉 `routes`。否则下一次 `wrangler deploy`（或者连上 Workers Builds 之后的任何一次合并）又会不提示地覆盖恢复好的记录，回退就白做了。在这一步完成之前，不从任何带 `routes` 的 checkout 部署。
2. 删掉两个 Custom Domain：`GET /accounts/{account}/workers/domains` 找到 id，再 `DELETE`。删 Custom Domain 会连带删掉 Cloudflare 为它建的 DNS 记录，所以下一步是在空的名字上重建。
3. 按 `.local/dns-backup.json` 重建 5 条记录（POST，proxied 等字段保持原值），再和 `.local/dns-full-before.json` 比对一次。
4. GitHub Pages 的证书到 2026-12-01 前都有效，旧站立即恢复。

生产 D1 不受影响，修好后重新切换。

## 不在本计划内

- 删除 `legacy/` 和只为迁移存在的代码（路线图第 8 步）：生产稳定一段时间后另开计划。
- 页面缓存、KV object cache、Placement：看 Task 6 的数据再定。
- `npm audit` 的两项 breaking 升级（spec §12）。
- 关闭 workers.dev：owner 在 `www.web9.ai` 有 passkey 并且稳定后再决定。
