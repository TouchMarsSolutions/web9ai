// The guard's blurhash check against the decoder the site renders with (core's Image.astro, Gallery.astro and
// EmDashImage.astro call @unpic/placeholder's blurhashToImageCssString, which runs blurhash's decode). The guard does
// not decode: it makes the decoder's own structural test. These tests fail when an upgrade changes when the decoder
// throws. Its own file because vi.mock wraps the decoder for every test in the file.
import { readdirSync, readFileSync } from "node:fs";
import { blurhashToImageCssString } from "@unpic/placeholder";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardBlockImages, guardImageValue, guardPortableText } from "./pt-guard.mjs";

vi.mock("@unpic/placeholder", async (importOriginal) => {
	const real = await importOriginal();
	return { ...real, blurhashToImageCssString: vi.fn(real.blurhashToImageCssString) };
});

const BASE83 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
const HASH = "LEHV6nWB2yk8pyo0adR*.7kCMdnj";
// 9×9 components (first character "|", 80): the largest and slowest hash to decode, 166 characters
const HASH_9X9 = `|${"0".repeat(165)}`;
// The oracle calls the real decoder, not the mock, so the mock records only what the guard calls
const { blurhashToImageCssString: decode } = await vi.importActual("@unpic/placeholder");
const decodes = (s) => {
	try {
		decode(s);
		return true;
	} catch {
		return false;
	}
};
const accepted = (s) => guardImageValue({ id: "x", blurhash: s }).length === 0;

describe("the decoder the site renders with", () => {
	it("is @unpic/placeholder 0.1.2 on blurhash 2.0.5, one copy each (none nested under emdash)", () => {
		const version = (p) => JSON.parse(readFileSync(new URL(`../../../node_modules/${p}/package.json`, import.meta.url), "utf8")).version;
		expect(version("@unpic/placeholder")).toBe("0.1.2");
		expect(version("blurhash")).toBe("2.0.5");
		for (const nested of ["emdash/node_modules/@unpic", "emdash/node_modules/blurhash", "@unpic/placeholder/node_modules/blurhash"]) {
			expect(() => readdirSync(new URL(`../../../node_modules/${nested}`, import.meta.url)), nested).toThrow();
		}
	});
});

describe("guard blurhash check", () => {
	beforeEach(() => {
		blurhashToImageCssString.mockClear();
	});
	it("accepts exactly the strings the decoder renders without throwing", () => {
		// Every first character the alphabet has, and some it lacks, at every length up to two past the 9×9 maximum, with
		// body characters inside and outside the alphabet (the decoder reads an unknown one as -1 and does not throw)
		const heads = [...BASE83, "!", " ", '"', "<", "é", "\ud800", "😀", "\0"];
		const fills = ["0", "~", "!", "é", "😀"];
		let checked = 0;
		const disagree = [];
		for (const head of heads) {
			for (const fill of fills) {
				for (let length = 0; length <= 168; length++) {
					const s = (head + fill.repeat(length)).slice(0, length);
					if (accepted(s) !== decodes(s)) disagree.push(s);
					checked++;
				}
			}
		}
		expect(checked).toBeGreaterThan(70000);
		expect(disagree).toEqual([]);
	});
	it("accepts real hashes and rejects the ones that throw", () => {
		for (const s of [HASH, HASH_9X9, "000000", "0!!!!!"]) expect([s, accepted(s), decodes(s)]).toEqual([s, true, true]);
		for (const s of ["", "x", "00000", "0000000", "!00000", HASH.slice(1)]) expect([s, accepted(s), decodes(s)]).toEqual([s, false, false]);
		for (const v of [5, ["000000"], { toString: () => "000000" }]) expect(accepted(v)).toBe(false);
	});
	it("never runs the decoder: not for PT images and galleries, image fields or block images", () => {
		const image = { blurhash: HASH_9X9, asset: { meta: { blurhash: HASH_9X9 } } };
		expect(guardPortableText([{ _type: "image", _key: "i", ...image }, { _type: "gallery", _key: "g", images: [image, image] }])).toEqual([]);
		expect(guardImageValue({ id: "x", ...image, meta: { blurhash: HASH }, darkVariant: { id: "y", blurhash: HASH } })).toEqual([]);
		expect(guardBlockImages([{ _type: "hero", _key: "h", image: { id: "", ...image } }], { hero: ["image"] })).toEqual([]);
		expect(blurhashToImageCssString).not.toHaveBeenCalled();
	});
});
