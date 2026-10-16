import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter.mjs";

describe("parseFrontmatter", () => {
	it("parses the YAML subset the legacy files use", () => {
		const src = [
			"---",
			"title: AI学习之旅 | 一场AI工具与技能的晚宴",
			"slug: /rundiffusion",
			"description: 'Quoted: with a colon'",
			"sidebar_position: 1",
			"draft: true",
			"tags: [AI, course, 'tiny-course']",
			"keywords:",
			"  - cloud",
			"    - GPU Cloud",
			"image: /cover/01.svg",
			"---",
			"# Body",
		].join("\n");
		const { data, body } = parseFrontmatter(src);
		expect(data).toEqual({
			title: "AI学习之旅 | 一场AI工具与技能的晚宴",
			slug: "/rundiffusion",
			description: "Quoted: with a colon",
			sidebar_position: 1,
			draft: true,
			tags: ["AI", "course", "tiny-course"],
			keywords: ["cloud", "GPU Cloud"],
			image: "/cover/01.svg",
		});
		expect(body).toBe("# Body");
	});
	it("returns the whole source when there is no frontmatter", () => {
		expect(parseFrontmatter("# T\n")).toEqual({ data: {}, body: "# T\n" });
	});
});
