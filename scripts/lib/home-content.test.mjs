import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SchemaRegistry, normalizeBlocksData } from "emdash";
import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/sqlite";
import { applySeed } from "emdash/seed";
import { Kysely } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { beforeSave } from "../../packages/web9-blocks/index.mjs";
import { homePayload } from "./home-content.mjs";

describe("homePayload", () => {
	it("links each locale's button to its own intro and fixes the Energe typo", () => {
		expect(homePayload("en").data.layout[0]).toMatchObject({ primary_label: "Magic Starts", primary_href: "/docs/intro" });
		expect(homePayload("zh-CN").data.layout[0]).toMatchObject({ primary_label: "魔法启动", primary_href: "/zh-CN/docs/intro" });
		expect(JSON.stringify(homePayload("en"))).not.toContain("Energe");
		expect(homePayload("zh-CN").data.layout[1].features.map((f) => f.image.src)).toEqual(["/img/metaverse.svg", "/img/energy_free.svg", "/img/ai.svg"]);
		expect(() => homePayload("fr")).toThrow(/no home page text/);
	});
	it("passes the save hook that guards pages.layout images", async () => {
		for (const locale of ["en", "zh-CN"]) {
			const { data } = homePayload(locale);
			expect(await beforeSave({ collection: "pages", content: data })).toEqual(data);
		}
	});
});

// The block values must pass EmDash's own validation for the seeded schema, and come back unchanged:
// otherwise every runner pass would see a difference and write again.
const dir = mkdtempSync(join(tmpdir(), "web9-home-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("homePayload against the seeded schema", () => {
	it("is valid and already normalized for both locales", async () => {
		const db = new Kysely({ dialect: createDialect({ url: `file:${join(dir, "home.db")}` }) });
		try {
			await runMigrations(db);
			await applySeed(db, JSON.parse(readFileSync(new URL("../../seed/seed.json", import.meta.url), "utf8")), { includeContent: false, onConflict: "skip" });
			const pages = await new SchemaRegistry(db).getCollectionWithFields("pages");
			for (const locale of ["en", "zh-CN"]) {
				const { data } = homePayload(locale);
				expect(await normalizeBlocksData(db, pages, data)).toEqual(data);
			}
			await expect(normalizeBlocksData(db, pages, { layout: [{ ...homePayload("en").data.layout[0], primary_href: "" }] })).rejects.toThrow(/URL must use/);
			// <Blocks> looks a block up as components[block._type] (a plain object, so "constructor" would find a function).
			// That never happens because core's lookup of the block type is a Map and a Set: pin it (spec §10).
			for (const _type of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
				await expect(normalizeBlocksData(db, pages, { layout: [{ _type, _version: 1, _key: "k", title: "x" }] })).rejects.toThrow(/is unavailable/);
			}
		} finally {
			await db.destroy();
		}
	});
});
