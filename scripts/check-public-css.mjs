#!/usr/bin/env node
// Fails the build when CSS that public pages load could build a page overlay, uses a lowered
// light-dark(), or when a CSS file in dist/client cannot be classified (spec §10, §11).
//
//   node scripts/check-public-css.mjs [distDir]      (runs after `npm run build` as `postbuild`)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifySheets, readServerBundle, scanSheet } from "./lib/public-css.mjs";

const dist = path.resolve(process.argv[2] ?? "dist");
const walk = (dir, ext) =>
	readdirSync(dir, { withFileTypes: true, recursive: true })
		.filter((e) => e.isFile() && e.name.endsWith(ext))
		.map((e) => path.join(e.parentPath, e.name));

const { manifest, urlImports } = readServerBundle(walk(path.join(dist, "server"), ".mjs").map((f) => readFileSync(f, "utf8")));
const clientDir = path.join(dist, "client");
const clientCss = new Map(walk(clientDir, ".css").map((f) => [path.relative(clientDir, f).split(path.sep).join("/"), readFileSync(f, "utf8")]));
const { sheets, report, errors } = classifySheets({ manifest, urlImports, clientCss });
const problems = [...errors, ...sheets.flatMap(scanSheet)];

for (const [file, verdict] of report) console.log(`${verdict === "UNKNOWN" ? "!!" : "ok"}  ${file}  ->  ${verdict}`);
console.log(`scanned ${sheets.length} stylesheets`);
if (problems.length) {
	for (const p of problems) console.error(`check-public-css: ${p}`);
	console.error(`check-public-css: FAILED (${problems.length} problem(s))`);
	process.exit(1);
}
console.log("check-public-css: ok");
