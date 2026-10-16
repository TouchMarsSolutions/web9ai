import { describe, expect, it } from "vitest";
import { embedSrc } from "./embed-url.mjs";

describe("embedSrc", () => {
	it.each([
		["https://www.youtube.com/watch?v=SKS-URw9a18", "https://www.youtube-nocookie.com/embed/SKS-URw9a18"],
		["https://youtu.be/SKS-URw9a18", "https://www.youtube-nocookie.com/embed/SKS-URw9a18"],
		["https://www.youtube.com/embed/SKS-URw9a18", "https://www.youtube-nocookie.com/embed/SKS-URw9a18"],
		["https://www.youtube.com/watch?v=trXPfpV5iRQ&t=644s", "https://www.youtube-nocookie.com/embed/trXPfpV5iRQ?start=644"],
		["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"],
	])("%s", (url, src) => expect(embedSrc(url)).toBe(src));
	it.each([["https://evil.example/watch?v=SKS-URw9a18"], ["javascript:alert(1)"], ["http://www.youtube.com/watch?v=SKS-URw9a18"], [undefined]])(
		"returns null for %s",
		(url) => expect(embedSrc(url)).toBeNull(),
	);
});
