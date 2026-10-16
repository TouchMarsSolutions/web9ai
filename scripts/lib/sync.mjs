// Idempotent writes for the migration runner (spec §7). Everything goes through an injected
// callTool(name, args) (scripts/lib/mcp.mjs in real runs, a fake in tests).
// Measured MCP behaviour this relies on (plan 2 Global Constraints): content_get takes a slug or ULID
// plus locale and throws when nothing matches; content_update always writes a draft, so a published
// entry needs content_publish afterwards; publishing clears draftRevisionId; translationOf takes the
// en entry's ULID. On ENTRY_LOCKED the runner stops: it never passes overrideLock.

/** JSON with object keys sorted, for comparing stored and wanted values. */
export function canonical(value) {
	return JSON.stringify(value, (_, v) =>
		v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
	);
}

/** Path of the first difference between two JSON values, for the runner's log ("body[3].asset.url"). */
export function firstDifference(a, b, at = "") {
	if (canonical(a) === canonical(b)) return null;
	if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
		const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
		for (const k of keys) {
			const d = firstDifference(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : at ? `${at}.${k}` : k);
			if (d) return d;
		}
	}
	return `${at || "(value)"}: stored ${JSON.stringify(a)?.slice(0, 80)} / wanted ${JSON.stringify(b)?.slice(0, 80)}`;
}

// The real tool says "content_get: [NOT_FOUND] Content item not found: <slug>". A transport-level
// "MCP HTTP 404: Not Found" (wrong URL) is not a missing entry and must stop the run.
const isNotFound = (e) => {
	const message = e?.message ?? "";
	return !/^MCP HTTP/.test(message) && /\bNOT_FOUND\b|Content item not found/i.test(message);
};

async function getEntry(callTool, collection, slug, locale) {
	try {
		return await callTool("content_get", { collection, id: slug, locale });
	} catch (e) {
		if (isNotFound(e)) return null;
		throw e;
	}
}

async function write(callTool, name, args) {
	try {
		return await callTool(name, args);
	} catch (e) {
		if (/ENTRY_LOCKED/.test(e.message)) throw new Error(`${args.collection}/${args.id}: someone is editing this entry (ENTRY_LOCKED); stop and retry later, never override the lock`);
		throw e;
	}
}

/**
 * Make one entry look like `want` = { collection, slug, locale, status: "published" | "draft", data,
 * translationOf?, translationGroup?, taxonomies?, publishedAt? }. Only the keys in want.data are compared
 * (search_text and other generated fields are left alone). translationOf (the en ULID) is used on create;
 * translationGroup (the en entry's) checks an existing translation is linked. Returns { action: "created"
 * | "updated" | "published" | "unchanged", id, translationGroup, diff? }; with dryRun nothing is written
 * and id is null for a would-be create.
 */
export async function upsertEntry(callTool, want, { dryRun = false } = {}) {
	const { collection, slug, locale, status, data } = want;
	const found = await getEntry(callTool, collection, slug, locale);
	if (!found) {
		if (dryRun) return { action: "created", id: null };
		const created = await write(callTool, "content_create", {
			collection,
			slug,
			locale,
			status,
			data,
			...(want.translationOf ? { translationOf: want.translationOf } : {}),
			...(want.taxonomies ? { taxonomies: want.taxonomies } : {}),
			...(want.publishedAt ? { publishedAt: want.publishedAt } : {}),
		});
		const createdItem = created.item ?? created;
		return { action: "created", id: createdItem.id, translationGroup: createdItem.translationGroup };
	}
	const { item } = found;
	if (want.translationGroup && item.translationGroup && item.translationGroup !== want.translationGroup) {
		throw new Error(`${collection}/${slug} (${locale}) is not linked to its en original; delete it and run again`);
	}
	const stored = Object.fromEntries(Object.keys(data).map((k) => [k, item.data?.[k]]));
	const diff = firstDifference(stored, data);
	const pendingDraft = item.draftRevisionId != null;
	const result = { id: item.id, translationGroup: item.translationGroup };
	if (!diff && item.status === status && !(status === "published" && pendingDraft)) return { action: "unchanged", ...result };
	if (dryRun) return { action: diff ? "updated" : "published", ...result, diff };
	let rev = found._rev;
	if (diff) {
		const updated = await write(callTool, "content_update", {
			collection,
			id: item.id,
			locale,
			data,
			_rev: rev,
			...(want.taxonomies ? { taxonomies: want.taxonomies } : {}),
		});
		rev = updated._rev;
	}
	if (status === "published") await write(callTool, "content_publish", { collection, id: item.id, _rev: rev, ...(want.publishedAt ? { publishedAt: want.publishedAt } : {}) });
	return { action: diff ? "updated" : "published", ...result, diff };
}

/** Comparable form of a menu item, from either menu_get output or menu_set_items input. */
const menuItem = (i) => ({ label: i.label, url: i.customUrl ?? i.url ?? "", target: i.target || "" });

/** Replace the menu's items when they differ. Returns { action: "updated" | "unchanged" }. */
export async function upsertMenu(callTool, name, items, { dryRun = false } = {}) {
	const current = await callTool("menu_get", { name });
	const have = (current.items ?? current.menu?.items ?? []).map(menuItem);
	if (canonical(have) === canonical(items.map(menuItem))) return { action: "unchanged" };
	if (!dryRun) await callTool("menu_set_items", { name, items });
	return { action: "updated", diff: firstDifference(have, items.map(menuItem)) };
}
