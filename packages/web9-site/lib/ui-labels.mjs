// Accessible names (aria-label) of the site chrome, per locale. The zh-CN ones are the old site's (Docusaurus zh-Hans)
// where it had the same control: 主导航, 页面路径, 主页面, 文档侧边栏 and "…的直接链接". A locale without its own table
// reads the en one. The en labels are what check-page markers look for (spec 2026-10-17 docs UX §5); keep them.
const LABELS = {
	en: {
		main: "Main",
		menu: "Menu",
		closeMenu: "Close menu",
		breadcrumbs: "Breadcrumbs",
		home: "Home",
		docs: "Docs",
		language: "Language",
		theme: "Theme",
		headingLink: (text) => `Direct link to ${text}`,
		currentLanguage: (label) => `Language: ${label}`,
		themeNames: { light: "light", dark: "dark", system: "system" },
		themeSwitch: (current, next) => `Theme: ${current}. Switch to ${next}`,
	},
	"zh-CN": {
		main: "主导航",
		menu: "菜单",
		closeMenu: "关闭菜单",
		breadcrumbs: "页面路径",
		home: "主页面",
		docs: "文档侧边栏",
		language: "语言",
		theme: "主题",
		headingLink: (text) => `${text}的直接链接`,
		currentLanguage: (label) => `语言：${label}`,
		themeNames: { light: "浅色模式", dark: "暗黑模式", system: "跟随系统" },
		themeSwitch: (current, next) => `主题：${current}，切换到${next}`,
	},
};

/** The label table of `locale`, else en's. */
export function uiLabels(locale) {
	return Object.hasOwn(LABELS, locale) ? LABELS[locale] : LABELS.en;
}

/** The theme button's label once the script knows the theme: the current one and the one a click switches to. */
export function themeLabel(locale, current, next) {
	const labels = uiLabels(locale);
	const name = (theme) => (Object.hasOwn(labels.themeNames, theme) ? labels.themeNames[theme] : theme);
	return labels.themeSwitch(name(current), name(next));
}
