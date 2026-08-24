import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTypingShortcuts } from './use-typing-shortcut';

function press(init: KeyboardEventInit) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  );
}

/**
 * The regression this file exists for: with a Korean input source active the letter
 * keys emit Hangul jamo, so matching the *typed character* silently killed every
 * letter shortcut the app advertises -- for the exact audience the Korean shortcut
 * sheet is written for. Matching `event.code` (the position) is what a letter
 * shortcut actually means.
 */
describe('useTypingShortcuts', () => {
  it('fires a letter shortcut when a Korean input source rewrote the character', () => {
    const onFire = vi.fn();
    renderHook(() => useTypingShortcuts([{ combo: { key: 'd' }, onFire }]));

    press({ key: 'ㅇ', code: 'KeyD' });

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('fires a meta letter shortcut under a Korean input source', () => {
    const onFire = vi.fn();
    renderHook(() => useTypingShortcuts([{ combo: { key: 'k', meta: true }, onFire }]));

    press({ key: 'ㅏ', code: 'KeyK', metaKey: true });

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('still fires on the plain Latin character', () => {
    const onFire = vi.fn();
    renderHook(() => useTypingShortcuts([{ combo: { key: 'd' }, onFire }]));

    press({ key: 'd', code: 'KeyD' });

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('matches punctuation by character, not position', () => {
    const onFire = vi.fn();
    renderHook(() => useTypingShortcuts([{ combo: { key: '?' }, onFire }]));

    // Shift+/ produces `?` on both US and 2-set Korean layouts; the *position* is
    // what moves between layouts here, so the character stays the identity.
    press({ key: '?', code: 'Slash', shiftKey: true });

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does not steal a keystroke that belongs to an IME composition', () => {
    const onFire = vi.fn();
    renderHook(() => useTypingShortcuts([{ combo: { key: 'd' }, onFire }]));

    press({ key: 'ㅇ', code: 'KeyD', isComposing: true });

    expect(onFire).not.toHaveBeenCalled();
  });

  it('keeps the meta requirement exact', () => {
    const onFire = vi.fn();
    renderHook(() => useTypingShortcuts([{ combo: { key: 'k', meta: true }, onFire }]));

    press({ key: 'ㅏ', code: 'KeyK' });

    expect(onFire).not.toHaveBeenCalled();
  });

  it('reads the current callback without reinstalling the listener', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onFire }: { onFire: () => void }) =>
        useTypingShortcuts([{ combo: { key: 'd' }, onFire }]),
      { initialProps: { onFire: first } },
    );

    rerender({ onFire: second });
    press({ key: 'd', code: 'KeyD' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
