import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IMAGE_FIELDS, PT_FIELDS, beforeSave } from "./index.mjs";

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
});
