import { describe, expect, it } from 'vitest';

import { buildAgentsTabHref, parseAgentsTab } from './agents-tab-state';

describe('agents tab state', () => {
  it('parses the two tabs and falls back to agents', () => {
    expect(parseAgentsTab('mcp')).toBe('mcp');
    expect(parseAgentsTab('agents')).toBe('agents');
    expect(parseAgentsTab(null)).toBe('agents');
    expect(parseAgentsTab('connectors')).toBe('agents');
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
});
