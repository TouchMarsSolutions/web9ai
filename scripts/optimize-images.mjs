#!/usr/bin/env node
// Usage: node scripts/optimize-images.mjs [--dry-run]
// Shrinks the PNG and JPEG files under public/img and public/cover in place: same path and format, so the /img/... URLs
// stored in content keep working. A file over MAX_IMAGE_WIDTH or OPTIMIZE_OVER_BYTES (scripts/lib/raster-images.mjs) is
// turned upright by its EXIF orientation, resized to that width and re-encoded (PNG as a 256-colour palette, JPEG with
// mozjpeg), and written back only when that saves at least 10%. A palette PNG within the width limit is left alone at
// any size: quantizing it again only loses colours. An animated PNG is left alone (re-encoding keeps one frame). So a
// second run writes nothing: a JPEG it wrote saves well under 10% when re-encoded again (measured: 0.8%). A file still
// over MAX_IMAGE_WIDTH or MAX_IMAGE_BYTES afterwards is reported with "over" and the exit code is 1:
// raster-images.test.mjs fails until it is fixed by hand (a smaller crop, or a photo moved to JPEG under a new URL).
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { listRasterImages, MAX_IMAGE_BYTES, MAX_IMAGE_WIDTH, OPTIMIZE_OVER_BYTES, RASTER_DIRS, rasterSize } from "./lib/raster-images.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
// IHDR colour type 3 (byte 25) is an indexed-colour PNG
const isPalettePng = (buf) => buf.length > 25 && buf.readUInt32BE(0) === 0x89504e47 && buf[25] === 3;
// An APNG has an acTL chunk before its first IDAT
const isAnimatedPng = (buf) => {
	const actl = buf.indexOf("acTL");
	return buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 && actl !== -1 && actl < buf.indexOf("IDAT");
};
const kb = (n) => `${Math.round(n / 1024)} KB`;
let before = 0;
let after = 0;
let rewritten = 0;
let over = 0;
for (const dir of RASTER_DIRS) {
	for (const path of await listRasterImages(join(root, dir))) {
		const file = relative(root, path);
		const input = await readFile(path);
		const size = rasterSize(input);
		let result = input;
		if (isAnimatedPng(input)) {
			console.log(`skip     ${kb(input.length)} (animated PNG) ${file}`);
		} else if (!(size && size.width <= MAX_IMAGE_WIDTH && (input.length <= OPTIMIZE_OVER_BYTES || isPalettePng(input)))) {
			const pipeline = sharp(input).rotate().resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true });
			const output = await (extname(file).toLowerCase() === ".png"
				? pipeline.png({ palette: true, quality: 85, compressionLevel: 9, effort: 10 })
				: pipeline.jpeg({ quality: 82, mozjpeg: true })
			).toBuffer();
			if (output.length > input.length * 0.9) {
				console.log(`skip     ${kb(input.length)} (re-encoded ${kb(output.length)}) ${file}`);
			} else {
				const out = rasterSize(output);
				console.log(`${dryRun ? "would" : "wrote"}    ${kb(input.length)} -> ${kb(output.length)}  ${size?.width}x${size?.height} -> ${out?.width}x${out?.height}  ${file}`);
				before += input.length;
				after += output.length;
				rewritten++;
				result = output;
				if (!dryRun) await writeFile(path, output);
			}
		}
		const final = rasterSize(result);
		if (!final || final.width > MAX_IMAGE_WIDTH || result.length > MAX_IMAGE_BYTES) {
			console.log(`over     ${kb(result.length)} ${final ? `${final.width}x${final.height}` : "unreadable header"}  ${file}`);
			over++;
		}
	}
}
console.log(`${dryRun ? "would rewrite" : "rewrote"} ${rewritten} files: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
if (over) {
	console.log(`${over} files still over ${MAX_IMAGE_WIDTH} px or ${MAX_IMAGE_BYTES / 1024} KB: shrink them by hand`);
	process.exitCode = 1;
}
