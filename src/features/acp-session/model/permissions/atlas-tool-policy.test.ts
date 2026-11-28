import { describe, expect, it } from 'vitest';

import surface from '../../../../../docs/.generated/mcp-surface.json';
import { atlasToolMode } from './atlas-tool-policy';

type SurfaceTool = { name: string; mode: 'read' | 'write' };

const tools = ((surface as { mcp?: { tools?: SurfaceTool[] } }).mcp?.tools ?? []);

describe('ACP Atlas tool policy: the generated MCP surface is canonical', () => {
  it('classifies every registered tool exactly as the tools/list read/write annotation does', () => {
    expect(tools.length).toBeGreaterThan(20);
    for (const tool of tools) {
      expect(
        atlasToolMode(`mcp__atlas-vault__${tool.name}`, 'atlas-vault'),
        tool.name,
      ).toBe(tool.mode);
    }
  });

  it('closes to write on an unknown new tool of our server and classifies no other server tool', () => {
    expect(atlasToolMode('mcp__atlas-vault__future_tool', 'atlas-vault')).toBe('write');
    expect(atlasToolMode('mcp__other__list_concepts', 'atlas-vault')).toBeNull();
  });

  it('does not translate a call to an externally connected tool into our read/write vocabulary', () => {
    // A connector's tools are somebody else's, and this table describes the vault server only.
    // Classifying `mcp__notion__create_page` as a "write" would put an Atlas word on a Notion
    // action and imply the vault's write checkpoint applies to it. Returning null is what makes
    // the panel render it as a status-only trace line instead.
    for (const name of [
      'mcp__notion__API-post-page',
      'mcp__github__create_issue',
      'mcp__linear__list_issues',
      // A connector whose own tool happens to share one of our names is still not ours.
      'mcp__notion__list_concepts',
    ]) {
      expect(atlasToolMode(name, 'atlas-vault'), name).toBeNull();
    }
  });
});
