import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { listRasterImages, MAX_IMAGE_BYTES, MAX_IMAGE_WIDTH, RASTER_DIRS, rasterSize } from "./raster-images.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const blank = (width, height) => sharp({ create: { width, height, channels: 3, background: "#7f7f7f" } });

describe("rasterSize", () => {
	it("reads PNG and JPEG (baseline and progressive) headers", async () => {
		expect(rasterSize(await blank(37, 21).png().toBuffer())).toEqual({ width: 37, height: 21 });
		expect(rasterSize(await blank(37, 21).png({ palette: true }).toBuffer())).toEqual({ width: 37, height: 21 });
		expect(rasterSize(await blank(1601, 300).jpeg().toBuffer())).toEqual({ width: 1601, height: 300 });
		expect(rasterSize(await blank(300, 1601).jpeg({ progressive: true, mozjpeg: true }).toBuffer())).toEqual({ width: 300, height: 1601 });
	});
	it("returns null for other formats and for truncated or broken headers", async () => {
		const jpeg = await blank(8, 8).jpeg().toBuffer();
		expect(rasterSize(await blank(8, 8).gif().toBuffer())).toBeNull();
		expect(rasterSize(Buffer.from("not an image"))).toBeNull();
		expect(rasterSize((await blank(8, 8).png().toBuffer()).subarray(0, 20))).toBeNull();
		expect(rasterSize(jpeg.subarray(0, 12))).toBeNull();
		const broken = Buffer.from(jpeg);
		broken[2] = 0; // the first segment no longer starts with 0xFF
		expect(rasterSize(broken)).toBeNull();
	});
});

describe("images under public/", () => {
	// Fails on an image added without running `node scripts/optimize-images.mjs`, or one it cannot shrink enough
	it(`are PNG or JPEG files at most ${MAX_IMAGE_WIDTH} px wide and ${MAX_IMAGE_BYTES / 1024} KB`, async () => {
		const problems = [];
		let count = 0;
		for (const dir of RASTER_DIRS) {
			for (const file of await listRasterImages(`${root}${dir}`)) {
				count++;
				const buf = await readFile(file);
				const size = rasterSize(buf);
				const name = file.slice(root.length);
				if (!size) problems.push(`${name}: not a PNG or JPEG`);
				else if (size.width > MAX_IMAGE_WIDTH) problems.push(`${name}: ${size.width} px wide`);
				if (buf.length > MAX_IMAGE_BYTES) problems.push(`${name}: ${Math.round(buf.length / 1024)} KB`);
			}
		}
		expect(count).toBeGreaterThan(0);
		expect(problems).toEqual([]);
	});
});

describe("public/_headers", () => {
	// The adapter adds `/_astro/* Cache-Control: public, max-age=31536000, immutable` to this file at build time,
	// but skips it when any rule here already sets Cache-Control on a path under /_astro (@astrojs/cloudflare
	// dist/utils/headers.js). Same pattern syntax: `*` matches anything, `:name` one path segment.
	it("sets no Cache-Control on /_astro/, so the build keeps its immutable rule for hashed assets", async () => {
		const text = await readFile(`${root}public/_headers`, "utf8");
		const toRegex = (pattern) =>
			new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/:[A-Za-z]\w*/g, "[^/]+")}$`);
		const rules = [];
		for (const line of text.split("\n")) {
			if (!line.trim() || line.trim().startsWith("#")) continue;
			if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: [] });
			else rules.at(-1).headers.push(line.trim());
		}
		expect(rules.map((r) => r.pattern)).toEqual(["/img/*", "/cover/*"]);
		for (const { pattern, headers } of rules) {
			expect(headers, pattern).toEqual(["Cache-Control: public, max-age=86400, stale-while-revalidate=604800"]);
			expect(toRegex(pattern).test("/_astro/probe"), pattern).toBe(false);
		}
	});
});
