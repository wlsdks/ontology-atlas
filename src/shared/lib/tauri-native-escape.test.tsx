import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Dialog } from '@/shared/ui/dialog';

import {
  installNativeEscapeBridge,
  judgeNativeEscape,
  LATE_KEYDOWN_GRACE_MS,
  NATIVE_ESCAPE_EVENT,
  SAME_PRESS_WINDOW_MS,
  type NativeEscapeState,
} from './tauri-native-escape';

/**
 * Under the Korean input source the installed app's WebView sends the page **no Escape at
 * all**, so nothing closed from the keyboard (measured 2026-09-25). The native side now fires
 * one signal per press; these cases pin what the page does with it: the press reaches the
 * focused element exactly once, and a press the WebView did deliver is never handled twice.
 */

const idle: NativeEscapeState = { lastRealEscapeAt: null, composing: false, lastCompositionEndAt: null };

describe('judgeNativeEscape', () => {
  it('waits once for a keydown that may still be coming, then dispatches', () => {
    expect(judgeNativeEscape(idle, 1_000, { waited: false })).toBe('wait');
    expect(judgeNativeEscape(idle, 1_000, { waited: true })).toBe('dispatch');
  });

  it('a press the WebView delivered is not dispatched again', () => {
    const state = { ...idle, lastRealEscapeAt: 990 };
    expect(judgeNativeEscape(state, 1_000, { waited: false })).toBe('delivered');
    expect(judgeNativeEscape(state, 990 + SAME_PRESS_WINDOW_MS, { waited: true })).toBe('delivered');
  });

  it('an older delivered press does not swallow a new one', () => {
    const state = { ...idle, lastRealEscapeAt: 100 };
    expect(judgeNativeEscape(state, 100 + SAME_PRESS_WINDOW_MS + 1, { waited: true })).toBe('dispatch');
  });

  it('Escape during a composition belongs to the input method', () => {
    expect(judgeNativeEscape({ ...idle, composing: true }, 1_000, { waited: true })).toBe('composing');
    // The input method ended the composition with this very press.
    expect(judgeNativeEscape({ ...idle, lastCompositionEndAt: 995 }, 1_000, { waited: true })).toBe(
      'composing',
    );
    expect(
      judgeNativeEscape({ ...idle, lastCompositionEndAt: 100 }, 100 + SAME_PRESS_WINDOW_MS + 1, {
        waited: true,
      }),
    ).toBe('dispatch');
  });
});

describe('installNativeEscapeBridge', () => {
  let detach: () => void = () => undefined;
  let input: HTMLInputElement;
  let seen: KeyboardEvent[];
  const record = (event: KeyboardEvent) => {
    if (event.key === 'Escape') seen.push(event);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    input = document.createElement('input');
    document.body.append(input);
    input.focus();
    seen = [];
    window.addEventListener('keydown', record);
    window.addEventListener('keyup', record);
  });

  afterEach(() => {
    detach();
    window.removeEventListener('keydown', record);
    window.removeEventListener('keyup', record);
    vi.useRealTimers();
  });

  const install = () => {
    detach = installNativeEscapeBridge(window, { enabled: true, now: () => Date.now() });
  };
  const nativePress = () => window.dispatchEvent(new CustomEvent(NATIVE_ESCAPE_EVENT));

  it('a press the WebView never delivered reaches the focused element once', () => {
    install();
    nativePress();
    // Nothing yet: a real keydown may still be on its way.
    expect(seen).toHaveLength(0);
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);

    expect(seen.map((event) => event.type)).toEqual(['keydown', 'keyup']);
    const [down] = seen;
    expect(down.target).toBe(input);
    expect(down.code).toBe('Escape');
    expect(down.keyCode).toBe(27);
    expect(down.bubbles).toBe(true);
    expect(down.cancelable).toBe(true);
  });

  it('a press the WebView delivered is handled once, not twice', () => {
    install();
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 });
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS * 4);
    expect(seen.filter((event) => event.type === 'keydown')).toHaveLength(1);
  });

  it('a real keydown that arrives after the signal still wins', () => {
    install();
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS - 10);
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 });
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS * 4);
    expect(seen.filter((event) => event.type === 'keydown')).toHaveLength(1);
  });

  it('the press that ends a composition closes nothing; the next one does', () => {
    install();
    fireEvent.compositionStart(input);
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(seen).toHaveLength(0);

    fireEvent.compositionEnd(input);
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(seen).toHaveLength(0);

    vi.advanceTimersByTime(SAME_PRESS_WINDOW_MS);
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(seen.filter((event) => event.type === 'keydown')).toHaveLength(1);
  });

  it('one delivered key-down answers one press, not the next one too', () => {
    install();
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 });
    nativePress();
    vi.advanceTimersByTime(20);
    // A second press the WebView kept, 20 ms later: still inside the same-press window of the
    // first key-down, which has already been spent on the first press.
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    // The delivered one, then the one the bridge stood in for.
    expect(seen.filter((event) => event.type === 'keydown')).toHaveLength(2);
  });

  it('two quick presses are two presses', () => {
    install();
    nativePress();
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(seen.filter((event) => event.type === 'keydown')).toHaveLength(2);
  });

  it('with nothing focused the press lands on the body', () => {
    input.blur();
    install();
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(seen[0]?.target).toBe(document.body);
  });

  it('attaches nothing on the web', () => {
    detach = installNativeEscapeBridge(window, { enabled: false, now: () => Date.now() });
    nativePress();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS * 4);
    expect(seen).toHaveLength(0);
  });

  it('a detached bridge dispatches nothing still pending', () => {
    install();
    nativePress();
    detach();
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS * 4);
    expect(seen).toHaveLength(0);
  });

  it('closes a Dialog the way a delivered Escape does', () => {
    const onClose = vi.fn();
    const view = render(
      <Dialog open onClose={onClose} aria-label="dialog">
        <button type="button">inside</button>
      </Dialog>,
    );
    install();
    act(() => {
      nativePress();
      vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

describe('the native side fires the event this bridge listens for', () => {
  it('src-tauri/src/native_escape.rs dispatches NATIVE_ESCAPE_EVENT', () => {
    const rust = readFileSync(join(process.cwd(), 'src-tauri/src/native_escape.rs'), 'utf8');
    expect(rust).toContain(`new CustomEvent('${NATIVE_ESCAPE_EVENT}')`);
  });
});
