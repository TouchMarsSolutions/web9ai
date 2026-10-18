// Types for prism-client.mjs, so `import("@web9/blocks/prism-client")` type-checks in .astro scripts.
/** Highlights every language-tagged code block under `root` with Prism (loaded on the first call that has a bundled language to highlight). */
export declare function highlightUnder(root: Element): Promise<void>;
