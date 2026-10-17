import { readFileSync } from "node:fs";
import { isScheduledPolicyRejection } from "emdash";
import { describe, expect, it, vi } from "vitest";
import { localizeHref } from "../web9-site/lib/nav.mjs";
import {
	BLOCK_IMAGE_FIELDS,
	BLOCK_TEXT_FIELDS,
	HOME_ALTERNATES,
	IMAGE_FIELDS,
	PT_FIELDS,
	PUBLISH_REJECTED,
	beforePublish,
	beforeSave,
	cancelDecision,
	createPlugin,
	pageMetadata,
} from "./index.mjs";

const seed = JSON.parse(readFileSync(new URL("../../seed/seed.json", import.meta.url), "utf8"));
const callout = { _type: "callout", _key: "c1", tone: "tip", title: "T", body: "probe-word" };

describe("content:beforeSave", () => {
	it("guards every portableText field the seed defines", () => {
		const fromSeed = Object.fromEntries(
			seed.collections
				.map((c) => [c.slug, c.fields.filter((f) => f.type === "portableText").map((f) => f.slug)])
				.filter(([, fields]) => fields.length),
		);
		expect(PT_FIELDS).toEqual(fromSeed);
	});
	it("mirrors web9 block text into search_text for docs, posts and pages", async () => {
		expect((await beforeSave({ collection: "docs", content: { body: [callout] } })).search_text).toBe("T\nprobe-word");
		expect((await beforeSave({ collection: "posts", content: { content: [callout] } })).search_text).toBe("T\nprobe-word");
		expect((await beforeSave({ collection: "pages", content: { content: [callout] } })).search_text).toBe("T\nprobe-word");
	});
	it("leaves saves without the body field, and unknown collections, alone", async () => {
		const c = { title: "x" };
		expect(await beforeSave({ collection: "posts", content: c })).toBe(c);
		const other = { body: [{ _type: "htmlBlock" }] };
		expect(await beforeSave({ collection: "other", content: other })).toBe(other);
	});
	it("rejects a Portable Text field that is not an array, and passes an empty one", async () => {
		await expect(beforeSave({ collection: "docs", content: { body: "<b>x</b>" } })).rejects.toMatchObject({
			name: "ContentSaveRejectedError",
			message: 'Save rejected (spec §10): body: value "<b>x</b>" is not allowed: a Portable Text field must be an array of blocks',
		});
		await expect(beforeSave({ collection: "posts", content: { content: { _type: "block" } } })).rejects.toMatchObject({ name: "ContentSaveRejectedError" });
		for (const empty of [null, [], ""]) expect((await beforeSave({ collection: "docs", content: { body: empty } })).search_text).toBe("");
	});
	it("rejects a save with a message the editor sees", async () => {
		await expect(
			beforeSave({ collection: "docs", content: { body: [{ _type: "htmlBlock", _key: "h", html: "<b>x</b>" }] } }),
		).rejects.toMatchObject({ name: "ContentSaveRejectedError", message: expect.stringContaining("body: #0 htmlBlock") });
	});
	it("pins IMAGE_FIELDS to the image fields the seed defines", () => {
		const fromSeed = Object.fromEntries(
			seed.collections
				.map((c) => [c.slug, c.fields.filter((f) => f.type === "image").map((f) => f.slug)])
				.filter(([, fields]) => fields.length),
		);
		expect(IMAGE_FIELDS).toEqual(fromSeed);
		expect(IMAGE_FIELDS).toEqual({ posts: ["featured_image"] });
	});
	it("pins BLOCK_IMAGE_FIELDS to the image values inside the seed's block types", () => {
		const types = new Map(seed.blockTypes.map((t) => [t.slug, t]));
		const paths = (type) => {
			const current = type.versions.find((v) => v.version === type.currentVersion);
			return current.fields.flatMap((f) => {
				if (f.type === "image") return [f.slug];
				if (f.type === "repeater") return (f.validation?.subFields ?? []).filter((sub) => sub.type === "image").map((sub) => `${f.slug}[].${sub.slug}`);
				return [];
			});
		};
		const fromSeed = Object.fromEntries(
			seed.collections
				.map((c) => [
					c.slug,
					Object.fromEntries(
						c.fields
							.filter((f) => f.type === "blocks")
							.map((f) => [f.slug, Object.fromEntries(f.validation.allowedTypes.map((t) => [t, paths(types.get(t))]).filter(([, list]) => list.length))]),
					),
				])
				.filter(([, fields]) => Object.keys(fields).length),
		);
		expect(BLOCK_IMAGE_FIELDS).toEqual(fromSeed);
		expect(BLOCK_IMAGE_FIELDS).toEqual({ pages: { layout: { hero: ["image"], feature_grid: ["features[].image"] } } });
	});
	it("pins BLOCK_TEXT_FIELDS to the string, text and url values and image alts inside the seed's block types", () => {
		const types = new Map(seed.blockTypes.map((t) => [t.slug, t]));
		const at = (prefix, f) => (["string", "text", "url"].includes(f.type) ? [prefix + f.slug] : f.type === "image" ? [`${prefix}${f.slug}.alt`] : []);
		const paths = (type) =>
			type.versions
				.find((v) => v.version === type.currentVersion)
				.fields.flatMap((f) => (f.type === "repeater" ? (f.validation?.subFields ?? []).flatMap((sub) => at(`${f.slug}[].`, sub)) : at("", f)));
		for (const c of seed.collections) {
			for (const f of c.fields.filter((f) => f.type === "blocks")) {
				for (const t of f.validation.allowedTypes) expect(Object.keys(BLOCK_TEXT_FIELDS[c.slug][f.slug][t]).sort(), `${c.slug}.${f.slug} ${t}`).toEqual(paths(types.get(t)).sort());
			}
		}
		expect(Object.keys(BLOCK_TEXT_FIELDS)).toEqual(["pages"]);
	});
	const img = (over = {}) => ({ id: "", provider: "external", src: "/img/ai.svg", mimeType: "image/svg+xml", alt: "AI", ...over });
	const layout = (heroImage, ...featureImages) => [
		{ _type: "hero", _version: 1, _key: "home-hero", title: "Web9.AI", image: heroImage },
		{ _type: "feature_grid", _version: 1, _key: "home-features", features: featureImages.map((image, k) => ({ title: `F${k}`, image })) },
	];
	it("rejects a pages.layout image whose dominantColor is pasted into style", async () => {
		const evil = "red;position:fixed;inset:0;z-index:99999";
		const save = (content) => beforeSave({ collection: "pages", content });
		await expect(save({ title: "Home", layout: layout(img({ dominantColor: evil }), img()) })).rejects.toMatchObject({
			name: "ContentSaveRejectedError",
			message: `Save rejected (spec §10): layout: #0 hero image.dominantColor: value "${evil}" is not allowed`,
		});
		await expect(save({ layout: layout(img(), img(), img({ darkVariant: img({ dominantColor: evil }) })) })).rejects.toMatchObject({
			message: `Save rejected (spec §10): layout: #1 feature_grid features[1].image.darkVariant.dominantColor: value "${evil}" is not allowed`,
		});
		await expect(save({ layout: layout(img({ blurhash: "x" })) })).rejects.toMatchObject({
			message: expect.stringContaining('layout: #0 hero image.blurhash: value "x" is not allowed'),
		});
		await expect(save({ layout: layout(img({ meta: { storageKey: { toString: 1 } } })) })).rejects.toMatchObject({
			message: expect.stringContaining('layout: #0 hero image.meta.storageKey: value {"toString":1} is not allowed'),
		});
	});
	it("rejects pages.layout text that is not a string or is over its cap", async () => {
		const save = (content) => beforeSave({ collection: "pages", content });
		const home = layout(img(), img());
		home[0].title = JSON.parse('{"toString":1}');
		await expect(save({ layout: home })).rejects.toMatchObject({
			name: "ContentSaveRejectedError",
			message: 'Save rejected (spec §10): layout: #0 hero title: value {"toString":1} is not allowed',
		});
		const long = layout(img(), img());
		long[1].features[0].description = "d".repeat(1001);
		await expect(save({ layout: long })).rejects.toMatchObject({
			message: "Save rejected (spec §10): layout: #1 feature_grid features[0].description: at most 1000 characters (got 1001)",
		});
	});
	it("accepts the home page layout and saves without a layout, and guards layout and body together", async () => {
		const clean = { title: "Web9.AI", layout: layout(img(), img(), img(), img()) };
		expect(await beforeSave({ collection: "pages", content: clean })).toEqual(clean);
		const noLayout = { title: "x" };
		expect(await beforeSave({ collection: "pages", content: noLayout })).toBe(noLayout);
		await expect(
			beforeSave({ collection: "pages", content: { layout: layout(img({ blurhash: "x" })), content: [{ _type: "htmlBlock", _key: "h" }] } }),
		).rejects.toMatchObject({ message: expect.stringMatching(/content: #0 htmlBlock.*layout: #0 hero image\.blurhash/) });
		// docs and posts have no blocks field: a layout key there is not looked at
		const other = { title: "x", layout: layout(img({ dominantColor: "a b" })) };
		expect(await beforeSave({ collection: "docs", content: other })).toEqual(other);
	});
	it("does not throw on a layout core's normalizeBlocksData would reject afterwards", async () => {
		for (const bad of [null, "x", 5, {}, [null], [5], [{}], [{ _type: "constructor" }], [{ _type: "__proto__", image: img({ dominantColor: "a b" }) }]]) {
			const content = { title: "x", layout: bad };
			expect(await beforeSave({ collection: "pages", content })).toEqual(content);
		}
	});
	it("rejects an image field whose dominantColor is pasted into style", async () => {
		const featured_image = { id: "x", provider: "external", src: "https://example.com/a.png", dominantColor: "red;position:fixed;inset:0;z-index:99999" };
		await expect(beforeSave({ collection: "posts", content: { title: "x", featured_image } })).rejects.toMatchObject({
			name: "ContentSaveRejectedError",
			message: expect.stringContaining('featured_image: dominantColor: value "red;position:fixed;inset:0;z-index:99999" is not allowed'),
		});
	});
	it("rejects a bad darkVariant colour and a blurhash that does not decode", async () => {
		const save = (featured_image) => beforeSave({ collection: "posts", content: { featured_image } });
		await expect(save({ id: "x", darkVariant: { id: "y", dominantColor: "red;position:fixed" } })).rejects.toMatchObject({
			message: expect.stringContaining("featured_image: darkVariant.dominantColor"),
		});
		await expect(save({ id: "x", blurhash: "x" })).rejects.toMatchObject({ message: expect.stringContaining('featured_image: blurhash: value "x"') });
	});
	it("accepts a clean image field and an empty one, and guards image and body together", async () => {
		const clean = { id: "x", provider: "external", src: "https://example.com/a.png", dominantColor: "#aabbcc", blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" };
		expect((await beforeSave({ collection: "posts", content: { featured_image: clean } })).featured_image).toBe(clean);
		const empty = { title: "x", featured_image: null };
		expect(await beforeSave({ collection: "posts", content: empty })).toBe(empty);
		await expect(
			beforeSave({ collection: "posts", content: { featured_image: { id: "x", blurhash: "x" }, content: [{ _type: "htmlBlock", _key: "h" }] } }),
		).rejects.toMatchObject({ message: expect.stringMatching(/content: #0 htmlBlock.*featured_image: blurhash/) });
	});
	it("rejects inline objects in block children on save", async () => {
		const content = [{ _type: "block", _key: "p", children: [{ _type: "iframe", _key: "f", src: "https://evil.example" }] }];
		await expect(beforeSave({ collection: "posts", content: { content } })).rejects.toMatchObject({
			message: expect.stringContaining("content: #0 block children[0] iframe"),
		});
	});
	it("answers a deeply nested value with a rejection, never an exception", async () => {
		const deep = (n) => {
			let v = "x";
			for (let i = 0; i < n; i++) v = [v];
			return v;
		};
		const rejected = { name: "ContentSaveRejectedError", message: expect.stringContaining("meta.storageKey: value [unprintable array] is not allowed") };
		await expect(beforeSave({ collection: "posts", content: { featured_image: { id: "x", meta: { storageKey: deep(20000) } } } })).rejects.toMatchObject(rejected);
		const hero = { _type: "hero", _version: 1, _key: "h", title: "T", image: { id: "", src: "/img/ai.svg", meta: { storageKey: deep(20000) } } };
		await expect(beforeSave({ collection: "pages", content: { title: "Home", layout: [hero] } })).rejects.toMatchObject(rejected);
		// a printed text field must be a string, so a deep callout body is rejected (it used to throw at render)
		await expect(beforeSave({ collection: "docs", content: { body: [{ _type: "callout", _key: "c", body: deep(50000) }] } })).rejects.toMatchObject({
			name: "ContentSaveRejectedError",
			message: "Save rejected (spec §10): body: #0 callout body: value [unprintable array] is not allowed",
		});
		// a field no renderer prints passes the guard and is still walked for search_text without overflowing
		const saved = await beforeSave({ collection: "docs", content: { body: [{ _type: "callout", _key: "c", note: deep(50000) }] } });
		expect(saved.search_text).toBe("x");
	});
	it("drops a caller-sent search_text from saves without the body field", async () => {
		const saved = await beforeSave({ collection: "docs", content: { title: "x", search_text: "spam" } });
		expect(saved).toEqual({ title: "x" });
		expect(await beforeSave({ collection: "posts", content: { title: "x", search_text: "spam" } })).toEqual({ title: "x" });
		const unknown = { title: "x", search_text: "kept" };
		expect(await beforeSave({ collection: "other", content: unknown })).toBe(unknown);
	});
	it("replaces a caller-sent search_text when the body is saved", async () => {
		const saved = await beforeSave({ collection: "docs", content: { body: [callout], search_text: "spam" } });
		expect(saved.search_text).toBe("T\nprobe-word");
	});
	it("rejects an over-long title, description or excerpt in any collection (spec 2026-10-17 §3.1)", async () => {
		await expect(beforeSave({ collection: "docs", content: { title: "t".repeat(201) } })).rejects.toMatchObject({
			name: "ContentSaveRejectedError",
			message: "Save rejected (spec §10): title: at most 200 characters (got 201)",
		});
		await expect(beforeSave({ collection: "docs", content: { description: "d".repeat(1001) } })).rejects.toMatchObject({
			message: expect.stringContaining("description: at most 1000 characters (got 1001)"),
		});
		await expect(beforeSave({ collection: "posts", content: { excerpt: "e".repeat(1001) } })).rejects.toMatchObject({ message: expect.stringContaining("excerpt: at most 1000") });
		await expect(beforeSave({ collection: "other", content: { title: "t".repeat(201) } })).rejects.toMatchObject({ name: "ContentSaveRejectedError" });
		const ok = { title: "t".repeat(200), description: "d".repeat(1000), search_text: "kept" };
		expect(await beforeSave({ collection: "other", content: ok })).toBe(ok);
	});
	it("guards the live schema's portableText and image fields too (ctx.schema, schema:read)", async () => {
		const schema = { getCollection: async (slug) => ({ slug, fields: [{ slug: "summary", type: "portableText" }, { slug: "cover", type: "image" }] }) };
		await expect(beforeSave({ collection: "docs", content: { summary: [{ _type: "htmlBlock" }] } }, { schema })).rejects.toMatchObject({
			message: expect.stringContaining("summary: #0 htmlBlock"),
		});
		await expect(beforeSave({ collection: "products", content: { cover: { dominantColor: "red;position:fixed" } } }, { schema })).rejects.toMatchObject({
			message: expect.stringContaining("cover: dominantColor"),
		});
		// search_text still comes from the pinned field only: a collection without one keeps its content as it is
		const products = { summary: [] };
		expect(await beforeSave({ collection: "products", content: products }, { schema })).toBe(products);
	});
	it("falls back to the pinned fields when the schema read fails", async () => {
		const schema = { getCollection: async () => { throw new Error("db down"); } };
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await expect(beforeSave({ collection: "docs", content: { body: [{ _type: "htmlBlock" }] } }, { schema })).rejects.toMatchObject({
				message: expect.stringContaining("body: #0 htmlBlock"),
			});
			expect((await beforeSave({ collection: "docs", content: { body: [callout] } }, { schema })).search_text).toBe("T\nprobe-word");
			expect(warn).toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});
	it("declares schema:read (ctx.schema exists only with it) besides content:write", () => {
		expect(createPlugin().capabilities).toEqual(expect.arrayContaining(["content:write", "schema:read"]));
	});
});

describe("content:beforePublish / content:beforeSchedule (spec 2026-10-17 §3.2)", () => {
	const entry = (data, slug = "ok") => ({ collection: "docs", content: { id: "x", slug, data } });
	const CHECK_FAILED = `${PUBLISH_REJECTED}the content check failed`;
	// What core stores for a rejected scheduled publish (plugins/content-policy.ts): the reason must pass its own check
	const scheduled = (decision) => isScheduledPolicyRejection({ collection: "docs", id: "x", pluginId: "web9-blocks", rejectedAt: new Date().toISOString(), reason: decision.reason });
	it("prefixes every reason with the publish prefix", () => {
		expect(PUBLISH_REJECTED).toBe("Publish rejected (spec §10): ");
	});
	it("allows an entry the save check passes", async () => {
		expect(await beforePublish(entry({ title: "T", body: [callout] }))).toBeUndefined();
		expect(await beforePublish({ collection: "docs", content: { id: "x", slug: null } })).toBeUndefined();
	});
	it("cancels a draft the save check rejects, and a staged slug over the limit", async () => {
		const html = await beforePublish(entry({ body: [{ _type: "htmlBlock", _key: "h" }] }));
		expect(html).toEqual({ cancel: true, reason: `${PUBLISH_REJECTED}body: #0 htmlBlock: raw HTML blocks are not allowed; use Markdown or a Web9 block` });
		const slug = await beforePublish(entry({ title: "T" }, "s".repeat(101)));
		expect(slug).toEqual({ cancel: true, reason: `${PUBLISH_REJECTED}slug: at most 100 characters (got 101)` });
		for (const d of [html, slug]) expect(scheduled(d)).toBe(true);
	});
	it("guards the live schema's fields through ctx.schema", async () => {
		const schema = { getCollection: async () => ({ fields: [{ slug: "summary", type: "portableText" }] }) };
		const d = await beforePublish({ collection: "docs", content: { id: "x", data: { summary: [{ _type: "iframe" }] } } }, { schema });
		expect(d.reason).toContain("summary: #0 iframe");
	});
	it("answers only with a decision core accepts: two keys, at most 500 code points, no control characters", async () => {
		const many = Array.from({ length: 60 }, (_, k) => ({ _type: "htmlBlock", _key: `h${k}` }));
		const d = await beforePublish(entry({ body: many }));
		expect(Object.keys(d)).toEqual(["cancel", "reason"]);
		expect(Array.from(d.reason).length).toBeLessThanOrEqual(500);
		expect(d.reason.endsWith("…")).toBe(true);
		expect(cancelDecision("a\u0007b\tc\nd\u007f")).toEqual({ cancel: true, reason: "a b\tc\nd" });
		expect(Array.from(cancelDecision("😀".repeat(600)).reason)).toHaveLength(500);
		expect(cancelDecision(" \u0001 ")).toEqual({ cancel: true, reason: CHECK_FAILED });
		// core's own check accepts each of them as the stored reason of a rejected schedule
		for (const decision of [d, cancelDecision("a\u0007b\tc\nd\u007f"), cancelDecision("😀".repeat(600)), cancelDecision(" \u0001 "), cancelDecision(`${"x".repeat(499)}\u0000 `)]) {
			expect(scheduled(decision), decision.reason.slice(0, 20)).toBe(true);
		}
	});
	it("cancels instead of throwing when the check itself fails (a throw would leave a scheduled entry scheduled)", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const ctx = { get schema() { throw new Error("boom"); } };
			const failed = await beforePublish(entry({ title: "T" }), ctx);
			expect(failed).toEqual({ cancel: true, reason: CHECK_FAILED });
			expect(scheduled(failed)).toBe(true);
			expect(await beforePublish(undefined)).toBeUndefined();
			expect(error).toHaveBeenCalledOnce();
		} finally {
			error.mockRestore();
		}
	});
	it("is registered for publish and schedule, with the content-policy capability", () => {
		const plugin = createPlugin();
		expect(plugin.hooks["content:beforePublish"]).toMatchObject({ handler: beforePublish });
		expect(plugin.hooks["content:beforeSchedule"]).toMatchObject({ handler: beforePublish });
		// definePlugin normalizes: content:write adds the implied content:read (plugins/types.ts PLUGIN_CAPABILITY_IMPLICATIONS)
		expect(plugin.capabilities).toEqual(expect.arrayContaining(["content:write", "schema:read", "hooks.content-policy:register"]));
	});
});

// Core builds hreflang alternates from the collection's urlPattern (/pages/{slug}), which for the home page is a
// redirect (and /zh-CN/pages/home is a 302 to the English one). Plugin links win the dedupe (page/metadata.ts).
describe("page:metadata", () => {
	const SITE = "https://www.web9.ai";
	const event = (content, siteUrl = SITE) => ({ page: { url: `${SITE}/`, path: "/", locale: "en", kind: content ? "content" : "custom", pageType: "website", title: "x", description: null, canonical: null, image: null, content, siteUrl } });
	const home = { collection: "pages", id: "01HOME", slug: "home" };
	const link = (hreflang, path) => ({ kind: "link", rel: "alternate", hreflang, href: `${SITE}${path}` });
	const wanted = [link("en", "/"), link("zh-CN", "/zh-CN/"), link("x-default", "/")];

	it("gives both home pages alternates at / and /zh-CN/ and x-default /", () => {
		expect(pageMetadata(event(home))).toEqual(wanted);
		expect(pageMetadata({ page: { ...event(home).page, locale: "zh-CN", path: "/zh-CN/" } })).toEqual(wanted);
	});
	it("uses the site origin it is given, never a fixed host", () => {
		expect(pageMetadata(event(home, "https://staging.web9.ai"))).toEqual([
			{ kind: "link", rel: "alternate", hreflang: "en", href: "https://staging.web9.ai/" },
			{ kind: "link", rel: "alternate", hreflang: "zh-CN", href: "https://staging.web9.ai/zh-CN/" },
			{ kind: "link", rel: "alternate", hreflang: "x-default", href: "https://staging.web9.ai/" },
		]);
	});
	it("leaves every other page to core", () => {
		for (const content of [
			undefined,
			{ collection: "docs", id: "1", slug: "home" },
			{ collection: "posts", id: "1", slug: "home" },
			{ collection: "pages", id: "1", slug: "about" },
			{ collection: "pages", id: "1", slug: null },
			{ collection: "pages", id: "1" },
		]) {
			expect(pageMetadata(event(content))).toBeNull();
		}
		for (const siteUrl of [undefined, "", "not a url", "javascript:alert(1)"]) expect(pageMetadata({ page: { ...event(home).page, siteUrl } })).toBeNull();
		expect(pageMetadata({})).toBeNull();
		expect(pageMetadata({ page: null })).toBeNull();
	});
	it("points at the routes the site serves (localizeHref) and is registered by the plugin", () => {
		expect(HOME_ALTERNATES).toEqual([
			{ hreflang: "en", path: localizeHref("/", "en") },
			{ hreflang: "zh-CN", path: localizeHref("/", "zh-CN") },
			{ hreflang: "x-default", path: "/" },
		]);
		expect(createPlugin().hooks["page:metadata"]).toMatchObject({ handler: pageMetadata });
	});
});
