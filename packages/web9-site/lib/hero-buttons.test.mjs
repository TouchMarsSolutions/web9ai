import { describe, expect, it } from "vitest";
import { heroButtons } from "./hero-buttons.mjs";

const hero = (extra) => ({ _type: "hero", title: "Web9", ...extra });

describe("heroButtons", () => {
	it("keeps both buttons, primary first, when label and href are present and safe", () => {
		expect(
			heroButtons(hero({ primary_label: "Start", primary_href: "/docs/intro", secondary_label: "Source", secondary_href: "https://github.com/web9" })),
		).toEqual([
			{ label: "Start", href: "/docs/intro", primary: true },
			{ label: "Source", href: "https://github.com/web9", primary: false },
		]);
	});
	it("accepts the forms core's isSafeHref accepts", () => {
		for (const href of ["/docs/intro", "/", "#top", "https://example.com/a?b=c", "http://example.com", "mailto:a@example.com", "tel:+123456"]) {
			expect(heroButtons(hero({ primary_label: "x", primary_href: href })), href).toEqual([{ label: "x", href, primary: true }]);
		}
	});
	it("drops a button whose href is not safe, and keeps the other one", () => {
		const bad = [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			" javascript:alert(1)",
			"java\tscript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"vbscript:msgbox(1)",
			"//evil.example/",
			"/\\evil.example/",
			"\\\\evil.example",
			"docs/intro",
			"",
			"https://",
		];
		for (const href of bad) {
			expect(heroButtons(hero({ primary_label: "a", primary_href: href, secondary_label: "b", secondary_href: "/ok" })), JSON.stringify(href)).toEqual([
				{ label: "b", href: "/ok", primary: false },
			]);
			expect(heroButtons(hero({ primary_label: "a", primary_href: "/ok", secondary_label: "b", secondary_href: href })), JSON.stringify(href)).toEqual([
				{ label: "a", href: "/ok", primary: true },
			]);
		}
	});
	it("drops a button whose href is not a string (a row that bypassed core's validation)", () => {
		for (const href of [undefined, null, 0, 1, true, {}, ["/ok"]]) {
			expect(heroButtons(hero({ primary_label: "a", primary_href: href })), String(href)).toEqual([]);
		}
	});
	it("drops a button without a label", () => {
		expect(heroButtons(hero({ primary_href: "/ok", secondary_label: "", secondary_href: "/ok" }))).toEqual([]);
	});
	it("returns no buttons for a bare block", () => {
		expect(heroButtons(hero())).toEqual([]);
	});
});
