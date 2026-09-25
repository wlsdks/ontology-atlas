import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Dialog } from '@/shared/ui/dialog';

import {
  describeElement,
  installNativeEscapeBridge,
  judgeNativeEscape,
  LATE_KEYDOWN_GRACE_MS,
  NATIVE_ESCAPE_EVENT,
  NATIVE_ESCAPE_VERDICT_EVENT,
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
    // Waited on once first: the input method may end the composition and WebKit then deliver
    // the key, which the log must report as delivered.
    expect(judgeNativeEscape({ ...idle, composing: true }, 1_000, { waited: false })).toBe('wait');
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

/**
 * The app log gets one line per press from the native side, built from the answer this bridge
 * gives to the verdict question. These cases pin the answers a person reads there; the native
 * half of the line is pinned by `native_escape.rs`'s own tests.
 */
describe('what the page answers about each press', () => {
  let detach: () => void = () => undefined;
  let input: HTMLInputElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    input = document.createElement('input');
    input.id = 'person-typed-this';
    input.value = 'nothing typed reaches the log';
    document.body.append(input);
    input.focus();
    detach = installNativeEscapeBridge(window, { enabled: true, now: () => Date.now() });
  });

  afterEach(() => {
    detach();
    vi.useRealTimers();
  });

  const nativePress = (press: number) =>
    window.dispatchEvent(new CustomEvent(NATIVE_ESCAPE_EVENT, { detail: { press } }));
  const ask = (press: number) => {
    const detail: { press: number; verdict?: string } = { press };
    window.dispatchEvent(new CustomEvent(NATIVE_ESCAPE_VERDICT_EVENT, { detail }));
    return detail.verdict;
  };

  it('a press the page stood in for says where it went and when', () => {
    nativePress(1);
    expect(ask(1)).toBe('still waiting for a late key-down');
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(ask(1)).toBe(`stood in on INPUT after ${LATE_KEYDOWN_GRACE_MS} ms`);
  });

  it('a press WebKit delivered says so, with the key-down before or after the signal', () => {
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 });
    vi.advanceTimersByTime(3);
    nativePress(1);
    expect(ask(1)).toBe('WebKit delivered it (-3 ms)');

    vi.advanceTimersByTime(SAME_PRESS_WINDOW_MS * 2);
    nativePress(2);
    vi.advanceTimersByTime(12);
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 });
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(ask(2)).toBe('WebKit delivered it (+12 ms)');
  });

  it('a press that ended a composition before WebKit delivered it says both, in order', () => {
    fireEvent.compositionStart(input);
    nativePress(1);
    vi.advanceTimersByTime(7);
    fireEvent.compositionEnd(input);
    vi.advanceTimersByTime(2);
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape', keyCode: 27 });
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(ask(1)).toBe('WebKit delivered it (+9 ms); a composition ended +7 ms');
  });

  it('a press a composition took says so', () => {
    fireEvent.compositionStart(input);
    nativePress(1);
    vi.advanceTimersByTime(LATE_KEYDOWN_GRACE_MS);
    expect(ask(1)).toBe('a composition took it (still open)');
  });

  it('a press the page never got a signal for reads as that, not as silence', () => {
    expect(ask(99)).toBe('the page got no signal for this press');
  });

  it('names the element by tag and role only, never by id or content', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.id = 'secret-document-title';
    dialog.textContent = 'vault content';
    expect(describeElement(dialog)).toBe('DIV[role=dialog]');
    expect(describeElement(input)).toBe('INPUT');
  });
});

describe('the native side fires the events this bridge listens for', () => {
  it('src-tauri/src/native_escape.rs names both events', () => {
    const rust = readFileSync(join(process.cwd(), 'src-tauri/src/native_escape.rs'), 'utf8');
    expect(rust).toContain(`const NATIVE_ESCAPE_EVENT: &str = "${NATIVE_ESCAPE_EVENT}";`);
    expect(rust).toContain(`const NATIVE_ESCAPE_VERDICT_EVENT: &str = "${NATIVE_ESCAPE_VERDICT_EVENT}";`);
  });
});
