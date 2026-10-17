import type { APIRoute } from "astro";
import { docMarkdown } from "../../utils/ai-entry";

export const GET: APIRoute = (context) => docMarkdown("en", context);
