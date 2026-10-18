import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headingAnchors, legacyIdsFor } from "../../packages/web9-site/lib/anchors.mjs";
import TABLE from "../../packages/web9-site/lib/legacy-anchors.json" with { type: "json" };
import { docPayloads } from "./docs-payloads.mjs";
import { legacyAnchors, plainHeading } from "./legacy-anchors.mjs";
import { readLegacyTree } from "./legacy-tree.mjs";

describe("plainHeading", () => {
	it("drops inline code, bold and link syntax, as the converter's spans do", () => {
		expect(plainHeading("Why do we need `class`? ")).toBe("Why do we need class?");
		expect(plainHeading("**Bold** and [link](https://x.y)")).toBe("Bold and link");
	});
});

describe("legacy-anchors.json", () => {
	it("holds the old site's 22 custom heading ids, including the ones site links use", () => {
		expect(Object.values(TABLE).reduce((n, page) => n + Object.keys(page).length, 0)).toBe(22);
		expect(TABLE["en/learn_ai_coding"]["What NOT ?"]).toBe("what-is-not");
		expect(TABLE["zh-CN/learn_ai_coding"]["目标不是什么？"]).toBe("what-is-not");
		expect(TABLE["zh-CN/learn_ai_coding"]["函数"]).toBe("function");
	});
});

// Like docs-nav.test.mjs: runs while legacy/ exists, skipped once it is removed after the cutover.
describe.skipIf(!existsSync("legacy/docs"))("legacy-anchors.json against legacy/", () => {
	it("is what `node scripts/legacy-anchors.mjs` writes", () => {
		expect(legacyAnchors()).toEqual(TABLE);
	});
	it("gives the anchors the old site's links use: #what-is-not and #function, and #programming-code from the slug", () => {
		const payloads = docPayloads(readLegacyTree());
		const ids = (locale, slug) => {
			const { want } = payloads.find((p) => p.doc.locale === locale && p.doc.slug === slug);
			return headingAnchors(want.data.body, legacyIdsFor(locale, slug)).map((a) => a.id);
		};
		for (const locale of ["en", "zh-CN"]) expect(ids(locale, "learn_ai_coding"), locale).toEqual(expect.arrayContaining(["what-is-not", "function"]));
		expect(ids("en", "guide")).toContain("programming-code");
	});
});
