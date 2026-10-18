import { describe, expect, it } from "vitest";
import { staticImage } from "./content-image.mjs";
import SIZES from "./image-sizes.json" with { type: "json" };

const sizes = { "/img/a.png": { width: 1600, height: 900 }, "/img/p.svg": { width: 800, height: 1100, fill: true }, "/img/em.svg": null };
const block = (asset, rest = {}) => ({ _type: "image", _key: "k1", asset: { _ref: "", ...asset }, alt: "A", ...rest });

describe("staticImage", () => {
	it("gives a migrated /img block its size and keeps alt, title and caption as stored", () => {
		expect(staticImage(block({ url: "/img/a.png" }, { title: "T", caption: "C" }), sizes)).toEqual({
			src: "/img/a.png",
			width: 1600,
			height: 900,
			fill: false,
			alt: "A",
			title: "T",
			caption: "C",
		});
		expect(staticImage(block({ url: "/img/p.svg" }), sizes)).toMatchObject({ width: 800, height: 1100, fill: true });
	});
	it("takes alt as core does: the block's, else the asset's, else empty", () => {
		expect(staticImage(block({ url: "/img/a.png", alt: "B" }, { alt: "" }), sizes).alt).toBe("B");
		expect(staticImage(block({ url: "/img/a.png" }, { alt: undefined }), sizes).alt).toBe("");
	});
	it("leaves a URL with no known size to core: elsewhere, unlisted, unsized, or another spelling", () => {
		for (const url of ["https://i0.wp.com/x.png?ssl=1", "/img/b.png", "/img/em.svg", "/img/a.png?v=2", "/img//a.png", "img/a.png", "/_emdash/api/media/file/x.png"]) {
			expect(staticImage(block({ url }), sizes), url).toBeNull();
		}
	});
	it("reads the table's own keys only", () => {
		for (const url of ["__proto__", "constructor", "toString", "hasOwnProperty"]) expect(staticImage(block({ url }), sizes), url).toBeNull();
		expect(staticImage(block({ url: "/img/x.png" }), Object.create({ "/img/x.png": { width: 1, height: 1 } }))).toBeNull();
	});
	it("leaves to core every block field it does not render", () => {
		for (const rest of [{ link: "https://x.y" }, { link: { href: "#a" } }, { alignment: "center" }, { width: 10 }, { height: 10 }, { displayWidth: 10 }, { displayHeight: 5 }, { blurhash: "x" }, { dominantColor: "#fff" }]) {
			expect(staticImage(block({ url: "/img/a.png" }, rest), sizes), JSON.stringify(rest)).toBeNull();
		}
		for (const asset of [{ provider: "local" }, { meta: {} }, { src: "/img/a.png" }, { width: 1 }, { height: 1 }]) {
			expect(staticImage(block({ url: "/img/a.png", ...asset }), sizes), JSON.stringify(asset)).toBeNull();
		}
	});
	it("leaves malformed blocks and sizes to core", () => {
		for (const node of [null, undefined, "x", [], {}, { asset: null }, { asset: "x" }, block({ url: 5 }), block({}), block({ url: "/img/a.png" }, { alt: 5 }), block({ url: "/img/a.png" }, { title: {} }), block({ url: "/img/a.png" }, { caption: ["c"] }), block({ url: "/img/a.png", alt: 1 })]) {
			expect(staticImage(node, sizes), JSON.stringify(node)).toBeNull();
		}
		for (const size of [{ width: 0, height: 5 }, { width: 1.5, height: 5 }, { width: "5", height: 5 }, { width: 5 }, [5, 5], "5x5"]) {
			expect(staticImage(block({ url: "/img/a.png" }), { "/img/a.png": size }), JSON.stringify(size)).toBeNull();
		}
	});
	it("knows the doc images the migration stored", () => {
		expect(staticImage(block({ url: "/img/dev/23/en/23_01_var_py.png" }), SIZES)).toMatchObject({ width: 1600, height: 1161 });
		expect(staticImage(block({ url: "/img/event/20250314_poster6.svg" }), SIZES)).toMatchObject({ width: 800, height: 1100, fill: true });
	});
});
