// Legacy Docusaurus blog -> EmDash `posts` (spec §7). Two posts, no authors, no zh-CN posts.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { canonical } from "./sync.mjs";
import { mdxToBlocks } from "./mdx-to-pt.mjs";

export const BLOG_ROOT = "legacy/blog";
const TRUNCATE = /^[ \t]*<!--\s*truncate\s*-->[ \t]*$/m;

const plainText = (block) => (block.children ?? []).map((c) => c.text ?? "").join("");

/**
 * Upsert payload for one post. Docusaurus showed the text above `<!-- truncate -->` as the summary;
 * it becomes `excerpt` and leaves `content`, because the post page prints the excerpt under the title
 * and the content after it. `draft: true` posts were never built, so they stay drafts.
 * `publishedAt` is the date the post was written (see firstCommitDate).
 */
export function convertPost(src, { path, rewriteHref, publishedAt }) {
	const full = mdxToBlocks(src, { path, rewriteHref });
	const cut = TRUNCATE.exec(src);
	let content = full.blocks;
	let excerpt = "";
	if (cut) {
		const head = mdxToBlocks(src.slice(0, cut.index), { path, slug: full.slug, rewriteHref }).blocks;
		if (canonical(full.blocks.slice(0, head.length)) !== canonical(head)) throw new Error(`${path}: the summary above <!-- truncate --> does not convert to the first blocks of the post`);
		if (head.some((b) => b._type !== "block")) throw new Error(`${path}: only text may sit above <!-- truncate --> (it becomes the excerpt)`);
		excerpt = head.map(plainText).join("\n").trim();
		content = full.blocks.slice(head.length);
	}
	const tags = (Array.isArray(full.frontmatter.tags) ? full.frontmatter.tags : []).map((t) => String(t).toLowerCase());
	return {
		collection: "posts",
		slug: full.slug,
		locale: "en",
		status: full.frontmatter.draft === true ? "draft" : "published",
		data: { title: full.title, ...(excerpt ? { excerpt } : {}), content },
		taxonomies: { tag: tags },
		publishedAt,
	};
}

/**
 * The date a post was written: the file's first git commit. (The folder names, 20250307-..., have no
 * separators, so Docusaurus 3 ignored them, and the live site showed the build date, so the old displayed
 * date is not the one to copy.) Needs the full history: a shallow clone (CI) has only the last commit, so
 * this refuses to guess there.
 */
export function firstCommitDate(file) {
	const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
	if (shallow !== "false") throw new Error("shallow git clone: blog dates need the full history (git fetch --unshallow)");
	const dates = execFileSync("git", ["log", "--follow", "--format=%aI", "--", file], { encoding: "utf8" }).trim().split("\n");
	if (!dates[0]) throw new Error(`${file}: not in git history`);
	return new Date(dates.at(-1)).toISOString().replace(/\.000Z$/, "Z");
}

/** [{ file, want }] for every legacy post, oldest folder first. Throws on unresolved internal links. */
export function postPayloads(tree, { root = BLOG_ROOT, dateOf = firstCommitDate } = {}) {
	const payloads = readdirSync(root, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => `${root}/${d.name}/index.mdx`)
		.sort()
		.map((file) => {
			const want = convertPost(readFileSync(file, "utf8"), {
				path: file,
				publishedAt: dateOf(file),
				rewriteHref: (href) => tree.resolveLink(href, { rel: file, locale: "en" }),
			});
			return { file, want };
		});
	if (tree.unresolved.length) throw new Error(`unresolved internal links:\n  ${tree.unresolved.join("\n  ")}`);
	return payloads;
}
