// Gate for the migration (plan 2 Task 7): every legacy doc and post converts without errors, into blocks the
// save hook accepts (packages/web9-blocks/lib/pt-guard.mjs), with no MDX left over as visible text.
// Runs only while legacy/ exists; plan 3 deletes both together.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_TAGS } from "../../packages/web9-blocks/lib/markdown.mjs";
import { guardPortableText } from "../../packages/web9-blocks/lib/pt-guard.mjs";
import { mdxToBlocks } from "./mdx-to-pt.mjs";

const ROOTS = ["legacy/docs", "legacy/i18n/zh-CN/docusaurus-plugin-content-docs/current", "legacy/blog"];
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(path.join(dir, e.name)) : /\.mdx?$/.test(e.name) ? [path.join(dir, e.name)] : [],
	);

/** Every string in a block except code and Mermaid source, where JSX-like text is legitimate. */
function strings(value, key = "", out = []) {
	if (typeof value === "string") {
		if (key !== "code") out.push(value);
	} else if (Array.isArray(value)) value.forEach((v) => strings(v, key, out));
	else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, k, out);
	return out;
}
const LEFTOVER = [/<[A-Z][A-Za-z]*\b/, /<\/?(?:Tabs|TabItem|details|summary|style|iframe|script)\b/i, /%%(?:youtube|callout):/, /::::/];
// Markdown bodies render `:::tone` at the start of a line (markdown.mjs); prose text and indented ones do not.
const leftoverFor = (block) => (block._type === "block" ? [...LEFTOVER, /:::/] : [...LEFTOVER, /^[ \t]+:::/m]);
// Tag names in any case: prose text holds no tag at all (inline HTML is an error), a Markdown body only tags its
// sanitizer keeps (anything else would be dropped or shown as text).
const unkeptTags = (block, s) =>
	[...s.matchAll(/<\/?([a-z][\w-]*)/gi)].map((m) => m[1].toLowerCase()).filter((tag) => block._type === "block" || !ALLOWED_TAGS.includes(tag));

/** First non-empty line of every fenced code block in the source (a fence inside a fence is code). */
function fenceFirstLines(src) {
	const out = [];
	let fence = null;
	let first = false;
	for (const line of src.split("\n")) {
		if (!fence) {
			fence = /^\s*(`{3,}(?=[^`]*$)|~{3,})/.exec(line)?.[1] ?? null;
			first = true;
		} else if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
		else if (first && line.trim()) {
			out.push(line.trim());
			first = false;
		}
	}
	return out;
}
/** What a source must keep: fence first lines, http(s) link targets, and video ids (YouTube tags, bilibili players). */
function mustKeep(src) {
	const youtubeId = (url) => /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url)?.[1];
	return [
		...fenceFirstLines(src),
		...[...src.matchAll(/\]\((https?:\/\/[^)\s]+)|\bhref="(https?:\/\/[^"]+)"/g)].map((m) => youtubeId(m[1] ?? m[2]) ?? m[1] ?? m[2]),
		...[...src.matchAll(/<YouTube\b[^>]*?youTubeId=["']([\w-]{11})["']/g)].map((m) => m[1]),
		...[...src.matchAll(/player\.bilibili\.com\/player\.html\?[^"]*\bbvid=(BV\w+)/g)].map((m) => m[1]),
	];
}

describe.skipIf(!existsSync("legacy/docs"))("legacy content converts cleanly", () => {
	const files = ROOTS.flatMap(walk);
	const results = files.map((file) => ({ file, ...mdxToBlocks(readFileSync(file, "utf8"), { path: file }) }));
	const count = (type) => results.reduce((n, r) => n + r.blocks.filter((b) => b._type === type).length, 0);

	it("finds 26 en docs, 9 zh-CN docs and 2 posts", () => {
		expect(files.map((f) => ROOTS.find((r) => f.startsWith(r)))).toEqual([...Array(26).fill(ROOTS[0]), ...Array(9).fill(ROOTS[1]), ...Array(2).fill(ROOTS[2])]);
	});
	it("emits no htmlBlock and only blocks the save hook accepts", () => {
		expect(count("htmlBlock")).toBe(0);
		expect(results.flatMap((r) => guardPortableText(r.blocks).map((p) => `${r.file}: ${p}`))).toEqual([]);
	});
	it("leaves no MDX in visible text", () => {
		const found = results.flatMap(({ file, blocks }) =>
			blocks.flatMap((b, i) =>
				b._type === "mermaid"
					? []
					: strings(b).flatMap((s) => [
							...leftoverFor(b).filter((re) => re.test(s)).map((re) => `${file} #${i} ${b._type}: ${re}`),
							...unkeptTags(b, s).map((tag) => `${file} #${i} ${b._type}: <${tag}>`),
						]),
			),
		);
		expect(found).toEqual([]);
	});
	it("keeps every code fence, every http(s) link and every video of the source", () => {
		// Comments are dropped on purpose; YouTube links and tags are matched by video id (tags become embeds)
		const lost = results.flatMap(({ file, blocks }) => {
			const json = JSON.stringify(blocks);
			const src = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
			return mustKeep(src)
				.filter((s) => !json.includes(JSON.stringify(s).slice(1, -1)))
				.map((s) => `${file}: ${s.slice(0, 80)}`);
		});
		expect(lost).toEqual([]);
	});
	it("leaves no converter token anywhere, code included (an indented token would lex as code)", () => {
		expect(results.flatMap(({ file, blocks }) => (JSON.stringify(blocks).match(/%%(?:youtube|callout):\d+%%/g) ?? []).map((t) => `${file}: ${t}`))).toEqual([]);
	});
	it("keeps the known media and widget counts", () => {
		// 10 YouTube tags: 8 in prose become embeds, 2 inside tab bodies become links (en 00_guide)
		expect(count("embed")).toBe(8);
		// 8 tool tables in 01_ai_hot_tools + 8 gallery categories in 01_tools-summary (27 tools)
		expect(count("tool_grid")).toBe(16);
		expect(count("image")).toBe(39);
	});
});
