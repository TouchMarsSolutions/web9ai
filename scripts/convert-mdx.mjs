#!/usr/bin/env node
// Convert a Docusaurus MDX doc into an EmDash `docs` payload (logic in ./lib/mdx-to-pt.mjs).
// Usage: node scripts/convert-mdx.mjs <file.mdx> [--section ai] [--category usecase] [--order 1] [--lang zh] [--site ""] > payload.json
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { convertMdx } from "./lib/mdx-to-pt.mjs";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		section: { type: "string", default: "ai" },
		category: { type: "string", default: "general" },
		order: { type: "string", default: "0" },
		lang: { type: "string", default: "zh" },
		site: { type: "string", default: "" },
	},
});
const [path] = positionals;
if (!path) {
	console.error("usage: convert-mdx.mjs <file.mdx> [--section] [--category] [--order] [--lang] [--site]");
	process.exit(2);
}
const payload = convertMdx(readFileSync(path, "utf8"), { path, ...values, order: Number(values.order) });
process.stdout.write(`${JSON.stringify(payload, null, 1)}\n`);
