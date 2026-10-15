/** Which expected markers are missing from a page, and which forbidden ones appear in it. */
export function checkMarkers(html, { present = [], absent = [] }) {
	return {
		missing: present.filter((m) => !html.includes(m)),
		unexpected: absent.filter((m) => html.includes(m)),
	};
}
