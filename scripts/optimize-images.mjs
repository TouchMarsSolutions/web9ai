#!/usr/bin/env node
// Usage: node scripts/optimize-images.mjs [--dry-run]
// Shrinks the PNG and JPEG files under public/img and public/cover in place: same path and format, so the /img/... URLs
// stored in content keep working. A file over MAX_IMAGE_WIDTH or OPTIMIZE_OVER_BYTES (scripts/lib/raster-images.mjs) is
// resized to that width and re-encoded (PNG as a 256-colour palette, JPEG with mozjpeg), and written back only when
// that saves at least 10%. A palette PNG within the width limit is left alone at any size: quantizing it again only loses
// colours, so a second run writes nothing. Run it after adding images; raster-images.test.mjs fails until every file is
// within limits.
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import sharp from "sharp";
import { listRasterImages, MAX_IMAGE_WIDTH, OPTIMIZE_OVER_BYTES, RASTER_DIRS, rasterSize } from "./lib/raster-images.mjs";

const dryRun = process.argv.includes("--dry-run");
// IHDR colour type 3 (byte 25) is an indexed-colour PNG
const isPalettePng = (buf) => buf.length > 25 && buf.readUInt32BE(0) === 0x89504e47 && buf[25] === 3;
let before = 0;
let after = 0;
let rewritten = 0;
for (const dir of RASTER_DIRS) {
	for (const file of await listRasterImages(dir)) {
		const input = await readFile(file);
		const size = rasterSize(input);
		if (size && size.width <= MAX_IMAGE_WIDTH && (input.length <= OPTIMIZE_OVER_BYTES || isPalettePng(input))) continue;
		const pipeline = sharp(input).resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true });
		const output = await (extname(file).toLowerCase() === ".png"
			? pipeline.png({ palette: true, quality: 85, compressionLevel: 9, effort: 10 })
			: pipeline.jpeg({ quality: 82, mozjpeg: true })
		).toBuffer();
		const kb = (n) => `${Math.round(n / 1024)} KB`;
		if (output.length > input.length * 0.9) {
			console.log(`skip     ${kb(input.length)} (re-encoded ${kb(output.length)}) ${file}`);
			continue;
		}
		const out = rasterSize(output);
		console.log(`${dryRun ? "would" : "wrote"}    ${kb(input.length)} -> ${kb(output.length)}  ${size?.width}x${size?.height} -> ${out?.width}x${out?.height}  ${file}`);
		before += input.length;
		after += output.length;
		rewritten++;
		if (!dryRun) await writeFile(file, output);
	}
}
console.log(`${dryRun ? "would rewrite" : "rewrote"} ${rewritten} files: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
