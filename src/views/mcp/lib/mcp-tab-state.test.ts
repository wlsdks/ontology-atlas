import { describe, expect, it } from 'vitest';

import { parseSearch } from '@/shared/lib/navigation/atlas-search';
import { firstSearchText } from '@/shared/lib/navigation/search-text';
import { MCP_CONNECTORS_HREF } from '@/shared/config/destinations';

import { MCP_SECTION_PARAM, parseMcpTab } from './mcp-tab-state';

describe('mcp tab section state', () => {
  it('the MCP connectors address every door uses lands on the connectors group', () => {
    const connectors = new URL(MCP_CONNECTORS_HREF, 'https://x');
    expect(parseMcpTab(firstSearchText(parseSearch(connectors.search)[MCP_SECTION_PARAM]) ?? null)).toBe('connectors');
  });
});
