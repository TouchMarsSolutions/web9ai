// The guard's tool_grid.logo_size bounds are the renderer's LOGO_SIZE, not a copy of its numbers.
// Its own file because vi.mock replaces tool-grid.mjs for every test in the file.
import { describe, expect, it, vi } from "vitest";
import { guardPortableText } from "./pt-guard.mjs";

vi.mock("./tool-grid.mjs", () => ({ LOGO_SIZE: { default: 30, min: 20, max: 40 } }));

const grid = (logo_size) => guardPortableText([{ _type: "tool_grid", _key: "t", logo_size }]);

describe("guardPortableText: tool_grid.logo_size", () => {
	it("takes its bounds from LOGO_SIZE in tool-grid.mjs", () => {
		for (const size of [20, 30, 40]) expect(grid(size)).toEqual([]);
		for (const size of [16, 19, 41, 300]) expect(grid(size)).toEqual([`#0 tool_grid logo_size: value ${size} is not allowed`]);
	});
});
