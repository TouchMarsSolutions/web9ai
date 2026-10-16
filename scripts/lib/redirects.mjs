// Old Docusaurus URLs -> new URLs (spec §7), kept in EmDash's redirect table. There is no MCP tool for
// redirects; the REST API needs an admin token (redirects:manage), which the migration runner has.
// The EmDash middleware matches exact sources first, then [param] patterns; it skips paths with a file
// extension, so the feeds are redirected in astro.config.mjs instead.
//
// Fail closed, like the entries (scripts/lib/sync.mjs): a rule of the group that exists and differs from the
// migration (another destination or type, or disabled) is something an admin changed, so syncRedirects stops
// with [WOULD_OVERWRITE] unless `overwrite` is set. Rules outside the group are never read or touched.

export const GROUP = "legacy-docusaurus";

/** Docusaurus' generated-index slug for a category label ("Use Case" -> "use-case"). */
const labelSlug = (label) => label.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

/** Every rule as { source, destination, type: 301, groupName }. Throws on inconsistent input. */
export function legacyRedirects(tree) {
	const en = tree.docs.filter((d) => d.locale === "en");
	const rules = [];
	const add = (source, destination) => rules.push({ source, destination, type: 301, groupName: GROUP });
	for (const doc of en) {
		add(doc.oldUrl, doc.newUrl);
		// Docusaurus served every en doc under /zh-CN too (translated or falling back to en); the new
		// site does the same at /zh-CN/docs/<slug>.
		add(`/zh-CN${doc.oldUrl}`, `/zh-CN${doc.newUrl}`);
	}
	for (const zh of tree.docs.filter((d) => d.locale === "zh-CN")) {
		const original = en.find((d) => d.rel === zh.rel);
		if (zh.oldUrl !== `/zh-CN${original?.oldUrl}`) throw new Error(`${zh.file}: zh-CN URL ${zh.oldUrl} is not /zh-CN + the en URL`);
	}
	for (const prefix of ["", "/zh-CN"]) {
		for (const exact of ["/blog", "/blog/archive", "/blog/tags"]) add(`${prefix}${exact}`, "/posts");
		add(`${prefix}/blog/tags/[tag]`, "/tag/[tag]");
		add(`${prefix}/blog/[slug]`, "/posts/[slug]");
	}
	// Generated category index pages. The three sidebars share one slugger, so the aiSidebar copies
	// probably got a -1 suffix; a rule for a URL that never existed costs nothing.
	for (const [dir, { label }] of Object.entries(tree.categories)) {
		const first = en.filter((d) => d.category === dir).sort((a, b) => a.sortOrder - b.sortOrder)[0];
		if (!first) throw new Error(`category ${dir} has no en docs`);
		for (const suffix of ["", "-1"]) add(`/category/${labelSlug(label)}${suffix}`, first.newUrl);
	}
	add("/pages/home", "/");

	const seen = new Set();
	for (const r of rules) {
		if (seen.has(r.source)) throw new Error(`duplicate redirect source ${r.source}`);
		if (r.source === r.destination) throw new Error(`redirect loop ${r.source}`);
		seen.add(r.source);
	}
	return rules;
}

/** How a stored rule differs from the wanted one ("disabled, /old -> /new, type 302 -> 301"), or null when it is as wanted. */
function difference(current, rule) {
	if (current.destination === rule.destination && current.type === rule.type && current.enabled !== false) return null;
	return [current.enabled === false && "disabled", `${current.destination} -> ${rule.destination}`, current.type !== rule.type && `type ${current.type} -> ${rule.type}`].filter(Boolean).join(", ");
}

/**
 * Make the group's rules match `rules`. `request(method, path, body?)` returns the JSON `data` of an
 * EmDash API call and throws on errors. Missing rules are created. A rule that exists and differs is only
 * replaced with `overwrite`; without it the whole sync stops with [WOULD_OVERWRITE] before anything is
 * written (a dry run lists such rules as "updated" instead). Rules in the group that are not wanted are
 * reported, never deleted. Returns [{ name, action: "created" | "updated" | "unchanged" | "extra", diff? }].
 */
export async function syncRedirects(request, rules, { dryRun = false, overwrite = false } = {}) {
	const have = new Map();
	let cursor;
	do {
		const page = await request("GET", `/_emdash/api/redirects?group=${GROUP}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
		for (const r of page.items) have.set(r.source, r);
		cursor = page.nextCursor;
	} while (cursor);

	const plan = rules.map((rule) => {
		const current = have.get(rule.source);
		have.delete(rule.source);
		return { rule, current, diff: current ? difference(current, rule) : null };
	});
	const changed = plan.filter((p) => p.diff);
	if (changed.length && !dryRun && !overwrite) {
		const [first] = changed;
		const more = changed.length > 1 ? ` (${changed.length - 1} more rule${changed.length > 2 ? "s" : ""} differ, a dry run lists them)` : "";
		throw new Error(`[WOULD_OVERWRITE] redirect ${first.rule.source}: ${first.diff}; the rule differs from the migration (changed in the admin?), re-run with --overwrite to replace it${more}`);
	}

	const results = [];
	for (const { rule, current, diff } of plan) {
		if (current && !diff) {
			results.push({ name: rule.source, action: "unchanged" });
			continue;
		}
		if (!dryRun) {
			if (current) await request("PUT", `/_emdash/api/redirects/${current.id}`, { destination: rule.destination, type: rule.type, enabled: true, groupName: GROUP });
			else await request("POST", "/_emdash/api/redirects", rule);
		}
		results.push({ name: rule.source, action: current ? "updated" : "created", ...(current ? { diff } : {}) });
	}
	for (const extra of have.values()) results.push({ name: extra.source, action: "extra", diff: `-> ${extra.destination}; not in the table, left in place` });
	return results;
}
