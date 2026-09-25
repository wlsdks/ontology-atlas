import { describe, expect, it } from 'vitest';

import { AGENTS_MODELS_HREF, DESTINATION_HREF } from '@/shared/config/destinations';

import { buildAgentsTabHref, parseAgentsTab } from './agents-tab-state';

describe('agents tab state', () => {
  it('parses the three tabs and falls back to agents', () => {
    expect(parseAgentsTab('mcp')).toBe('mcp');
    expect(parseAgentsTab('models')).toBe('models');
    expect(parseAgentsTab('agents')).toBe('agents');
    expect(parseAgentsTab(null)).toBe('agents');
    expect(parseAgentsTab('connectors')).toBe('agents');
    // The retired settings pane's name is not a tab: it lands on the default, never a blank panel.
    expect(parseAgentsTab('ai')).toBe('agents');
  });

  it('keeps the plain address for the default tab and drops the MCP section keys with it', () => {
    const url = new URL('https://x/ko/agents/?tab=mcp&mcp=connectors&install=abc&guides=off');
    expect(buildAgentsTabHref('agents', url)).toBe('/ko/agents/?guides=off');
    expect(buildAgentsTabHref('agents', new URL('https://x/ko/agents/'))).toBe('/ko/agents/');
  });

  it('writes the MCP tab beside the other keys', () => {
    const url = new URL('https://x/ko/agents/?guides=off');
    expect(buildAgentsTabHref('mcp', url)).toBe('/ko/agents/?guides=off&tab=mcp');
  });

  it('writes the models tab and drops the MCP-only keys on the way', () => {
    const url = new URL('https://x/ko/agents/?tab=mcp&mcp=connectors&install=abc&guides=off');
    expect(buildAgentsTabHref('models', url)).toBe('/ko/agents/?tab=models&guides=off');
  });

  it('the models address every door uses is the one this parser reads', () => {
    const models = new URL(AGENTS_MODELS_HREF, 'https://x');
    expect(parseAgentsTab(models.searchParams.get('tab'))).toBe('models');
    expect(models.pathname).toBe(DESTINATION_HREF.agents);
  });
});
