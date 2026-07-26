// 다음 한 걸음의 계약: 표지는 화면에 안 보인다 · 마지막 줄만 표지다 ·
// 칩은 한 줄이다.
import { describe, expect, it } from 'vitest';

import { NEXT_STEP_MAX_CHARS, splitNextStep } from './next-step';

describe('splitNextStep', () => {
  it('마지막 NEXT: 줄을 본문에서 떼어낸다', () => {
    const { body, nextStep } = splitNextStep(
      '「결제 처리」 정의를 이렇게 제안해요.\n\nNEXT: 「환불」과 「정산」 사이 연결을 살펴줘',
    );
    expect(body).toBe('「결제 처리」 정의를 이렇게 제안해요.');
    expect(nextStep).toBe('「환불」과 「정산」 사이 연결을 살펴줘');
  });

  it('표지가 없으면 본문이 그대로다', () => {
    const { body, nextStep } = splitNextStep('그냥 답이에요.');
    expect(body).toBe('그냥 답이에요.');
    expect(nextStep).toBeNull();
  });

  it('본문 가운데의 NEXT: 는 표지가 아니다 — 시키지 않은 말이 컨트롤이 되지 않게', () => {
    const text = 'NEXT: 라고 적힌 문서를 찾았어요.\n\n그 문서는 낡았어요.';
    expect(splitNextStep(text)).toEqual({ body: text, nextStep: null });
  });

  it('인용 표기는 이름만 남긴다 — 입력칸은 대화 본문의 문법을 쓰지 않는다', () => {
    const { nextStep } = splitNextStep(
      '답이에요.\nNEXT: [[capabilities/refund]] 의 소속을 정해줘',
    );
    expect(nextStep).toBe('refund 의 소속을 정해줘');
  });

  it('칩은 문단이 아니다 — 넘치면 자른다', () => {
    const { nextStep } = splitNextStep(`답.\nNEXT: ${'가'.repeat(400)}`);
    expect(nextStep).not.toBeNull();
    expect(nextStep!.length).toBeLessThanOrEqual(NEXT_STEP_MAX_CHARS);
    expect(nextStep!.endsWith('…')).toBe(true);
  });

  it('빈 NEXT: 는 칩을 만들지 않는다', () => {
    expect(splitNextStep('답.\nNEXT:   ').nextStep).toBeNull();
  });
});
