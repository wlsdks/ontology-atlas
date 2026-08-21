import { describe, expect, it } from 'vitest';

import surface from '../../../../docs/.generated/mcp-surface.json';
import { atlasToolMode } from './atlas-tool-policy';

type SurfaceTool = { name: string; mode: 'read' | 'write' };

const tools = ((surface as { mcp?: { tools?: SurfaceTool[] } }).mcp?.tools ?? []);

describe('ACP Atlas tool policy — generated MCP surface가 정본이다', () => {
  it('등록된 모든 도구를 tools/list의 read/write annotation과 똑같이 분류한다', () => {
    expect(tools.length).toBeGreaterThan(30);
    for (const tool of tools) {
      expect(
        atlasToolMode(`mcp__atlas-vault__${tool.name}`, 'atlas-vault'),
        tool.name,
      ).toBe(tool.mode);
    }
  });

  it('우리 서버의 새 도구를 모르면 write로 닫고, 남의 서버는 분류하지 않는다', () => {
    expect(atlasToolMode('mcp__atlas-vault__future_tool', 'atlas-vault')).toBe('write');
    expect(atlasToolMode('mcp__other__list_concepts', 'atlas-vault')).toBeNull();
  });
});
