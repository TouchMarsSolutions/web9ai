import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { canonicalRedirect } from "../packages/web9-site/lib/canonical-host.mjs";

export { PluginBridge };

export default {
	...handler,
	// The apex and plain http answer 301 to https://www.web9.ai before EmDash runs. Files under public/ are served by
	// static assets before the Worker is invoked, so they answer on any host without the redirect.
	fetch(request, env, ctx) {
		const location = canonicalRedirect(request.url);
		if (location) return new Response(null, { status: 301, headers: { Location: location } });
		return handler.fetch!(request, env, ctx);
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
