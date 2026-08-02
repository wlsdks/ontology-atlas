import { describe, expect, it } from 'vitest';

import { extractCitations } from './citation';

describe('인용 강제', () => {
  it('읽은 slug 만 인용으로 남는다', () => {
    const result = extractCitations(
      '[[capabilities/payment]] 는 [[capabilities/refund]] 와 이어져 있어요.',
      ['capabilities/payment', 'capabilities/refund'],
    );
    expect(result.paragraphs[0].citations).toEqual([
      'capabilities/payment',
      'capabilities/refund',
    ]);
    expect(result.grounding).toBe('grounded');
  });

  it('읽은 적 없는 이름은 인용이 아니라 지어낸 것이다', () => {
    // 칩으로 그리면 누르는 순간 빈 곳으로 데려간다.
    const result = extractCitations('[[capabilities/imaginary]] 를 보세요.', [
      'capabilities/payment',
    ]);
    expect(result.paragraphs[0].citations).toEqual([]);
    expect(result.droppedCitations).toEqual(['capabilities/imaginary']);
    // 읽기는 했으니 `unread` 가 아니다 — 표기만 무효다.
    expect(result.grounding).toBe('uncited');
  });

  it('마지막 조각만 적어도 읽은 slug 로 되찾는다', () => {
    const result = extractCitations('[[payment]] 를 고쳐요.', ['capabilities/payment']);
    expect(result.paragraphs[0].citations).toEqual(['capabilities/payment']);
  });

  /**
   * 2026-08-02 — 구 구현은 이 둘을 **같은 값**(`demoted: true`)으로 접었다.
   * 실제로는 다음 행동이 다르다: 하나는 되돌아갈 길이 필요하고, 다른 하나는
   * 화면이 읽은 목록으로 보정하면 끝난다.
   */
  it('읽었는데 표기만 없으면 uncited — 강등이 아니라 보정 대상이다', () => {
    const result = extractCitations('제 생각에는 이렇습니다.', ['capabilities/payment']);
    expect(result.grounding).toBe('uncited');
  });

  it('이 턴에 읽은 것이 하나도 없을 때만 unread', () => {
    const result = extractCitations('제 생각에는 이렇습니다.', []);
    expect(result.grounding).toBe('unread');
  });

  it('모델이 쓴 인라인 마크다운 표기는 화면에 글자로 남지 않는다', () => {
    const result = extractCitations(
      '**증거가 없는 기능(`capability`):**\n\n`capabilities/checkout` 을 보세요.',
      ['capabilities/checkout'],
    );
    expect(result.paragraphs[0].text).toBe('증거가 없는 기능(capability):');
    expect(result.paragraphs[1].text).toBe('capabilities/checkout 을 보세요.');
  });

  it('코드 펜스 안의 백틱은 경계라서 건드리지 않는다', () => {
    const result = extractCitations('```\nkind: capability\n```', []);
    expect(result.paragraphs[0].text).toBe('```\nkind: capability\n```');
  });

  it('빈 문단은 버리고 문단 단위를 지킨다', () => {
    const result = extractCitations('첫 문단.\n\n\n둘째 문단 [[a]].', ['a']);
    expect(result.paragraphs).toHaveLength(2);
    expect(result.paragraphs[1].citations).toEqual(['a']);
  });

  it('같은 인용이 두 번 나와도 한 번만 센다', () => {
    const result = extractCitations('[[a]] 와 [[a]].', ['a']);
    expect(result.paragraphs[0].citations).toEqual(['a']);
  });
});
