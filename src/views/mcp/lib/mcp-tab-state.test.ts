import { describe, expect, it } from 'vitest';

import { MCP_CONNECTORS_HREF } from '@/shared/config/destinations';

import { MCP_SECTION_PARAM, parseMcpTab } from './mcp-tab-state';

describe('mcp tab section state', () => {
  it('the MCP connectors address every door uses lands on the connectors group', () => {
    const connectors = new URL(MCP_CONNECTORS_HREF, 'https://x');
    expect(parseMcpTab(connectors.searchParams.get(MCP_SECTION_PARAM))).toBe('connectors');
  });
});
