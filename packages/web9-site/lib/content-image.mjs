// Which Portable Text image blocks ContentImage.astro renders itself, with the image's width and height
// (image-sizes.json, scripts/lib/image-sizes.mjs), so the page keeps the image's box while it loads. Core's Image
// renders the rest: it takes width and height only from the block, and with both set it sends a local image through
// astro:assets, which changes its URL. Only the plain shape the migration stores is taken here: an asset URL that
// names a file under public/img or public/cover, plus alt, title and caption. A link, an alignment, a provider, stored
// dimensions or a placeholder go to core, which knows how to render them.

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const optionalString = (value) => value === undefined || typeof value === "string";
// Block fields this renderer does not handle; with any of them set, core renders the block
const CORE_FIELDS = ["link", "alignment", "width", "height", "displayWidth", "displayHeight", "blurhash", "dominantColor"];
const CORE_ASSET_FIELDS = ["provider", "meta", "src", "width", "height"];

/**
 * `{ src, width, height, fill, alt, title, caption }` for a block this renderer takes, else null. `alt` follows core
 * (the block's, else the asset's, else ""); `title` and `caption` are passed as stored, as core does. `fill` marks an
 * SVG that has only a viewBox: the browser draws it as wide as the line, so it keeps width: 100%.
 */
export function staticImage(node, sizes) {
	if (!isRecord(node) || !isRecord(node.asset)) return null;
	const { asset } = node;
	if (typeof asset.url !== "string" || !Object.hasOwn(sizes, asset.url)) return null;
	const size = sizes[asset.url];
	if (!isRecord(size) || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width <= 0 || size.height <= 0) {
		return null;
	}
	if (CORE_FIELDS.some((k) => node[k] !== undefined) || CORE_ASSET_FIELDS.some((k) => asset[k] !== undefined)) return null;
	if (![node.alt, node.title, node.caption, asset.alt].every(optionalString)) return null;
	return {
		src: asset.url,
		width: size.width,
		height: size.height,
		fill: size.fill === true,
		alt: node.alt || asset.alt || "",
		title: node.title,
		caption: node.caption,
	};
}
