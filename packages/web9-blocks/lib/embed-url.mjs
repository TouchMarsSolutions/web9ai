// The only embeds the site renders: YouTube and Vimeo, from the block's url (never its html).
const YOUTUBE = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})(?:[?&#].*)?$/;
const VIMEO = /^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[?#/].*)?$/;

export function embedSrc(url) {
	if (typeof url !== "string") return null;
	const yt = YOUTUBE.exec(url);
	if (yt) {
		const start = /[?&]t=(\d+)s?(?:&|$)/.exec(url)?.[1];
		return `https://www.youtube-nocookie.com/embed/${yt[1]}${start ? `?start=${start}` : ""}`;
	}
	const vimeo = VIMEO.exec(url);
	return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
}
