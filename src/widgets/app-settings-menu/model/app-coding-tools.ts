import registry from '@/src-tauri/src/acp-registry.json';

/**
 * **The coding tools the Mac app knows, as the app itself knows them** (2026-09-25, round 4).
 *
 * In a browser the Agents tab cannot detect anything, so its tab used to be one card and 600px
 * of empty canvas. The one thing a browser can state truthfully is the list the app ships with:
 * `src-tauri/src/acp-registry.json` is the snapshot the app's own detection walks, bundled at
 * build time and never fetched. Reading the same file, rather than a hand-kept copy, keeps the
 * web list from drifting away from what the app actually finds.
 *
 * Only the name and the mark are drawn. The registry's English vendor descriptions would put a
 * second language on a Korean page, and a browser has no state to report for any of them.
 */
export interface AppCodingTool {
  id: string;
  name: string;
  icon: string | null;
  brandInk: string | null;
}

export const APP_CODING_TOOLS: readonly AppCodingTool[] = registry.agents.map((agent) => ({
  id: agent.id,
  name: agent.name,
  icon: agent.icon ?? null,
  brandInk: agent.brandInk ?? null,
}));
