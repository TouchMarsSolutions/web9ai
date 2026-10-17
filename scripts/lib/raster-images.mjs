// Size limits for the raster images served from public/ (spec §9 "图片"), shared by scripts/optimize-images.mjs and its
// guard test. Doc images show at most ~900 CSS px wide (DocsPage's 1200 px grid minus the sidebar), so 1600 px stays
// sharp on a 2x screen. Only PNG and JPEG are checked; there is no height limit (a tall screenshot is bounded by bytes).
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

export const MAX_IMAGE_WIDTH = 1600;
// optimize-images re-encodes anything bigger; the guard test fails above MAX_IMAGE_BYTES (a palette PNG of a photo
// can stay above the first, and the format cannot change without changing the URL)
export const OPTIMIZE_OVER_BYTES = 300 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const RASTER_DIRS = ["public/img", "public/cover"];
const RASTER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

/** Every PNG and JPEG under `dir`, recursively, as paths joined onto `dir`. */
export async function listRasterImages(dir) {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true });
	return entries
		.filter((e) => e.isFile() && RASTER_EXTENSIONS.has(extname(e.name).toLowerCase()))
		.map((e) => join(e.parentPath, e.name))
		.sort();
}

/**
 * Width and height from a PNG or JPEG header, without decoding the image. Returns null for anything else, or for a
 * file whose header it cannot read.
 */
export function rasterSize(buf) {
	// PNG: 8-byte signature, then the IHDR chunk with width and height as big-endian uint32 at 16 and 20
	if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString("latin1", 12, 16) === "IHDR") {
		return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	}
	// JPEG: walk the marker segments to the first start-of-frame (SOF0–SOF15, except DHT C4, JPG C8, DAC CC)
	if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
		let i = 2;
		while (i + 9 < buf.length) {
			if (buf[i] !== 0xff) return null;
			const marker = buf[i + 1];
			if (marker === 0xff) {
				i++;
				continue;
			}
			// TEM and RST0-RST7 stand alone, with no length field
			if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				i += 2;
				continue;
			}
			const length = buf.readUInt16BE(i + 2);
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
			}
			i += 2 + length;
		}
	}
	return null;
}
