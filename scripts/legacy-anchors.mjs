#!/usr/bin/env node
// Usage: node scripts/legacy-anchors.mjs (from the repo root, while legacy/ exists)
// Regenerates packages/web9-site/lib/legacy-anchors.json (scripts/lib/legacy-anchors.mjs);
// scripts/lib/legacy-anchors.test.mjs fails while the committed file differs from what this writes.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { legacyAnchors } from "./lib/legacy-anchors.mjs";

const out = fileURLToPath(new URL("../packages/web9-site/lib/legacy-anchors.json", import.meta.url));
const table = legacyAnchors();
writeFileSync(out, `${JSON.stringify(table, null, "\t")}\n`);
const ids = Object.values(table).reduce((n, page) => n + Object.keys(page).length, 0);
console.log(`${ids} ids in ${Object.keys(table).length} docs -> ${out}`);
