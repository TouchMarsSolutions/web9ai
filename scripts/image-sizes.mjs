#!/usr/bin/env node
// Usage: node scripts/image-sizes.mjs
// Regenerates packages/web9-site/lib/image-sizes.json from public/img and public/cover (scripts/lib/image-sizes.mjs).
// optimize-images.mjs runs this too; scripts/lib/image-sizes.test.mjs fails while the committed file is out of date.
import { fileURLToPath } from "node:url";
import { IMAGE_SIZES_FILE, writeImageSizes } from "./lib/image-sizes.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const { entries, changed } = await writeImageSizes(root);
console.log(`${changed ? "wrote" : "unchanged"} ${IMAGE_SIZES_FILE}: ${entries} images`);
