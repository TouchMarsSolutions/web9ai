// Idempotent writes for the migration runner (spec §7). Everything goes through an injected
// callTool(name, args) (scripts/lib/mcp.mjs in real runs, a fake in tests).
// Measured MCP behaviour this relies on (plan 2 Global Constraints): content_get takes a slug or ULID
// plus locale and throws when nothing matches; content_update always writes a draft, so a published
// entry needs content_publish afterwards; publishing clears draftRevisionId; translationOf takes the
// en entry's ULID. On ENTRY_LOCKED the runner stops: it never passes overrideLock.
//
// Fail closed (plan 2 Task 9 review): a re-run in production must not undo what editors or AI agents did
// since the migration. content_get returns a pending draft's data in place of the live data (liveData then
// holds the live version), and every save of a revisions collection stages a draft, in any status. So
// "stored" below is the draft when draftRevisionId is set. The rules, for an entry that exists:
//   - draftRevisionId set and the draft differs from want -> [PENDING_DRAFT], always (a human resolves it in
//     the admin), whatever the status, with or without overwrite, in a dry run too
//   - stored equals want and nothing needs publishing      -> unchanged
//   - want is published and the entry has a draft equal to want (an interrupted overwrite) -> publish it
//   - want is published and the entry is a draft           -> [STATUS_MISMATCH] (an admin unpublished it, or a
//     person drafted it), unless it is a crashed create's leftover, see isCreateLeftover
//   - want is a draft but the entry is not                 -> [STATUS_MISMATCH] (the runner never unpublishes)
//   - otherwise it differs from want                       -> [WOULD_OVERWRITE] unless `overwrite` (a dry run reports it)

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
 * The row a crashed create leaves behind. The MCP content_create with status "published" creates a draft and
 * then publishes it (mcp/server.ts), so a crash in between leaves a draft that was never published and never
 * saved. An entry unpublished in the admin differs: unpublish keeps published_at, drops the live revision and
 * stages a draft copy, and every later save stages a draft too. All four fields must say "never touched";
 * a doubtful row fails closed ([STATUS_MISMATCH]) and a person publishes or deletes it. (A create that passes
 * publishedAt, as the posts step will, sets published_at on the draft and is not recognised here.)
 */
const isCreateLeftover = (item) =>
	item.status === "draft" && item.liveRevisionId == null && item.draftRevisionId == null && item.publishedAt == null;

/**
 * Make one entry look like `want` = { collection, slug, locale, status: "published" | "draft", data,
 * translationOf?, translationGroup?, taxonomies?, publishedAt? }. Only the keys in want.data are compared
 * (search_text and other generated fields are left alone; taxonomies and publishedAt are only sent on create
 * and update, not compared). translationOf (the en ULID) is used on create; translationGroup (the en entry's)
 * checks an existing translation is linked. Returns { action: "created" | "updated" | "published" |
 * "unchanged", id, translationGroup, diff? }; with dryRun nothing is written and id is null for a would-be
 * create. An existing entry that differs is only replaced with `overwrite` (see the rules at the top).
 */
export async function upsertEntry(callTool, want, { dryRun = false, overwrite = false } = {}) {
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
	const where = `${collection}/${slug} (${locale})`;
	if (want.translationGroup && item.translationGroup && item.translationGroup !== want.translationGroup) {
		throw new Error(`${where} is not linked to its en original; delete it and run again`);
	}
	const stored = Object.fromEntries(Object.keys(data).map((k) => [k, item.data?.[k]]));
	const diff = firstDifference(stored, data);
	const pendingDraft = item.draftRevisionId != null;
	const result = { id: item.id, translationGroup: item.translationGroup };
	if (pendingDraft && diff) {
		throw new Error(`[PENDING_DRAFT] ${where}: ${diff}; this entry has an unpublished draft that differs from the migration, publish or discard it in the admin (the runner never overwrites a draft)`);
	}
	// The only status change the runner makes is to published, and only for an entry that was never touched.
	const wantsLive = status === "published";
	if ((!wantsLive && item.status !== status) || (wantsLive && item.status !== "published" && !isCreateLeftover(item))) {
		throw new Error(`[STATUS_MISMATCH] ${where}: the migration wants status ${status} but the entry is ${item.status}${item.status === "draft" ? " (unpublished or drafted by a person)" : ""}; the runner never changes that, fix it in the admin`);
	}
	const needsPublish = wantsLive && (item.status !== "published" || pendingDraft);
	if (!diff) {
		if (!needsPublish) return { action: "unchanged", ...result };
		// A draft equal to want (left by an interrupted overwrite), or a crashed create's leftover.
		if (dryRun) return { action: "published", ...result };
		await write(callTool, "content_publish", { collection, id: item.id, _rev: found._rev, ...(want.publishedAt ? { publishedAt: want.publishedAt } : {}) });
		return { action: "published", ...result };
	}
	if (dryRun) return { action: "updated", ...result, diff };
	if (!overwrite) throw new Error(`[WOULD_OVERWRITE] ${where}: ${diff}; the entry differs from the migration, re-run with --overwrite to replace it`);
	const updated = await write(callTool, "content_update", {
		collection,
		id: item.id,
		locale,
		data,
		_rev: found._rev,
		...(want.taxonomies ? { taxonomies: want.taxonomies } : {}),
	});
	if (status === "published") await write(callTool, "content_publish", { collection, id: item.id, _rev: updated._rev, ...(want.publishedAt ? { publishedAt: want.publishedAt } : {}) });
	return { action: "updated", ...result, diff };
}

/** Comparable form of a menu item, from either menu_get output or menu_set_items input. */
const menuItem = (i) => ({ label: i.label, url: i.customUrl ?? i.url ?? "", target: i.target || "" });

/**
 * Replace the menu's items when they differ. Returns { action: "updated" | "unchanged", diff? }. Like entries,
 * a menu that differs is only replaced with `overwrite` ([WOULD_OVERWRITE] otherwise); a dry run reports it.
 */
export async function upsertMenu(callTool, name, items, { dryRun = false, overwrite = false } = {}) {
	const current = await callTool("menu_get", { name });
	const have = (current.items ?? current.menu?.items ?? []).map(menuItem);
	const want = items.map(menuItem);
	if (canonical(have) === canonical(want)) return { action: "unchanged" };
	const diff = firstDifference(have, want);
	if (dryRun) return { action: "updated", diff };
	if (!overwrite) throw new Error(`[WOULD_OVERWRITE] menu/${name}: ${diff}; the menu differs from the migration, re-run with --overwrite to replace it`);
	await callTool("menu_set_items", { name, items });
	return { action: "updated", diff };
}
