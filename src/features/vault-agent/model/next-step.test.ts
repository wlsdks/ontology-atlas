// The marker never shows, only the last line is a marker, and a chip is one line.
import { describe, expect, it } from 'vitest';

import { NEXT_STEP_MAX_CHARS, splitNextStep } from './next-step';

describe('splitNextStep', () => {
  it('splits the last NEXT: line from the body', () => {
    const { body, nextStep } = splitNextStep(
      '「결제 처리」 정의를 이렇게 제안해요.\n\nNEXT: 「환불」과 「정산」 사이 연결을 살펴줘',
    );
    expect(body).toBe('「결제 처리」 정의를 이렇게 제안해요.');
    expect(nextStep).toBe('「환불」과 「정산」 사이 연결을 살펴줘');
  });

  it('leaves the body unchanged without a marker', () => {
    const { body, nextStep } = splitNextStep('그냥 답이에요.');
    expect(body).toBe('그냥 답이에요.');
    expect(nextStep).toBeNull();
  });

  it('ignores NEXT: in the middle of the body', () => {
    const text = 'NEXT: 라고 적힌 문서를 찾았어요.\n\n그 문서는 낡았어요.';
    expect(splitNextStep(text)).toEqual({ body: text, nextStep: null });
  });

  it('reduces citation markers to the bare name', () => {
    const { nextStep } = splitNextStep(
      '답이에요.\nNEXT: [[capabilities/refund]] 의 소속을 정해줘',
    );
    expect(nextStep).toBe('refund 의 소속을 정해줘');
  });

  it('truncates an overlong chip', () => {
    const { nextStep } = splitNextStep(`답.\nNEXT: ${'가'.repeat(400)}`);
    expect(nextStep).not.toBeNull();
    expect(nextStep!.length).toBeLessThanOrEqual(NEXT_STEP_MAX_CHARS);
    expect(nextStep!.endsWith('…')).toBe(true);
  });

  it('makes no chip from an empty NEXT:', () => {
    expect(splitNextStep('답.\nNEXT:   ').nextStep).toBeNull();
  });
});
