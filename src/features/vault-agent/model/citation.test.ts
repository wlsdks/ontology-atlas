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
    expect(result.demoted).toBe(false);
  });

  it('읽은 적 없는 이름은 인용이 아니라 지어낸 것이다', () => {
    // 칩으로 그리면 누르는 순간 빈 곳으로 데려간다.
    const result = extractCitations('[[capabilities/imaginary]] 를 보세요.', [
      'capabilities/payment',
    ]);
    expect(result.paragraphs[0].citations).toEqual([]);
    expect(result.droppedCitations).toEqual(['capabilities/imaginary']);
    expect(result.demoted).toBe(true);
  });

  it('마지막 조각만 적어도 읽은 slug 로 되찾는다', () => {
    const result = extractCitations('[[payment]] 를 고쳐요.', ['capabilities/payment']);
    expect(result.paragraphs[0].citations).toEqual(['capabilities/payment']);
  });

  it('인용이 하나도 없으면 렌더가 강등된다', () => {
    const result = extractCitations('제 생각에는 이렇습니다.', ['capabilities/payment']);
    expect(result.demoted).toBe(true);
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
