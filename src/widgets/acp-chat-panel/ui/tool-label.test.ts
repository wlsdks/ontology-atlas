import { describe, expect, it } from 'vitest';

import { toolLabel } from './tool-label';

/**
 * 도구 줄은 **함수 이름이 아니라 일어난 일**을 적는다.
 *
 * 실물에서 이렇게 나왔던 것을 고친 자리다:
 * ```
 * 작업  mcp__atlas-vault__list_concepts
 * ```
 * 이 저장소의 디자인 규칙이 이미 그것을 금지한다 — *"전문용어는 쉬운 말로"*.
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
     * 도구가 늘었다는 뜻이다. 「무언가 했습니다」로 얼버무리면 그 줄이 아무것도
     * 안 나르고, 그럴듯한 말을 지어내면 실제로 한 일과 어긋난다.
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
    // 서버 이름에 밑줄이 있어도 도구 이름만 남아야 한다.
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
    // 판정 기준이 리터럴이 아니라 **주입한 그 이름**이라는 계약.
    expect(toolLabel('mcp__atlas-vault__add_concept', 'other-name').kind).toBe('raw');
  });
});
