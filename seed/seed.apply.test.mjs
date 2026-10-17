// validateSeed is lenient about blocks fields; only applySeed catches a bad allowedTypes or a required blocks field.
// So apply the real seed to a throwaway SQLite file (node:sqlite, no native deps) and read the schema back.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SchemaRegistry } from "emdash";
import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/sqlite";
import { applySeed } from "emdash/seed";
import { Kysely } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

const seed = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "web9-seed-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("seed/seed.json applied to an empty database", () => {
	it("creates the block types before pages.layout references them", async () => {
		const db = new Kysely({ dialect: createDialect({ url: `file:${join(dir, "seed.db")}` }) });
		try {
			await runMigrations(db);
			const res = await applySeed(db, seed, { includeContent: false, onConflict: "skip" });
			expect(res.blockTypes.created).toBe(2);
			const reg = new SchemaRegistry(db);
			const pages = await reg.getCollectionWithFields("pages");
			expect(pages.fields.map((f) => `${f.slug}:${f.type}`)).toEqual([
				"title:string",
				"content:portableText",
				"search_text:text",
				"layout:blocks",
			]);
			expect(pages.fields.find((f) => f.slug === "layout").validation).toMatchObject({ allowedTypes: ["hero", "feature_grid"] });
			const posts = await reg.getCollectionWithFields("posts");
			expect(posts.fields.find((f) => f.slug === "search_text")).toMatchObject({ type: "text", searchable: true });
		} finally {
			await db.destroy();
		}
	});
});
