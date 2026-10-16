#!/usr/bin/env node
// Migration runner (spec §7): legacy Docusaurus content -> EmDash over MCP. Idempotent: a second run
// reports "unchanged" for everything already in place and writes nothing.
//
//   node scripts/migrate.mjs <step>... [--dry-run] [--overwrite]
//   steps: docs, menu, terms, posts, redirects, home, verify (reads only), all (every write step, in order)
// Fail closed: an entry or menu that exists and differs from the migration stops the run ([WOULD_OVERWRITE])
// unless --overwrite is given; a dry run lists the differences. A pending draft that differs always stops it
// ([PENDING_DRAFT]). Redirect rules of the legacy-docusaurus group follow the same rule. See scripts/lib/sync.mjs
// and scripts/lib/redirects.mjs.
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: .local/dev-token). The redirects
// step needs an admin token (the dev-bypass token is one).
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { docPayloads } from "./lib/docs-payloads.mjs";
import { homePageChecks, homePayload } from "./lib/home-content.mjs";
import { readLegacyTree } from "./lib/legacy-tree.mjs";
import { checkMarkers } from "./lib/markers.mjs";
import { callTool, defaultToken } from "./lib/mcp.mjs";
import { postPayloads } from "./lib/posts.mjs";
import { legacyRedirects, restRequest, syncRedirects } from "./lib/redirects.mjs";
import { upsertEntry, upsertMenu } from "./lib/sync.mjs";
import { seedTerms, syncTerms } from "./lib/terms.mjs";
import { docPageChecks } from "./lib/verify-pages.mjs";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { "dry-run": { type: "boolean", default: false }, overwrite: { type: "boolean", default: false } },
});
const dryRun = values["dry-run"];
const overwrite = values.overwrite;
const site = process.env.EMDASH_URL ?? "http://localhost:4321";

/** Header menu (one en menu; Base.astro adds /zh-CN to / and /docs/* on zh-CN pages). */
const MENU = [
	{ label: "AI", type: "custom", customUrl: "/docs/intro" },
	{ label: "Dev", type: "custom", customUrl: "/docs/overview" },
	{ label: "Blog", type: "custom", customUrl: "/posts" },
	{ label: "GitHub", type: "custom", customUrl: "https://github.com/TouchMarsSolutions/web9ai", target: "_blank" },
];

/** Redirects that are not rows of the table: pattern rules (sample URLs) and the feeds in astro.config.mjs. */
const REDIRECT_SAMPLES = [
	["/blog/ai-tools-adhoc", "/posts/ai-tools-adhoc"],
	["/zh-CN/blog/ai-tools-adhoc", "/posts/ai-tools-adhoc"],
	["/blog/tags/ai", "/tag/ai"],
	["/blog/rss.xml", "/rss.xml"],
	["/blog/atom.xml", "/rss.xml"],
	["/zh-CN/blog/rss.xml", "/rss.xml"],
	["/zh-CN/blog/atom.xml", "/rss.xml"],
];

