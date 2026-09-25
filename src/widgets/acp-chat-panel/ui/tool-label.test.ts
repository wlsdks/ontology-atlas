import { describe, expect, it } from 'vitest';

import { isVaultTool, labelWithoutRepeatedPath, toolLabel, withKindFallback, type ToolLabel } from './tool-label';
import en from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';

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

describe('labelWithoutRepeatedPath — 한 줄이 같은 경로를 두 번 찍지 않는다', () => {
  const raw = (text: string): ToolLabel => ({ kind: 'raw', text });

  it('제목 끝의 경로를 떼고 동사만 남긴다 — 실측한 기본 쓰기 도구', () => {
    const path = '/Users/probe/Ontology Atlas/launch/wiki/architecture.md';
    expect(labelWithoutRepeatedPath(raw(`Write ${path}`), path)).toEqual({ kind: 'raw', text: 'Write' });
    expect(labelWithoutRepeatedPath(raw(`Edit: ${path}`), path)).toEqual({ kind: 'raw', text: 'Edit' });
    expect(labelWithoutRepeatedPath(raw(`Read · ${path}`), path)).toEqual({ kind: 'raw', text: 'Read' });
  });

  it('경로만 있고 동사가 없으면 줄이 빈 채로 남지 않게 그대로 둔다', () => {
    const path = 'wiki/architecture.md';
    expect(labelWithoutRepeatedPath(raw(path), path)).toEqual(raw(path));
    expect(labelWithoutRepeatedPath(raw(`  ${path}  `), path)).toEqual(raw(`  ${path}  `));
  });

  it('정확히 끝나는 경우에만 자른다 — 비슷한 경로나 가운데 언급은 건드리지 않는다', () => {
    expect(labelWithoutRepeatedPath(raw('Write wiki/architecture.md then stop'), 'wiki/architecture.md'))
      .toEqual(raw('Write wiki/architecture.md then stop'));
    expect(labelWithoutRepeatedPath(raw('Write docs/architecture.md'), 'wiki/architecture.md'))
      .toEqual(raw('Write docs/architecture.md'));
  });

  it('뜻을 아는 도구 이름과 빈 경로는 손대지 않는다', () => {
    const known: ToolLabel = { kind: 'known', text: 'addNode' };
    expect(labelWithoutRepeatedPath(known, '/a/b.md')).toBe(known);
    expect(labelWithoutRepeatedPath(raw('Write /a/b.md'), null)).toEqual(raw('Write /a/b.md'));
    expect(labelWithoutRepeatedPath(raw('Write /a/b.md'), '   ')).toEqual(raw('Write /a/b.md'));
  });
});

describe('withKindFallback — an unknown call on our own server reads as its kind', () => {
  const server = 'atlas-vault';
  const unknown = `mcp__${server}__write_wiki_file`;

  it('names the protocol kind instead of the function name, in both catalogues', () => {
    const label = withKindFallback(toolLabel(unknown, server), unknown, server, 'edit');
    expect(label).toEqual({ kind: 'kind', text: 'edit' });
    expect(en.acpChat.toolKind).toHaveProperty(label.text);
    expect(ko.acpChat.toolKind).toHaveProperty(label.text);
  });

  it("keeps a raw name when the kind names no action, and never renames someone else's tool", () => {
    expect(withKindFallback(toolLabel(unknown, server), unknown, server, 'other')).toEqual({ kind: 'raw', text: 'write_wiki_file' });
    expect(withKindFallback(toolLabel(unknown, server), unknown, server, null)).toEqual({ kind: 'raw', text: 'write_wiki_file' });
    const foreign = 'mcp__github__create_issue';
    expect(withKindFallback(toolLabel(foreign, server), foreign, server, 'edit')).toEqual({ kind: 'raw', text: 'create_issue' });
  });

  it('leaves a tool we know by name alone', () => {
    const known = `mcp__${server}__add_concept`;
    expect(withKindFallback(toolLabel(known, server), known, server, 'edit')).toEqual({ kind: 'known', text: 'addNode' });
  });
});
