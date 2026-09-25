/**
 * `/agents` tab state. The URL `?tab=` is the source of truth — a refresh, a shared link, an
 * agent handoff and the installed app's deep link (`ontology-atlas://mcp?install=…`, which
 * `/mcp/` forwards here) must all open the same tab — so parsing and serialization are pure
 * functions rather than component-local state. Same grammar as `/ontology/insights` and the
 * MCP section's own `?mcp=`.
 *
 * **Three tabs, one question each** (owner, 2026-09-19: *"I don't want agents and MCP stacked on
 * one screen with a scroll — split them into tabs, pick one, see that one"*; the models tab,
 * owner 2026-09-25). `agents` answers *"which coding tools does this computer have, and can I
 * open a conversation"* and is the default. `models` answers *"which model does Atlas's own
 * conversation call, and with whose key"*: local runners by address, API keys in the Keychain,
 * the experimental external check, and the record of what left. `mcp` answers *"what does an
 * agent reach through this folder"*.
 *
 * The array order is the strip's order: agents, models, MCP.
 */
const AGENTS_TABS = ['agents', 'models', 'mcp'] as const;

export type AgentsTab = (typeof AGENTS_TABS)[number];

const DEFAULT_AGENTS_TAB: AgentsTab = 'agents';

export const AGENTS_TAB_PARAM = 'tab';

function isAgentsTab(value: string): value is AgentsTab {
  return (AGENTS_TABS as readonly string[]).includes(value);
}

/** The raw `searchParams.get("tab")` value → a valid tab. Unknown or missing gives the default. */
export function parseAgentsTab(raw: string | null | undefined): AgentsTab {
  if (!raw) return DEFAULT_AGENTS_TAB;
  return isAgentsTab(raw) ? raw : DEFAULT_AGENTS_TAB;
}

/**
 * The address for a tab, keeping every other query key. The default omits `?tab=` so the
 * destination's plain URL stays the one a person copies. Leaving the MCP tab also drops the
 * MCP section's own `?mcp=` and a consumed `?install=`: neither means anything on another tab,
 * and a stale `install` would re-open the connectors dialog on the next visit.
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
