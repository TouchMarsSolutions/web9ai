// Intrinsic sizes of the images served from public/img and public/cover, keyed by URL, for the content image renderers
// (src/components/ContentImage.astro for Portable Text images, packages/web9-blocks/lib/markdown.mjs for images in
// Markdown fields): an <img> with width and height keeps its box while it loads, so the page does not shift under the
// reader. A key is the file's path as is; no file name needs percent-encoding (image-sizes.test.mjs checks), so it is
// also the URL content stores. Workers have no file system, so the sizes are a committed file,
// packages/web9-blocks/lib/image-sizes.json, written by scripts/optimize-images.mjs and scripts/image-sizes.mjs;
// image-sizes.test.mjs fails while it differs from what imageSizes() reads from public/.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import sharp from "sharp";
import { RASTER_DIRS } from "./raster-images.mjs";

export const IMAGE_SIZES_FILE = "packages/web9-blocks/lib/image-sizes.json";
const EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);

// A length the browser takes as CSS px: a plain number or one in px (em and % depend on where the SVG is drawn)
const pxLength = (value) => {
	const m = /^\s*(\d+(?:\.\d+)?|\.\d+)(?:px)?\s*$/i.exec(value ?? "");
	return m ? Number(m[1]) : null;
};

/**
 * The size an <img> gives an SVG, from its root element: `{ width, height }` when both attributes are px lengths;
 * `{ width, height, fill: true }` from the viewBox when the root has neither attribute (the browser then fills the
 * line with the viewBox's ratio, so the renderer sets width: 100%); otherwise null (em, %, one attribute only, a width
 * or height in the root's style, which the browser also honours, or no usable viewBox: the size depends on more than
 * these rules read). Numbers are rounded, as width and height on an <img> are integers. Comments are skipped, so an
 * `<svg` inside one is not taken for the root.
 */
export function svgSize(text) {
	const root = /<svg\b[^>]*>/i.exec(text.replace(/<!--[\s\S]*?-->/g, ""))?.[0];
	if (!root) return null;
	const attr = (name) => {
		const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(root);
		return m ? (m[1] ?? m[2]) : undefined;
	};
	if (/(?:^|;)\s*(?:width|height)\s*:/i.test(attr("style") ?? "")) return null;
	const width = attr("width");
	const height = attr("height");
	if (width !== undefined || height !== undefined) {
		const w = pxLength(width);
		const h = pxLength(height);
		return w && h ? { width: Math.round(w), height: Math.round(h) } : null;
	}
	const box = (attr("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
	if (box.length !== 4 || !box.every(Number.isFinite) || !(box[2] > 0 && box[3] > 0)) return null;
	const w = Math.round(box[2]);
	const h = Math.round(box[3]);
	return w && h ? { width: w, height: h, fill: true } : null;
}

/** A PNG's or JPEG's size as the browser shows it: turned upright by its EXIF orientation. Null if unreadable. */
export async function rasterDisplaySize(buf) {
	try {
		const meta = await sharp(buf).metadata();
		const { width, height } = meta.autoOrient ?? meta;
		return width && height ? { width, height } : null;
	} catch {
		return null;
	}
}

/** URL -> size (or null when it cannot be told) for every PNG, JPEG and SVG under RASTER_DIRS, sorted by URL. */
export async function imageSizes(root) {
	const sizes = {};
	for (const dir of RASTER_DIRS) {
		const entries = await readdir(join(root, dir), { recursive: true, withFileTypes: true });
		for (const e of entries) {
			const ext = extname(e.name).toLowerCase();
			if (!e.isFile() || !EXTENSIONS.has(ext)) continue;
			const path = join(e.parentPath, e.name);
			const url = `/${relative(join(root, "public"), path).split(sep).join("/")}`;
			sizes[url] = ext === ".svg" ? svgSize(await readFile(path, "utf8")) : await rasterDisplaySize(await readFile(path));
		}
	}
	return Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** One entry per line, so a new or resized image is a one-line diff. */
export function formatImageSizes(sizes) {
	const lines = Object.entries(sizes).map(([url, size]) => `\t${JSON.stringify(url)}: ${JSON.stringify(size)}`);
	return `{\n${lines.join(",\n")}\n}\n`;
}

/** Writes IMAGE_SIZES_FILE from public/; returns the number of entries and whether the file changed. */
export async function writeImageSizes(root) {
	const sizes = await imageSizes(root);
	const text = formatImageSizes(sizes);
	const file = join(root, IMAGE_SIZES_FILE);
	const old = await readFile(file, "utf8").catch(() => "");
	if (old !== text) await writeFile(file, text);
	return { entries: Object.keys(sizes).length, changed: old !== text };
}
