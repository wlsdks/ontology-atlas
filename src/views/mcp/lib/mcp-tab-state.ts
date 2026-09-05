/**
 * `/mcp` tab state. The URL `?tab=` is the source of truth — a refresh, a shared link, or an
 * agent handoff must open the same tab — so parsing and serialization are pure functions rather
 * than component-local state. Same grammar as `/ontology/insights`; the two screens must not
 * grow two ways of writing the same query.
 *
 * **Two tabs, one question each.** `share` answers *"how do I point a coding tool at this
 * folder"* and is the default, because the folder's own server is what everyone needs and is
 * wired without anyone asking for it. `connectors` answers *"what else may an agent reach"*,
 * which is a deliberate addition on top and therefore second.
 */
const MCP_TABS = ['share', 'connectors'] as const;

export type McpTab = (typeof MCP_TABS)[number];

const DEFAULT_MCP_TAB: McpTab = 'share';

function isMcpTab(value: string): value is McpTab {
  return (MCP_TABS as readonly string[]).includes(value);
}

/** The raw `searchParams.get("tab")` value → a valid tab. Unknown or missing gives the default. */
export function parseMcpTab(raw: string | null | undefined): McpTab {
  if (!raw) return DEFAULT_MCP_TAB;
  return isMcpTab(raw) ? raw : DEFAULT_MCP_TAB;
}

/**
 * The address for a tab. The default omits `?tab=` so the destination's plain URL stays the
 * one a person copies, and the locale-prefixed current pathname is passed in when only the
 * query of the current document changes.
 */
export function buildMcpTabHref(tab: McpTab, pathname = '/mcp/'): string {
  return tab === DEFAULT_MCP_TAB ? pathname : `${pathname}?tab=${tab}`;
}
