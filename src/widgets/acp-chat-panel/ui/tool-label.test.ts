import { describe, expect, it } from 'vitest';

import { isVaultTool, toolLabel } from './tool-label';

/**
 * A tool line records **what happened, not a function name.**
 *
 * This is where the real thing coming out like this was fixed:
 * ```
 * Task  mcp__atlas-vault__list_concepts
 * ```
 * This repository's design rule already forbids it — *"Use plain words for jargon"*
 * (jargon in plain words).
 */
const OURS = 'atlas-vault';

describe('도구 줄 — 아는 것만 뜻으로 옮긴다', () => {
  it('우리가 꽂아 준 도구는 뜻으로 옮긴다', () => {
    expect(toolLabel('mcp__atlas-vault__add_concept', OURS)).toEqual({
      kind: 'known',
      text: 'addNode',
    });
    expect(toolLabel('mcp__atlas-vault__list_concepts', OURS)).toEqual({
      kind: 'known',
      text: 'read',
    });
  });

  it('우리 서버인데 모르는 도구는 **이름만** 보여 준다 — 지어내지 않는다', () => {
    /*
     * It means the tool set grew. Fudging it as "did something" makes the line carry
     * nothing, and inventing something plausible diverges from what was actually done.
     */
    expect(toolLabel('mcp__atlas-vault__brand_new_thing', OURS)).toEqual({
      kind: 'raw',
      text: 'brand_new_thing',
    });
  });

  it('남의 MCP 도구는 서버 접두사만 벗긴다', () => {
    expect(toolLabel('mcp__some-server__write_file', OURS)).toEqual({
      kind: 'raw',
      text: 'write_file',
    });
    // Even with an underscore in the server name, only the tool name should remain.
    expect(toolLabel('mcp__my_server__do_thing', OURS)).toEqual({
      kind: 'raw',
      text: 'do_thing',
    });
  });

  it('MCP 가 아닌 도구는 그대로 둔다', () => {
    expect(toolLabel('Terminal', OURS)).toEqual({ kind: 'raw', text: 'Terminal' });
    expect(toolLabel('Read File', OURS)).toEqual({ kind: 'raw', text: 'Read File' });
  });

  it('빈 제목에 아무 말도 지어내지 않는다', () => {
    expect(toolLabel('   ', OURS)).toEqual({ kind: 'raw', text: '' });
  });

  it('서버 이름이 바뀌면 우리 도구도 남의 도구가 된다 — 이름을 박아 두지 않았다', () => {
    // The contract that the test is **the injected name**, not a literal.
    expect(toolLabel('mcp__atlas-vault__add_concept', 'other-name').kind).toBe('raw');
  });
});

describe('isVaultTool — whose answer is this', () => {
  it('recognises the server we wired in', () => {
    expect(isVaultTool('mcp__atlas-vault__list_concepts', 'atlas-vault')).toBe(true);
    expect(isVaultTool('  mcp__atlas-vault__add_concept  ', 'atlas-vault')).toBe(true);
  });

  it('refuses another server, a bare tool, and a name that only looks like ours', () => {
    expect(isVaultTool('mcp__other__list_concepts', 'atlas-vault')).toBe(false);
    expect(isVaultTool('Grep', 'atlas-vault')).toBe(false);
    expect(isVaultTool('mcp__atlas-vault-evil__list_concepts', 'atlas-vault')).toBe(false);
    expect(isVaultTool('', 'atlas-vault')).toBe(false);
  });
});
