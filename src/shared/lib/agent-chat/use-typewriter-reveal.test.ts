import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTypewriterReveal } from './use-typewriter-reveal';

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
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(() => callback(0));
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('typewriter reveal shows text as it was written, not as it arrived', () => {
  it('reveals gradually while streaming and shows everything at the end', () => {
    const hook = renderHook(({ text }) => useTypewriterReveal(text, true), {
      initialProps: { text: '안녕하세요 반갑습니다' },
    });

    expect(hook.result.current, 'nothing shows before the first frame').toBe('');
    runFrames(1);
    const afterOne = hook.result.current;
    expect(afterOne.length).toBeGreaterThan(0);
    expect(afterOne.length, 'dumping everything in one frame would make the text pop in at once').toBeLessThan(
      '안녕하세요 반갑습니다'.length,
    );

    runFrames(30);
    expect(hook.result.current).toBe('안녕하세요 반갑습니다');
  });

  it('Hangul comes out syllable by syllable, never split by bytes', () => {
    const hook = renderHook(() => useTypewriterReveal('가나다라마바사아자차카타파하', true));
    runFrames(3);
    // Every revealed unit is a whole syllable: slicing by code point cannot produce a partial one.
    expect(hook.result.current).toBe('가나다라마바사아자차카타파하'.slice(0, hook.result.current.length));
    expect(hook.result.current).not.toMatch(/[\uD800-\uDFFF]/);
  });

  it('when the turn ends the full text shows without animation, so a finished conversation is never left half shown', () => {
    const hook = renderHook(({ streaming }) => useTypewriterReveal('완성된 답변입니다', streaming), {
      initialProps: { streaming: true },
    });
    runFrames(1);
    expect(hook.result.current.length).toBeLessThan('완성된 답변입니다'.length);

    hook.rerender({ streaming: false });
    expect(
      hook.result.current,
      'waiting for more frames after the turn ends would leave a finished answer cut off',
    ).toBe('완성된 답변입니다');
  });

  it('a late large chunk does not lag behind, since the remaining amount sets the speed', () => {
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
      'if the stride does not come from the remaining amount, 2000 characters crawl out one at a time',
    ).toBeGreaterThan(beforeBurst);
  });

  it('when not streaming, the full text shows from the first render', () => {
    const hook = renderHook(() => useTypewriterReveal('지난 턴의 답', false));
    expect(hook.result.current).toBe('지난 턴의 답');
    expect(frames, 'a frame was scheduled although there is nothing to animate').toHaveLength(0);
  });
});
