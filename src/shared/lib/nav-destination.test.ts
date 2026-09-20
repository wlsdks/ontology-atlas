import { describe, expect, it } from 'vitest';

import { resolveGuideDestination } from './nav-destination';

describe('which first-visit guide a screen gets', () => {
  it('gives the MCP tab its own guide, though the rail still reads agents', () => {
    // MCP folded into /agents as a tab and /mcp became a redirect, so the destination is
    // "agents" on both tabs; without reading the tab the mcp guide could never appear.
    expect(
      resolveGuideDestination({ surface: 'agents', pathname: '/ko/agents', tab: 'mcp' }),
    ).toBe('mcp');
    expect(
      resolveGuideDestination({ surface: 'agents', pathname: '/ko/agents', tab: null }),
    ).toBe('agents');
    expect(
      resolveGuideDestination({ surface: 'agents', pathname: '/ko/agents', tab: 'agents' }),
    ).toBe('agents');
  });

  it('draws none on the map — that journey belongs to the map view', () => {
    expect(resolveGuideDestination({ surface: 'map', pathname: '/ko/topology', tab: null })).toBeNull();
    expect(resolveGuideDestination({ surface: null, pathname: '/ko/anything', tab: null })).toBeNull();
  });

  it('gives projects its guide on the list only, not on one project', () => {
    expect(
      resolveGuideDestination({ surface: 'projects', pathname: '/ko/projects', tab: null }),
    ).toBe('projects');
    expect(
      resolveGuideDestination({ surface: 'projects', pathname: '/ko/project/launch', tab: null }),
    ).toBeNull();
  });

  it('passes every other destination through', () => {
    for (const surface of ['architecture', 'docs', 'library', 'insights', 'git'] as const) {
      expect(resolveGuideDestination({ surface, pathname: `/ko/${surface}`, tab: null })).toBe(surface);
    }
  });
});
