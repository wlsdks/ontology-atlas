/**
 * The section a deep link lands on under `?mcp=`; both groups are always drawn. `share` is the
 * default, since the folder's own server is what everyone needs.
 */
const MCP_TABS = ['share', 'connectors'] as const;

export type McpTab = (typeof MCP_TABS)[number];

const DEFAULT_MCP_TAB: McpTab = 'share';

function isMcpTab(value: string): value is McpTab {
  return (MCP_TABS as readonly string[]).includes(value);
}

export function parseMcpTab(raw: string | null | undefined): McpTab {
  if (!raw) return DEFAULT_MCP_TAB;
  return isMcpTab(raw) ? raw : DEFAULT_MCP_TAB;
}

/** Written only by the `/mcp/` redirect, which forwards the section it was given. */
export const MCP_SECTION_PARAM = 'mcp';
