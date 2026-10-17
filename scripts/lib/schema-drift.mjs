// Schema drift (spec 2026-10-17 §3.3): fields of a live collection that the pinned tables in
// packages/web9-blocks/lib/entry-guard.mjs do not cover. The save and publish check adds live portableText and image
// fields by itself (schema:read), but image values inside a `blocks` field's block types are only guarded through
// BLOCK_IMAGE_FIELDS, so `migrate verify` reports each one missing, in every version (stored blocks keep their version).
import { BLOCK_IMAGE_FIELDS, IMAGE_FIELDS, PT_FIELDS } from "../../packages/web9-blocks/lib/entry-guard.mjs";

const own = (table, key) => (table && Object.hasOwn(table, key) ? table[key] : undefined);
const list = (v) => (Array.isArray(v) ? v : []);

/** Image paths among a block type version's fields: "image", and "features[].image" for an image in a repeater. */
function imagePaths(fields) {
	return list(fields).flatMap((f) => {
		if (f?.type === "image") return [f.slug];
		if (f?.type === "repeater") return list(f.validation?.subFields).filter((s) => s?.type === "image").map((s) => `${f.slug}[].${s.slug}`);
		return [];
	});
}

/** @param collection MCP schema_get_collection output. @returns `schema drift: …` messages, empty when the tables cover it. */
export function schemaDrift(collection) {
	const c = collection?.slug;
	const out = [];
	for (const field of list(collection?.fields)) {
		if (typeof field?.slug !== "string") continue;
		if (field.type === "portableText" && !own(PT_FIELDS, c)?.includes(field.slug)) out.push(`schema drift: ${c}.${field.slug} is a portableText field missing from PT_FIELDS`);
		if (field.type === "image" && !own(IMAGE_FIELDS, c)?.includes(field.slug)) out.push(`schema drift: ${c}.${field.slug} is an image field missing from IMAGE_FIELDS`);
		if (field.type !== "blocks") continue;
		for (const type of list(field.blockTypes)) {
			for (const version of list(type?.versions)) {
				const pinned = own(own(own(BLOCK_IMAGE_FIELDS, c), field.slug), type.slug) ?? [];
				for (const path of imagePaths(version?.fields)) {
					if (!pinned.includes(path)) out.push(`schema drift: ${c}.${field.slug} ${type.slug} v${version.version} has image path "${path}" missing from BLOCK_IMAGE_FIELDS`);
				}
			}
		}
	}
	return out;
}
