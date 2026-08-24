import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTypewriterReveal } from './use-typewriter-reveal';

/**
 * Owner, 2026-08-24: *"can the characters not come out one at a time, smoothly? right now they
 * burst out."* An ACP adapter sends `agent_message_chunk` in whatever size its transport produces,
 * and the panel rendered each chunk the instant it landed — one sentence arriving in three jerks.
 *
 * What these tests hold is the pair of promises that make the smoothing safe: it never delays the
 * answer, and it never leaves a finished conversation partly drawn.
 */

let frames: Array<() => void> = [];

function runFrames(count: number) {
  for (let i = 0; i < count; i += 1) {
    const queued = frames;
    frames = [];
    act(() => {
      for (const frame of queued) frame();
    });
  }
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(() => cb(0));
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('타자기 노출 — 도착한 대로가 아니라 쓰인 대로 보여 준다', () => {
  it('스트리밍 중에는 조금씩 드러나고, 끝에는 전부 나온다', () => {
    const hook = renderHook(({ text }) => useTypewriterReveal(text, true), {
      initialProps: { text: '안녕하세요 반갑습니다' },
    });

    expect(hook.result.current, '첫 프레임 전에는 아직 아무것도 안 나온다').toBe('');
    runFrames(1);
    const afterOne = hook.result.current;
    expect(afterOne.length).toBeGreaterThan(0);
    expect(afterOne.length, '한 프레임에 전부 쏟아내면 「팍」이 그대로다').toBeLessThan(
      '안녕하세요 반갑습니다'.length,
    );

    runFrames(30);
    expect(hook.result.current).toBe('안녕하세요 반갑습니다');
  });

  it('한글은 음절째로 나온다 — 바이트 단위로 쪼개지지 않는다', () => {
    const hook = renderHook(() => useTypewriterReveal('가나다라마바사아자차카타파하', true));
    runFrames(3);
    // Every revealed unit is a whole syllable: slicing by code point cannot produce a partial one.
    expect(hook.result.current).toBe('가나다라마바사아자차카타파하'.slice(0, hook.result.current.length));
    expect(hook.result.current).not.toMatch(/[\uD800-\uDFFF]/);
  });

  it('턴이 끝나면 애니메이션 없이 전문이다 — 끝난 대화가 반쪽으로 남지 않는다', () => {
    const hook = renderHook(({ streaming }) => useTypewriterReveal('완성된 답변입니다', streaming), {
      initialProps: { streaming: true },
    });
    runFrames(1);
    expect(hook.result.current.length).toBeLessThan('완성된 답변입니다'.length);

    hook.rerender({ streaming: false });
    expect(
      hook.result.current,
      '턴이 끝났는데 프레임을 더 기다리면 완성된 답이 잘린 채 남는다',
    ).toBe('완성된 답변입니다');
  });

  it('뒤늦게 큰 덩어리가 와도 밀리지 않는다 — 남은 양이 속도를 정한다', () => {
    const hook = renderHook(({ text }) => useTypewriterReveal(text, true), {
      initialProps: { text: 'a'.repeat(20) },
    });
    runFrames(2);
    const beforeBurst = hook.result.current.length;

    hook.rerender({ text: 'a'.repeat(2000) });
    runFrames(2);
    const afterBurst = hook.result.current.length - beforeBurst;
    expect(
      afterBurst,
      '보폭이 남은 양에서 나오지 않으면 2000자가 한 글자씩 기어 나온다',
    ).toBeGreaterThan(beforeBurst);
  });

  it('스트리밍이 아니면 첫 렌더부터 전문이다', () => {
    const hook = renderHook(() => useTypewriterReveal('지난 턴의 답', false));
    expect(hook.result.current).toBe('지난 턴의 답');
    expect(frames, '움직일 것이 없는데 프레임을 잡았다').toHaveLength(0);
  });
});
