/**
 * The `?tab=` query is the source of truth: a refresh, a shared link and the app's deep link
 * (`ontology-atlas://mcp?install=…`, forwarded by `/mcp/`) must all open the same tab.
 * The array order is the strip's order.
 */
const AGENTS_TABS = ['agents', 'models', 'mcp'] as const;

export type AgentsTab = (typeof AGENTS_TABS)[number];

const DEFAULT_AGENTS_TAB: AgentsTab = 'agents';

export const AGENTS_TAB_PARAM = 'tab';

function isAgentsTab(value: string): value is AgentsTab {
  return (AGENTS_TABS as readonly string[]).includes(value);
}

export function parseAgentsTab(raw: string | null | undefined): AgentsTab {
  if (!raw) return DEFAULT_AGENTS_TAB;
  return isAgentsTab(raw) ? raw : DEFAULT_AGENTS_TAB;
}

/**
 * The default tab omits `?tab=` so the plain URL is the one a person copies. Leaving MCP drops
 * both `?mcp=` and a consumed `?install=`, or a stale `install` reopens the connectors dialog.
 */
export function buildAgentsTabHref(tab: AgentsTab, current: URL): string {
  const query = new URLSearchParams(current.search);
  if (tab !== 'mcp') {
    query.delete('mcp');
    query.delete('install');
  }
  if (tab === DEFAULT_AGENTS_TAB) {
    query.delete(AGENTS_TAB_PARAM);
  } else {
    query.set(AGENTS_TAB_PARAM, tab);
  }
  const search = query.toString();
  return search ? `${current.pathname}?${search}` : current.pathname;
}
