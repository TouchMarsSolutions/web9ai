// pages/home for en and zh-CN (spec §2, §7): the old Docusaurus home (legacy/src/pages/index.tsx,
// HomepageFeatures, i18n/zh-CN/code.json) as hero + feature_grid blocks in the `layout` field.
// Stable _keys, so a re-run compares equal and an edit needs no replaceBlocks.

/** A static file in public/img, in the shape the admin's "from URL" picker stores. No width/height:
 * with both set, EmDash sends same-origin images through astro:assets. */
const svg = (file, alt) => ({ id: "", provider: "external", src: `/img/${file}`, mimeType: "image/svg+xml", alt });

const TEXT = {
	en: {
		start: "Magic Starts",
		web3: "VR, AR and Decentralization is the passcode to Web3",
		// The old site said "Energe free"; fixed on purpose (plan 2 rulings).
		energy: "Energy free is the key milestone of technology",
		ai: "Artificial Intelligence is the wind to blow you into immersive future",
	},
	"zh-CN": {
		start: "魔法启动",
		web3: "VR和AR搭载去中心化技术是去往Web3的通行证",
		energy: "能源自由是人类科技颠覆的里程碑",
		ai: "AI是风, 吹响科技跨越裂谷",
	},
};

/** upsertEntry payload for one locale. Hero title, tagline and feature titles were never translated. */
export function homePayload(locale) {
	const t = TEXT[locale];
	if (!t) throw new Error(`no home page text for ${locale}`);
	return {
		collection: "pages",
		slug: "home",
		locale,
		status: "published",
		data: {
			title: "Web9.AI",
			layout: [
				{
					_type: "hero",
					_version: 1,
					_key: "home-hero",
					title: "Web9.AI",
					tagline: "square of web3 to the power of AI",
					primary_label: t.start,
					primary_href: `${locale === "en" ? "" : `/${locale}`}/docs/intro`,
				},
				{
					_type: "feature_grid",
					_version: 1,
					_key: "home-features",
					features: [
						{ title: "Web3", description: t.web3, image: svg("metaverse.svg", "Web3") },
						{ title: "Energy", description: t.energy, image: svg("energy_free.svg", "Energy") },
						{ title: "AI", description: t.ai, image: svg("ai.svg", "AI") },
					],
				},
			],
		},
	};
}
