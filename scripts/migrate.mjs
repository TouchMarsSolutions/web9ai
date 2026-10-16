#!/usr/bin/env node
// Migration runner (spec §7): legacy Docusaurus content -> EmDash over MCP. Idempotent: a second run
// reports "unchanged" for everything already in place and writes nothing.
//
//   node scripts/migrate.mjs <step>... [--dry-run]
//   steps: docs, menu, verify (reads only), all (every write step, in order)
// Env: EMDASH_URL (default http://localhost:4321), EMDASH_TOKEN (default: .local/dev-token).
import { parseArgs } from "node:util";
import { docPayloads } from "./lib/docs-payloads.mjs";
import { readLegacyTree } from "./lib/legacy-tree.mjs";
import { checkMarkers } from "./lib/markers.mjs";
import { callTool } from "./lib/mcp.mjs";
import { upsertEntry, upsertMenu } from "./lib/sync.mjs";
import { docPageChecks } from "./lib/verify-pages.mjs";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { "dry-run": { type: "boolean", default: false } } });
const dryRun = values["dry-run"];
const site = process.env.EMDASH_URL ?? "http://localhost:4321";

/** Header menu (one en menu; Base.astro adds /zh-CN to / and /docs/* on zh-CN pages). */
const MENU = [
	{ label: "AI", type: "custom", customUrl: "/docs/intro" },
	{ label: "Dev", type: "custom", customUrl: "/docs/overview" },
	{ label: "Blog", type: "custom", customUrl: "/posts" },
	{ label: "GitHub", type: "custom", customUrl: "https://github.com/TouchMarsSolutions/web9ai", target: "_blank" },
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
			const res = await upsertEntry(callTool, want, { dryRun });
			if (doc.locale === "en") en.set(doc.rel, res);
			results.push({ name: `${doc.locale} ${doc.slug}`, ...res });
		}
		return results;
	},
	async menu() {
		return [{ name: "primary", ...(await upsertMenu(callTool, "primary", MENU, { dryRun })) }];
	},
	async verify() {
		const checks = docPageChecks(docPayloads(readLegacyTree()));
		const failures = [];
		for (const check of checks) {
			const res = await fetch(new URL(check.url, site));
			const { missing, unexpected } = checkMarkers(await res.text(), check);
			if (res.status !== 200 || missing.length || unexpected.length) failures.push({ url: check.url, status: res.status, missing, unexpected });
		}
		for (const f of failures) console.error(`verify: ${JSON.stringify(f)}`);
		console.log(`verify: ${checks.length - failures.length}/${checks.length} pages ok`);
		if (failures.length) process.exitCode = 1;
		return [];
	},
};
const WRITE_STEPS = ["docs", "menu"];

const steps = positionals.includes("all") ? WRITE_STEPS : positionals;
if (!steps.length || steps.some((s) => !STEPS[s])) {
	console.error(`usage: migrate.mjs <${[...Object.keys(STEPS), "all"].join("|")}>... [--dry-run]`);
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
	// A rejected save ([SAVE_REJECTED]), a lock (ENTRY_LOCKED) or an unresolved link: stop and show why.
	// Entries written so far stay; a re-run reports them as unchanged. Never retried, never overridden.
	console.error(`migrate: stopped: ${e.message}`);
	process.exit(1);
}
