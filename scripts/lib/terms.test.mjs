import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seedTerms, syncTerms } from "./terms.mjs";

/** In-memory stand-in for the two MCP tools syncTerms uses. */
function fakeCms(slugs) {
	const terms = slugs.map((slug) => ({ slug, label: slug }));
	const calls = [];
	async function callTool(tool, args) {
		calls.push([tool, args]);
		if (tool === "taxonomy_list_terms") return { items: terms.map((t) => ({ ...t })) };
		if (tool === "taxonomy_create_term") {
			terms.push({ slug: args.slug, label: args.label });
			return { term: { ...args } };
		}
		throw new Error(`unexpected tool ${tool}`);
	}
	return { callTool, calls };
}

describe("seedTerms", () => {
	it("reads the tag terms of the real seed", () => {
		const seed = JSON.parse(readFileSync(new URL("../../seed/seed.json", import.meta.url), "utf8"));
		expect(seedTerms(seed, "tag")).toEqual([
			{ slug: "ai", label: "AI" },
			{ slug: "course", label: "course" },
			{ slug: "workshop", label: "workshop" },
			{ slug: "tools", label: "tools" },
			{ slug: "tiny-course", label: "tiny-course" },
		]);
	});
	it("throws on a taxonomy the seed does not define", () => {
		expect(() => seedTerms({ taxonomies: [] }, "tag")).toThrow('seed has no taxonomy "tag"');
	});
});

describe("syncTerms", () => {
	const want = [
		{ slug: "ai", label: "AI" },
		{ slug: "course", label: "course" },
	];
	it("creates the missing terms, then reports everything unchanged", async () => {
		const cms = fakeCms(["ai"]);
		expect(await syncTerms(cms.callTool, "tag", want)).toEqual([
			{ name: "tag ai", action: "unchanged" },
			{ name: "tag course", action: "created" },
		]);
		expect(cms.calls.filter(([tool]) => tool === "taxonomy_create_term")).toEqual([
			["taxonomy_create_term", { taxonomy: "tag", slug: "course", label: "course" }],
		]);
		expect((await syncTerms(cms.callTool, "tag", want)).map((r) => r.action)).toEqual(["unchanged", "unchanged"]);
	});
	it("writes nothing in a dry run", async () => {
		const cms = fakeCms([]);
		expect((await syncTerms(cms.callTool, "tag", want, { dryRun: true })).map((r) => r.action)).toEqual(["created", "created"]);
		expect(cms.calls.map(([tool]) => tool)).toEqual(["taxonomy_list_terms"]);
	});
});
