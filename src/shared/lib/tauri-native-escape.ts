import { isTauri } from '@tauri-apps/api/core';

/**
 * **Escape reaches the page once per press, whatever the input source** (2026-09-25).
 *
 * Under the macOS Korean input source (2-Set Korean), a plain Escape reaches a WKWebView page
 * late or not at all: measured with bare WKWebViews under that source, one got no key event for
 * Escape, text field focused or not, while arrows, Enter, Tab and Space arrived; another got the
 * `keydown` only after the input method answered, after its own `keyup`. Every palette, sheet,
 * inbox and dialog here closes on Escape, so for a person typing Korean they could stay open.
 * Chromium probes cannot see this; only a WebKit window with that source can.
 *
 * The app watches its own key-downs natively (`src-tauri/src/native_escape.rs`) without
 * consuming them — the input method still needs Escape for a composition — and after each
 * plain press fires {@link NATIVE_ESCAPE_EVENT} on the page. This bridge decides whether the
 * page already saw that press. When it did not, it dispatches the `keydown`/`keyup` pair the
 * WebView never sent, on the focused element, so every existing Escape handler runs as it
 * would for any other input source. When it did — ABC, a password field, where secure input
 * bypasses the input method — it does nothing, so no press is handled twice.
 *
 * **On the web it does nothing.** A browser tab has no native side to send the signal, and
 * outside Tauri this bridge is never installed.
 */

/** The DOM event the native side fires after a plain Escape press in this window. */
export const NATIVE_ESCAPE_EVENT = 'atlas:native-escape';

/**
 * How near a real Escape `keydown` has to be to the native signal to be the same press. A real
 * `keydown` for the press lands within milliseconds of the signal, before it or, when the input
 * method answers late, just after it.
 */
export const SAME_PRESS_WINDOW_MS = 150;

/**
 * How long the page waits for a real `keydown` still on its way. The input method answers the
 * WebView asynchronously, which can put the real event after the signal: measured 0-14 ms
 * behind it on 2026-09-25, over twelve presses in a WKWebView running this bridge. Waiting
 * about five times the worst of that keeps such a press from being handled twice, at a cost
 * below what a person notices on a surface that is closing.
 */
export const LATE_KEYDOWN_GRACE_MS = 80;

/** What the page knows about the keyboard at the moment it judges one native signal. */
export interface NativeEscapeState {
  /** When the WebView last delivered an Escape `keydown` itself, or `null` if it never has. */
  lastRealEscapeAt: number | null;
  /** Whether an IME composition is open right now. */
  composing: boolean;
  /** When the last composition ended, or `null` if none has. */
  lastCompositionEndAt: number | null;
}

/**
 * - `delivered` — the page already saw this press; nothing to do.
 * - `composing` — the input method used the press to end or keep a composition, which is
 *   what Escape means mid-composition; the page does not also close something.
 * - `wait` — nothing yet; a real `keydown` may still be on its way.
 * - `dispatch` — the press never reached the page; dispatch it.
 */
export type NativeEscapeVerdict = 'delivered' | 'composing' | 'wait' | 'dispatch';

const within = (at: number | null, now: number) => at !== null && now - at <= SAME_PRESS_WINDOW_MS;

export function judgeNativeEscape(
  state: NativeEscapeState,
  now: number,
  { waited }: { waited: boolean },
): NativeEscapeVerdict {
  if (within(state.lastRealEscapeAt, now)) return 'delivered';
  if (state.composing || within(state.lastCompositionEndAt, now)) return 'composing';
  return waited ? 'dispatch' : 'wait';
}

interface InstallOptions {
  /** Defaults to `isTauri()`: the bridge exists only where a native side can signal. */
  enabled?: boolean;
  /** Monotonic milliseconds; tests pass a clock they control. */
  now?: () => number;
}

/**
 * Starts listening for the native signal. Returns a detach function; outside the app it
 * attaches nothing and returns a no-op.
 */
export function installNativeEscapeBridge(
  target: Window = window,
  { enabled, now = () => target.performance.now() }: InstallOptions = {},
): () => void {
  const active = enabled ?? isTauriRuntime();
  if (!active) return () => undefined;

  const doc = target.document;
  const state: NativeEscapeState = {
    lastRealEscapeAt: null,
    composing: false,
    lastCompositionEndAt: null,
  };
  let pending: ReturnType<typeof setTimeout> | null = null;
  /*
   * The events this bridge dispatched. Every other Escape `keydown` is the WebView's: nothing
   * else in the app dispatches one. Named by exclusion rather than by `isTrusted` so the one
   * thing this bridge must never do — count its own event as the press it stands in for — is
   * stated exactly.
   */
  const dispatched = new WeakSet<Event>();

  // Capture phase on the window: this runs before any handler can stop the event.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !dispatched.has(event)) state.lastRealEscapeAt = now();
  };
  const onCompositionStart = () => {
    state.composing = true;
  };
  const onCompositionEnd = () => {
    state.composing = false;
    state.lastCompositionEndAt = now();
  };

  const dispatchEscape = () => {
    const focused = doc.activeElement ?? doc.body;
    if (!focused) return;
    // `keyCode`/`which` too: older handlers still read the legacy numbers.
    const init: KeyboardEventInit = {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    for (const type of ['keydown', 'keyup'] as const) {
      const event = new KeyboardEvent(type, init);
      dispatched.add(event);
      focused.dispatchEvent(event);
    }
  };

  const settle = (waited: boolean) => {
    const verdict = judgeNativeEscape(state, now(), { waited });
    if (verdict === 'wait') {
      pending = setTimeout(() => {
        pending = null;
        settle(true);
      }, LATE_KEYDOWN_GRACE_MS);
      return;
    }
    // A key-down, or the end of a composition, answers one press: the next press, even a
    // quick one, is judged on what arrives for it.
    if (verdict === 'delivered') state.lastRealEscapeAt = null;
    if (verdict === 'composing') state.lastCompositionEndAt = null;
    if (verdict === 'dispatch') dispatchEscape();
  };

  const onNativeEscape = () => {
    // A second press while the first is still waiting: the first is judged now, on what has
    // arrived so far, so neither press is lost.
    if (pending !== null) {
      clearTimeout(pending);
      pending = null;
      settle(true);
    }
    settle(false);
  };

  target.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('compositionstart', onCompositionStart, true);
  doc.addEventListener('compositionend', onCompositionEnd, true);
  target.addEventListener(NATIVE_ESCAPE_EVENT, onNativeEscape);
  return () => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
    target.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('compositionstart', onCompositionStart, true);
    doc.removeEventListener('compositionend', onCompositionEnd, true);
    target.removeEventListener(NATIVE_ESCAPE_EVENT, onNativeEscape);
  };
}

function isTauriRuntime(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}
