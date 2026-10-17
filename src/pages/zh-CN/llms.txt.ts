import type { APIRoute } from "astro";
import { llmsTxt } from "../../utils/ai-entry";

export const GET: APIRoute = (context) => llmsTxt("zh-CN", context);
