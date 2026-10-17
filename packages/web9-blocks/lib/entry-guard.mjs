// The check of one entry (spec §10; spec 2026-10-17 §3.2, §3.3): its Portable Text, image and block-image fields
// (pt-guard.mjs) and the length limits (limits.mjs). content:beforeSave, the publish hooks (index.mjs) and
// scripts/guard-scan.mjs all call entryProblems, so a value is judged the same wherever it is checked. Nothing here
// imports emdash, so guard-scan runs it in plain node.
import { DATA_LIMITS, LIMITS, lengthProblem } from "./limits.mjs";
import { guardBlockImages, guardImageValue, guardPortableText } from "./pt-guard.mjs";

/** Portable Text fields per collection: all are guarded on every save; the first one feeds search_text. Pinned to the seed. */
export const PT_FIELDS = { docs: ["body"], posts: ["content"], pages: ["content"] };

/** `image` fields per collection: guarded on every save (colour and blurhash values reach style and a decoder). */
export const IMAGE_FIELDS = { posts: ["featured_image"] };

/**
 * `blocks` fields per collection, and in each the paths of the `image` values inside a block type (the same
 * colour and blurhash values, rendered by <Image> in the hero and feature_grid components). Pinned to the seed;
 * `migrate verify` reports a live block type with an image path missing here (scripts/lib/schema-drift.mjs).
 */
export const BLOCK_IMAGE_FIELDS = { pages: { layout: { hero: ["image"], feature_grid: ["features[].image"] } } };

/** @typedef {{ pt: string[], image: string[], blocks: Array<[string, Record<string, string[]>]> }} EntryFields */

const own = (table, key) => (Object.hasOwn(table, key) ? table[key] : undefined);

/** The pinned fields of `collection`, as fresh arrays. @returns {EntryFields} */
export function staticFields(collection) {
	return {
		pt: [...(own(PT_FIELDS, collection) ?? [])],
		image: [...(own(IMAGE_FIELDS, collection) ?? [])],
		blocks: Object.entries(own(BLOCK_IMAGE_FIELDS, collection) ?? {}),
	};
}

/**
 * Adds the live schema's `portableText` and `image` fields to `fields` (`schemaFields`: [{ slug, type }] from the
 * plugin's ctx.schema or MCP schema_get_collection) and returns it. The pinned fields stay: a field the schema no
 * longer lists is still guarded.
 */
export function mergeLiveFields(fields, schemaFields) {
	for (const field of Array.isArray(schemaFields) ? schemaFields : []) {
		if (typeof field?.slug !== "string") continue;
		const list = field.type === "portableText" ? fields.pt : field.type === "image" ? fields.image : null;
		if (list && !list.includes(field.slug)) list.push(field.slug);
	}
	return fields;
}

/**
 * The fields to guard in `collection`: the pinned ones plus the live schema's, read through `schema` (the plugin's
 * ctx.schema, present with the schema:read capability). Without it, or when the read fails, the pinned ones alone.
 * @returns {Promise<EntryFields>}
 */
export async function fieldsFor(collection, schema) {
	const fields = staticFields(collection);
	if (typeof schema?.getCollection !== "function") return fields;
	try {
		return mergeLiveFields(fields, (await schema.getCollection(collection))?.fields);
	} catch (error) {
		console.warn(`[web9-blocks] reading the ${collection} schema failed; guarding the pinned fields only`, error);
		return fields;
	}
}

/**
 * Problems of one entry, each prefixed with its field (`body: #0 htmlBlock: ...`, `title: at most 200 characters
 * (got 201)`); empty means OK. `data` may be partial (an update passes only the changed fields); anything but an
 * object counts as empty (core rejects it). `slug`, when a string, is held to LIMITS.slug.
 * @param {unknown} data @param {EntryFields} fields @param {{ slug?: unknown }} [options]
 */
export function entryProblems(data, fields, { slug } = {}) {
	const value = (field) => (data !== null && typeof data === "object" && Object.hasOwn(data, field) ? data[field] : undefined);
	const prefixed = (field, problems) => problems.map((p) => `${field}: ${p}`);
	return [
		...fields.pt.flatMap((f) => prefixed(f, guardPortableText(value(f)))),
		...fields.image.flatMap((f) => prefixed(f, guardImageValue(value(f)))),
		...fields.blocks.flatMap(([f, paths]) => prefixed(f, guardBlockImages(value(f), paths))),
		...Object.entries(DATA_LIMITS).map(([f, max]) => lengthProblem(f, value(f), max)),
		lengthProblem("slug", slug, LIMITS.slug),
	].filter(Boolean);
}
