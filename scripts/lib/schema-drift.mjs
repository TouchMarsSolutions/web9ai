// Schema drift (spec 2026-10-17 §3.3): fields of a live collection that the pinned tables in
// packages/web9-blocks/lib/entry-guard.mjs do not cover. The save and publish check adds live portableText and image
// fields by itself (schema:read), but image values inside a `blocks` field's block types are only guarded through
// BLOCK_IMAGE_FIELDS, so `migrate verify` reports each one missing, in every version (stored blocks keep their version).
// The same holds for their text values (a string, text or url field, an image's alt), capped through BLOCK_TEXT_FIELDS.
// A blocks field whose block types cannot be read (no blockTypes array, a type without a slug and a versions array, a
// version without a fields array) throws: read as "no image paths", it would report no drift for what it never saw.
import { BLOCK_IMAGE_FIELDS, BLOCK_TEXT_FIELDS, IMAGE_FIELDS, PT_FIELDS } from "../../packages/web9-blocks/lib/entry-guard.mjs";

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

const TEXT_TYPES = ["string", "text", "url"];

/** Text paths among a block type version's fields: "title", "features[].title", and "image.alt" for each image path. */
function textPaths(fields) {
	const at = (prefix, f) => (TEXT_TYPES.includes(f?.type) ? [prefix + f.slug] : f?.type === "image" ? [`${prefix}${f.slug}.alt`] : []);
	return list(fields).flatMap((f) => (f?.type === "repeater" ? list(f.validation?.subFields).flatMap((s) => at(`${f.slug}[].`, s)) : at("", f)));
}

/** Each version of each block type of a blocks field, as [type slug, version]; throws on a shape it cannot read. */
function blockVersions(c, field) {
	const where = `schema_get_collection: ${c}.${field.slug}`;
	if (!Array.isArray(field.blockTypes)) throw new Error(`${where} is a blocks field without a blockTypes array`);
	return field.blockTypes.flatMap((type) => {
		if (typeof type?.slug !== "string" || !Array.isArray(type.versions)) throw new Error(`${where} has a block type without a slug and a versions array`);
		return type.versions.map((version) => {
			if (!Array.isArray(version?.fields)) throw new Error(`${where} ${type.slug} has a version without a fields array`);
			return [type.slug, version];
		});
	});
}

/**
 * @param collection MCP schema_get_collection output. @returns `schema drift: …` messages, empty when the tables cover it.
 * Throws on a blocks field it cannot read (blockVersions).
 */
export function schemaDrift(collection) {
	const c = collection?.slug;
	const out = [];
	for (const field of list(collection?.fields)) {
		if (typeof field?.slug !== "string") continue;
		if (field.type === "portableText" && !own(PT_FIELDS, c)?.includes(field.slug)) out.push(`schema drift: ${c}.${field.slug} is a portableText field missing from PT_FIELDS`);
		if (field.type === "image" && !own(IMAGE_FIELDS, c)?.includes(field.slug)) out.push(`schema drift: ${c}.${field.slug} is an image field missing from IMAGE_FIELDS`);
		if (field.type !== "blocks") continue;
		for (const [type, version] of blockVersions(c, field)) {
			const pinned = own(own(own(BLOCK_IMAGE_FIELDS, c), field.slug), type) ?? [];
			for (const path of imagePaths(version.fields)) {
				if (!pinned.includes(path)) out.push(`schema drift: ${c}.${field.slug} ${type} v${version.version} has image path "${path}" missing from BLOCK_IMAGE_FIELDS`);
			}
			const capped = own(own(own(BLOCK_TEXT_FIELDS, c), field.slug), type) ?? {};
			for (const path of textPaths(version.fields)) {
				if (!Object.hasOwn(capped, path)) out.push(`schema drift: ${c}.${field.slug} ${type} v${version.version} has text path "${path}" missing from BLOCK_TEXT_FIELDS`);
			}
		}
	}
	return out;
}
