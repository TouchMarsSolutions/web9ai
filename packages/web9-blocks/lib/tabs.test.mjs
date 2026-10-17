import { describe, expect, it } from "vitest";
import { tabItems } from "./tabs.mjs";

describe("tabItems", () => {
	it("keeps object tabs, with label and body as strings", () => {
		expect(tabItems({ tabs: [{ label: "A", body: "md" }, null, 5, [], { label: 7, body: { x: 1 } }, {}] })).toEqual([
			{ label: "A", body: "md" },
			{ label: "", body: "" },
			{ label: "", body: "" },
		]);
	});
	it("gives no tabs for a missing or non-array list", () => {
		for (const node of [undefined, null, {}, { tabs: "x" }, { tabs: { 0: {} } }]) expect(tabItems(node)).toEqual([]);
	});
});
