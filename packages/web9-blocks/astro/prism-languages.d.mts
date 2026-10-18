// Types for prism-languages.mjs, so `import("@web9/blocks/prism-languages")` type-checks in .astro scripts.
/** Every language name and alias Prism highlights on this site. */
export declare const PRISM_LANGUAGES: readonly string[];
/** True when `root` holds a `pre code` block whose first `language-*` class names a language Prism bundles. */
export declare function hasHighlightable(root: Element): boolean;
