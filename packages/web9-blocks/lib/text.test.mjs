import { describe, expect, it } from "vitest";
import { text } from "./text.mjs";

describe("text", () => {
	it("keeps a string and turns anything else into an empty string, never calling its toString", () => {
		expect(text("a")).toBe("a");
		expect(text("")).toBe("");
		let deep = [];
		for (let i = 0; i < 3000; i++) deep = [deep];
		for (const v of [JSON.parse('{"toString":1}'), deep, 5, 0, true, null, undefined, {}, ["a"], { toString: () => "x" }]) expect(text(v)).toBe("");
	});
});
