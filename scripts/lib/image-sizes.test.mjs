import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { formatImageSizes, IMAGE_SIZES_FILE, imageSizes, rasterDisplaySize, svgSize } from "./image-sizes.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

describe("svgSize", () => {
	it("takes width and height in px or without a unit", () => {
		expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="173" height="44" viewBox="0 0 173 44">')).toEqual({ width: 173, height: 44 });
		expect(svgSize("<?xml version='1.0'?>\n<!-- logo -->\n<svg width='800px' height='800px' viewBox='0 0 192 192'>")).toEqual({ width: 800, height: 800 });
		expect(svgSize('<svg\n  height="88.4"\n  width="95.6">')).toEqual({ width: 96, height: 88 });
	});
	it("fills the line from the viewBox when the root has neither width nor height", () => {
		expect(svgSize('<svg viewBox="0 0 800 1100" stroke-width="2">')).toEqual({ width: 800, height: 1100, fill: true });
		expect(svgSize('<svg viewBox="0,0,512,428.862">')).toEqual({ width: 512, height: 429, fill: true });
	});
	it("gives up where the size depends on more than the file", () => {
		expect(svgSize('<svg width="1em" height="1em" viewBox="0 0 24 24">')).toBeNull();
		expect(svgSize('<svg width="100%" viewBox="0 0 1024 1024">')).toBeNull();
		expect(svgSize('<svg height="150" viewBox="0 0 1024 1024">')).toBeNull();
		expect(svgSize("<svg>")).toBeNull();
		expect(svgSize('<svg viewBox="0 0 0 10">')).toBeNull();
		expect(svgSize('<svg viewBox="0 0 10">')).toBeNull();
		expect(svgSize("<html></html>")).toBeNull();
	});
	it("gives up on a root whose style sets a width or a height (the browser draws it at that size)", () => {
		expect(svgSize('<svg viewBox="0 0 24 24" style="width:36px;height:36px">')).toBeNull();
		expect(svgSize('<svg width="24" height="24" style="fill: red; Height: 2em">')).toBeNull();
		expect(svgSize('<svg viewBox="0 0 24 24" style="fill:red;stroke-width:2">')).toEqual({ width: 24, height: 24, fill: true });
	});
	it("skips comments when looking for the root", () => {
		expect(svgSize('<!-- <svg width="1" height="1"> --><svg viewBox="0 0 800 400">')).toEqual({ width: 800, height: 400, fill: true });
	});
	it("takes px in any case", () => {
		expect(svgSize('<svg width="800PX" height="600Px">')).toEqual({ width: 800, height: 600 });
	});
	it("reads the root's own attributes, not stroke-width or a child's", () => {
		expect(svgSize('<svg stroke-width="3" line-height="9" viewBox="0 0 10 20"><rect width="5" height="5"/></svg>')).toEqual({ width: 10, height: 20, fill: true });
	});
});

describe("rasterDisplaySize", () => {
	it("turns a JPEG upright by its EXIF orientation, as the browser shows it", async () => {
		const jpeg = await sharp({ create: { width: 40, height: 10, channels: 3, background: "#fff" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
		expect(await rasterDisplaySize(jpeg)).toEqual({ width: 10, height: 40 });
	});
	it("is null for a file it cannot read", async () => {
		expect(await rasterDisplaySize(Buffer.from("not an image"))).toBeNull();
	});
});

describe("image-sizes.json", () => {
	it("is what optimize-images.mjs writes from public/img and public/cover (else run `node scripts/image-sizes.mjs`)", async () => {
		expect(readFileSync(`${root}/${IMAGE_SIZES_FILE}`, "utf8")).toBe(formatImageSizes(await imageSizes(root)));
	});
	it("is keyed by paths that need no percent-encoding, so a key is the URL content stores", () => {
		for (const url of Object.keys(JSON.parse(readFileSync(`${root}/${IMAGE_SIZES_FILE}`, "utf8")))) expect(encodeURI(url), url).toBe(url);
	});
	it("gives every PNG and JPEG a size", async () => {
		const sizes = await imageSizes(root);
		const rasters = Object.entries(sizes).filter(([url]) => /\.(png|jpe?g)$/i.test(url));
		expect(rasters.length).toBeGreaterThan(60);
		for (const [url, size] of rasters) expect(size, url).toEqual({ width: expect.any(Number), height: expect.any(Number) });
	});
});
