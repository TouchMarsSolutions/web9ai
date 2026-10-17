// The text of the pages.layout blocks as Hero.astro and FeatureGrid.astro print it (seed blockTypes). Core types these
// fields on write (a string or text block field is z.string(), emdash schema/zod-generator.ts) and the save check caps
// their length (entry-guard.mjs BLOCK_TEXT_FIELDS), but a block renders from storage, on / and /zh-CN/: a stored value
// that is not a string renders as "" instead of throwing in String() and taking the home page down.
import { text } from "../../web9-blocks/lib/text.mjs";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** An image value as stored, handed to core's <Image> (EmDashImage.astro). @typedef {import("emdash").ImageValue} ImageValue */

/**
 * A hero block's title and tagline, its image only when it is an object, and that image's alt ("" when not a string).
 * @returns {{ title: string, tagline: string, image: ImageValue | undefined, alt: string }}
 */
export function heroText(block) {
	const image = isObject(block?.image) ? block.image : undefined;
	return { title: text(block?.title), tagline: text(block?.tagline), image, alt: text(image?.alt) };
}

/**
 * A feature_grid block's title and its object features: title and description as strings, the image only when it is an
 * object, and the alt to print (the image's own alt when it is a string, "" included, otherwise the feature's title).
 * @returns {{ title: string, features: Array<{ title: string, description: string, image: ImageValue | undefined, alt: string }> }}
 */
export function featureGridItems(block) {
	const list = Array.isArray(block?.features) ? block.features : [];
	return {
		title: text(block?.title),
		features: list.filter(isObject).map((f) => {
			const image = isObject(f.image) ? f.image : undefined;
			const title = text(f.title);
			return { title, description: text(f.description), image, alt: typeof image?.alt === "string" ? image.alt : title };
		}),
	};
}
