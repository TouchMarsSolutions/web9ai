import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { canonicalResponse } from "../packages/web9-site/lib/canonical-host.mjs";

export { PluginBridge };

export default {
	...handler,
	// The apex and plain http are redirected to https://www.web9.ai before EmDash runs. Whatever the static-asset layer
	// answers (public/, the build's _astro/ files and the _redirects rules from astro.config) is served before the
	// Worker is invoked, so it answers on any host without this redirect.
	fetch(request, env, ctx) {
		return canonicalResponse(request) ?? handler.fetch!(request, env, ctx);
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
