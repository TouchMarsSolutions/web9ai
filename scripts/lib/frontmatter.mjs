// Frontmatter of the legacy Docusaurus files: the small YAML subset they use
// (`key: value`, quoted strings, `[a, b]` lists, `- item` block lists, booleans, integers).
const unquote = (v) => v.replace(/^(['"])([\s\S]*)\1$/, "$2");

function scalar(raw) {
	const v = raw.trim();
	if (v === "true" || v === "false") return v === "true";
	if (/^-?\d+$/.test(v)) return Number(v);
	if (/^\[.*\]$/.test(v))
		return v
			.slice(1, -1)
			.split(",")
			.map((x) => unquote(x.trim()))
			.filter(Boolean);
	return unquote(v);
}

/** `{ data, body }`: the parsed frontmatter and the source after it. Unknown syntax stays a string. */
export function parseFrontmatter(src) {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
	if (!m) return { data: {}, body: src };
	const data = {};
	let listKey = null;
	for (const line of m[1].split(/\r?\n/)) {
		const item = /^\s*-\s+(.*)$/.exec(line);
		if (item && listKey) {
			data[listKey].push(scalar(item[1]));
			continue;
		}
		const kv = /^([\w-]+):\s*(.*)$/.exec(line);
		if (!kv) continue;
		const [, key, value] = kv;
		listKey = value.trim() === "" ? key : null;
		data[key] = listKey ? [] : scalar(value);
	}
	return { data, body: src.slice(m[0].length) };
}
