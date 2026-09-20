/**
 * The MCP tab's section state, under `?mcp=`. The URL is the source of truth — a refresh, a shared link, or an
 * agent handoff must open the same tab — so parsing and serialization are pure functions rather
 * than component-local state. Same grammar as `/ontology/insights`; the two screens must not
 * grow two ways of writing the same query.
 *
 * **Two groups, one question each, since 2026-09-19.** `share` answers *"how do I point a
 * coding tool at this folder"* and is the default, because the folder's own server is what
 * everyone needs and is wired without anyone asking for it. `connectors` answers *"what else
 * may an agent reach"*, which is a deliberate addition on top and therefore second. They were
 * two tabs until the MCP screen became a tab itself; a strip inside a strip was the nested
 * switch the 2026-09-17 record's dissent named, so they are stacked groups and this value now
 * says which one a deep link lands on rather than which one is drawn.
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
 * The query key that names the MCP tab's section. Its address builder left on 2026-09-19 with
 * the section switch: the two sections are groups under one tab now, and the only writer of
 * this key is the `/mcp/` redirect, which forwards the section it was given.
 */
export const MCP_SECTION_PARAM = 'mcp';
