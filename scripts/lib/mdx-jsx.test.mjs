import { describe, expect, it } from "vitest";
import { dropWrappers, imgAttributes, parseToolsGallery, youtubeToTokens, youtubeUrl } from "./mdx-jsx.mjs";

describe("dropWrappers", () => {
	it("drops wrapper tags and widgets, keeps their children", () => {
		const src = [
			"<MDXTemplate> ",
			"[Twitter](https://twitter.com/x) <TwitterFollowButton username=\"x\" size=\"large\" />",
			'<AlignedText align="right">',
			"> quote",
			"</AlignedText>",
			"</MDXTemplate>",
			"<style>",
			"{`",
			"  .tools-gallery { margin-top: 2rem; }",
			"`}",
			"</style> ",
		].join("\n");
		expect(dropWrappers(src).split("\n").filter((l) => l.trim())).toEqual(["[Twitter](https://twitter.com/x)", "> quote"]);
	});
});

describe("youtubeToTokens", () => {
	it("replaces single- and multi-line YouTube tags with numbered tokens", () => {
		const src = '<YouTube youTubeId="SKS-URw9a18" />\n- item\n      <YouTube youTubeId="xul4nDHvxgg" skipTo={{\n    h: 0,\n    m: 10,\n    s: 44\n  }} />\n';
		const { body, videos } = youtubeToTokens(src);
		expect(body).toBe("%%youtube:0%%\n- item\n      %%youtube:1%%\n");
		expect(videos).toEqual([
			{ id: "SKS-URw9a18", start: 0 },
			{ id: "xul4nDHvxgg", start: 644 },
		]);
		expect(youtubeUrl(videos[1])).toBe("https://www.youtube.com/watch?v=xul4nDHvxgg&t=644s");
		expect(youtubeUrl(videos[0])).toBe("https://www.youtube.com/watch?v=SKS-URw9a18");
	});
	it("fails on a YouTube tag without a valid id", () => {
		expect(() => youtubeToTokens('<YouTube youTubeId="short" />')).toThrow(/valid youTubeId/);
	});
});

describe("parseToolsGallery", () => {
	it("turns each tool-category into a title and its tools", () => {
		const html = `
  <div className="tool-category">
    <h3>AI Agents</h3>
    <div className="tools-grid">
      <a href="https://www.coze.com/" target="_blank" title="AI Agent">
        <Image img={CozeStore} className="tool-image" />
        <span>Coze</span>
      </a>
    </div>
  </div>
  <div className="tool-category">
    <h3>Knowledge Base | RAG</h3>
    <div className="tools-grid">
      <a href="https://www.notion.so/product/ai" target="_blank" title="笔记之王">
        <div className="svg-container">
          <NotionSvg width="100" height="100" />
        </div>
        <span>Notion AI</span>
      </a>
    </div>
  </div>`;
		const img = (name) => ({ CozeStore: "/img/coze/coze_store.png", NotionSvg: "/img/rag/notion.svg" })[name] ?? "";
		expect(parseToolsGallery(html, img)).toEqual([
			{ title: "AI Agents", tools: [{ name: "Coze", tagline: "AI Agent", logo: "/img/coze/coze_store.png", url: "https://www.coze.com/", featured: false }] },
			{
				title: "Knowledge Base | RAG",
				tools: [{ name: "Notion AI", tagline: "笔记之王", logo: "/img/rag/notion.svg", url: "https://www.notion.so/product/ai", featured: false }],
			},
		]);
	});
});

describe("imgAttributes", () => {
	it("reads src and alt", () => {
		expect(imgAttributes('<img src="/img/a.svg" alt="A" width="100">')).toEqual({ src: "/img/a.svg", alt: "A" });
	});
});