const STEPS = {
	async docs() {
		const en = new Map();
		const results = [];
		for (const { doc, want } of docPayloads(readLegacyTree())) {
			if (doc.locale !== "en") {
				const original = en.get(doc.rel);
				if (original?.id) Object.assign(want, { translationOf: original.id, translationGroup: original.translationGroup });
			}
			const res = await upsertEntry(callTool, want, { dryRun, overwrite });
			if (doc.locale === "en") en.set(doc.rel, res);
			results.push({ name: `${doc.locale} ${doc.slug}`, ...res });
		}
		return results;
	},
	async menu() {
		return [{ name: "primary", ...(await upsertMenu(callTool, "primary", MENU, { dryRun, overwrite })) }];
	},
	async terms() {
		return syncTerms(callTool, "tag", seedTerms(JSON.parse(readFileSync("seed/seed.json", "utf8")), "tag"), { dryRun });
	},
	async posts() {
		// content_create fails on an unknown term. A dry run of `all` has not created them yet, so only check when writing.
		const terms = new Set((await callTool("taxonomy_list_terms", { taxonomy: "tag" })).items.map((t) => t.slug));
		const results = [];
		for (const { want } of postPayloads(readLegacyTree())) {
			const missing = want.taxonomies.tag.filter((t) => !terms.has(t));
			if (missing.length && !dryRun) throw new Error(`posts/${want.slug}: tag terms ${missing.join(", ")} do not exist; run the terms step first`);
			results.push({ name: `en ${want.slug}`, ...(await upsertEntry(callTool, want, { dryRun, overwrite })) });
		}
		return results;
	},
	async redirects() {
		return syncRedirects(restRequest(site, defaultToken()), legacyRedirects(readLegacyTree()), { dryRun, overwrite });
	},
	async home() {
		const en = await upsertEntry(callTool, homePayload("en"), { dryRun, overwrite });
		const zh = homePayload("zh-CN");
		if (en.id) Object.assign(zh, { translationOf: en.id, translationGroup: en.translationGroup });
		return [
			{ name: "en home", ...en },
			{ name: "zh-CN home", ...(await upsertEntry(callTool, zh, { dryRun, overwrite })) },
		];
	},
	async verify() {
		const tree = readLegacyTree();
		const checks = [...docPageChecks(docPayloads(tree)), ...homePageChecks()];
		const failures = [];
		for (const check of checks) {
			const res = await fetch(new URL(check.url, site));
			const { missing, unexpected } = checkMarkers(await res.text(), check);
			if (res.status !== 200 || missing.length || unexpected.length) failures.push({ url: check.url, status: res.status, missing, unexpected });
		}
		const pageFailures = failures.length;
		const hops = [...legacyRedirects(tree).filter((r) => !r.source.includes("[")).map((r) => [r.source, r.destination]), ...REDIRECT_SAMPLES];
		for (const [from, to] of hops) {
			const res = await fetch(new URL(from, site), { redirect: "manual" });
			const location = res.headers.get("location") && new URL(res.headers.get("location"), site).pathname;
			if (res.status !== 301 || location !== to) failures.push({ url: from, status: res.status, location, wanted: to });
		}
		for (const f of failures) console.error(`verify: ${JSON.stringify(f)}`);
		console.log(`verify: ${checks.length - pageFailures}/${checks.length} pages ok`);
		console.log(`verify: ${hops.length - (failures.length - pageFailures)}/${hops.length} redirects ok`);
		if (failures.length) process.exitCode = 1;
		return [];
	},
};
const WRITE_STEPS = ["docs", "menu", "terms", "posts", "redirects", "home"];

const steps = positionals.includes("all") ? WRITE_STEPS : positionals;
if (!steps.length || steps.some((s) => !STEPS[s])) {
	console.error(`usage: migrate.mjs <${[...Object.keys(STEPS), "all"].join("|")}>... [--dry-run] [--overwrite]`);
	process.exit(2);
}
try {
	for (const step of steps) {
		const results = await STEPS[step]();
		if (!results.length) continue;
		const counts = {};
		for (const r of results) {
			counts[r.action] = (counts[r.action] ?? 0) + 1;
			if (r.action !== "unchanged") console.log(`  ${step}: ${r.action} ${r.name}${r.diff ? `  (${r.diff})` : ""}`);
		}
		console.log(`${step}${dryRun ? " (dry run)" : ""}: ${Object.entries(counts).map(([a, n]) => `${a} ${n}`).join(", ")}`);
	}
} catch (e) {
	// A rejected save ([SAVE_REJECTED]), a lock (ENTRY_LOCKED), content that would be overwritten or a pending
	// draft ([WOULD_OVERWRITE], [PENDING_DRAFT]) or an unresolved link: stop and show why.
	// Entries written so far stay; a re-run reports them as unchanged. Never retried, never overridden.
	console.error(`migrate: stopped: ${e.message}`);
	process.exit(1);
}
