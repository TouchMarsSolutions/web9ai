#!/usr/bin/env node
// Usage: node scripts/check-page.mjs <url> <marker>... [--absent <marker>...]
// Exits 1 unless the page returns 200, contains every marker, and none of the --absent ones.
import { checkMarkers } from "./lib/markers.mjs";

const [url, ...rest] = process.argv.slice(2);
const cut = rest.indexOf("--absent");
const present = cut < 0 ? rest : rest.slice(0, cut);
const absent = cut < 0 ? [] : rest.slice(cut + 1);
const res = await fetch(url);
const { missing, unexpected } = checkMarkers(await res.text(), { present, absent });
console.log(JSON.stringify({ url, status: res.status, missing, unexpected }, null, 1));
process.exit(res.status === 200 && !missing.length && !unexpected.length ? 0 : 1);
