import registry from '@/src-tauri/src/acp-registry.json';

/**
 * The coding tools the Mac app knows, read from the bundled `src-tauri/src/acp-registry.json`
 * its detection walks, so the web list cannot drift from it. Only name and mark are drawn:
 * the English vendor descriptions would mix languages and a browser has no state to report.
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
