import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PT_FIELDS, beforeSave } from "./index.mjs";

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
});
