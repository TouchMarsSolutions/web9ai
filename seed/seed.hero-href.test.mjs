// Pins the core behaviour Hero.astro's safeHref is the second line of defence for: core validates every `url`
// field of a block on write (block-values.ts normalizeBlocksData -> blockSchema -> zod-generator.ts `url` case,
// isSafeUrlFieldValue), so the seed's `hero` cannot be stored with a javascript: href. A core upgrade that
// loosened this would fail here instead of putting the href on `/`. Same throwaway database as seed.apply.test.mjs.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SchemaRegistry, isSafeHref, normalizeBlocksData } from "emdash";
import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/sqlite";
import { applySeed } from "emdash/seed";
import { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeHref } from "../packages/web9-blocks/lib/href.mjs";
import { heroButtons } from "../packages/web9-site/lib/hero-buttons.mjs";

const seed = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "web9-hero-"));
let db;
let pages;

beforeAll(async () => {
	db = new Kysely({ dialect: createDialect({ url: `file:${join(dir, "seed.db")}` }) });
	await runMigrations(db);
	await applySeed(db, seed, { includeContent: false, onConflict: "skip" });
	pages = await new SchemaRegistry(db).getCollectionWithFields("pages");
});
afterAll(async () => {
	await db?.destroy();
	rmSync(dir, { recursive: true, force: true });
});

const write = (hero) => normalizeBlocksData(db, pages, { layout: [{ _type: "hero", title: "Web9", ...hero }] });
const UNSAFE = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//evil.example/", "/\\evil.example/", "docs/intro"];

describe("core's write-time check on the seed's hero block (pages.layout)", () => {
	it("accepts a hero with safe button links, and Hero.astro renders exactly those", async () => {
		const { layout } = await write({ primary_label: "Start", primary_href: "/docs/intro", secondary_label: "Source", secondary_href: "https://github.com/web9" });
		expect(layout).toHaveLength(1);
		expect(heroButtons(layout[0]).map((x) => x.href)).toEqual(["/docs/intro", "https://github.com/web9"]);
	});
	it.each(UNSAFE)("rejects primary_href %j", async (href) => {
		await expect(write({ primary_label: "x", primary_href: href })).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringMatching(/primary_href/) });
	});
	it.each(UNSAFE)("rejects secondary_href %j", async (href) => {
		await expect(write({ secondary_label: "x", secondary_href: href })).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringMatching(/secondary_href/) });
	});
	it("only tries values that core's isSafeHref and the site's safeHref both refuse", () => {
		for (const href of UNSAFE) {
			expect(isSafeHref(href), href).toBe(false);
			expect(safeHref(href), href).toBe("");
		}
	});
});
