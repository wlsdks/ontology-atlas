import { isTauri } from '@tauri-apps/api/core';

/**
 * **Escape reaches the page once per press, whatever the input source** (2026-09-25, 2026-09-26).
 *
 * Under the macOS Korean input source (2-Set Korean), WebKit gives a plain Escape to the input
 * method before the page, and the page's `keydown` arrives once the input method has answered:
 * measured on 2026-09-26 in a build of this code launched both ways the app is, at most 18 ms
 * after the native signal below over 29 presses. Every palette, sheet, inbox and dialog here
 * closes on Escape, so a press the page never got would leave one open. Chromium probes cannot
 * see any of this; only a WebKit window with that source can.
 *
 * The app watches its own key-downs natively (`src-tauri/src/native_escape.rs`) without
 * consuming them — the input method still needs Escape for a composition — and after each
 * plain press fires {@link NATIVE_ESCAPE_EVENT} on the page. This bridge decides whether the
 * page already saw that press. When it did not, it dispatches the `keydown`/`keyup` pair the
 * WebView never sent, on the focused element, so every existing Escape handler runs as it
 * would for any other input source. When it did, it does nothing, so no press is handled twice.
 *
 * **Where each press went is in the app log**, one line per press, written by the native side
 * from this bridge's answer to {@link NATIVE_ESCAPE_VERDICT_EVENT}. A press with no line never
 * reached the app: a tool that taps Escape for the whole session takes it first, as Claude
 * Code's Computer Use MCP does while it holds its lock. That tap, not the input method, is what
 * the first "no Escape at all" measurements behind this bridge recorded.
 *
 * **On the web it does nothing.** A browser tab has no native side to send the signal, and
 * outside Tauri this bridge is never installed.
 */

/**
 * The DOM event the native side fires after a plain Escape press in this window. Its
 * `detail.press` numbers the press, so the answer below can be matched to it.
 */
export const NATIVE_ESCAPE_EVENT = 'atlas:native-escape';

/**
 * The DOM event the native side fires a moment after the signal to ask what the page did with
 * that press. The bridge writes a one-line answer into `detail.verdict`, and the native side
 * puts it in the app log, one line per press: the log is how anyone proves where an Escape went
 * in the installed app, where no WebView console is open.
 */
export const NATIVE_ESCAPE_VERDICT_EVENT = 'atlas:native-escape-verdict';

/** How many presses the bridge still has an answer for; the native side asks within a second. */
const REMEMBERED_PRESSES = 16;

/**
 * How near a real Escape `keydown` has to be to the native signal to be the same press. A real
 * `keydown` for the press lands within milliseconds of the signal, before it or, when the input
 * method answers late, just after it.
 */
export const SAME_PRESS_WINDOW_MS = 150;

/**
 * How long the page waits for a real `keydown` still on its way. The input method answers the
 * WebView asynchronously, which can put the real event after the signal: measured 0-14 ms
 * behind it on 2026-09-25, over twelve presses in a WKWebView running this bridge, and at most
 * 18 ms behind it over 29 presses in the app on 2026-09-26. Waiting over four times the worst of
 * that keeps such a press from being handled twice, at a cost below what a person notices on a
 * surface that is closing.
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
 *
 * A press is waited on once even mid-composition. An input method can end the composition with
 * the press and WebKit then deliver the key: concluding `composing` at the signal would never
 * stand in either way, but would tell the log a press went to the input method that the page
 * in fact received. (2-Set Korean on macOS 27 opens no composition at all in a WKWebView: its
 * key-downs arrive as jamo with keyCode 229 and no `compositionstart`, measured 2026-09-26.)
 */
export type NativeEscapeVerdict = 'delivered' | 'composing' | 'wait' | 'dispatch';

const within = (at: number | null, now: number) => at !== null && now - at <= SAME_PRESS_WINDOW_MS;

export function judgeNativeEscape(
  state: NativeEscapeState,
  now: number,
  { waited }: { waited: boolean },
): NativeEscapeVerdict {
  if (within(state.lastRealEscapeAt, now)) return 'delivered';
  if (!waited) return 'wait';
  if (state.composing || within(state.lastCompositionEndAt, now)) return 'composing';
  return 'dispatch';
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
  /** One native signal: its number, when it arrived. */
  interface Signal {
    press: number | null;
    at: number;
  }
  let pending: { signal: Signal; timer: ReturnType<typeof setTimeout> } | null = null;
  /*
   * The events this bridge dispatched. Every other Escape `keydown` is the WebView's: nothing
   * else in the app dispatches one. Named by exclusion rather than by `isTrusted` so the one
   * thing this bridge must never do — count its own event as the press it stands in for — is
   * stated exactly.
   */
  const dispatched = new WeakSet<Event>();
  /** What the bridge did with each recent press, for the native side's question. */
  const answers = new Map<number, string>();
  const answer = (signal: Signal, text: string) => {
    if (signal.press === null) return;
    answers.set(signal.press, text);
    if (answers.size > REMEMBERED_PRESSES) {
      const oldest = answers.keys().next();
      if (!oldest.done) answers.delete(oldest.value);
    }
  };

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

  /** Dispatches the stand-in and returns where it went, or `null` when there was nowhere. */
  const dispatchEscape = (): Element | null => {
    const focused = doc.activeElement ?? doc.body;
    if (!focused) return null;
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
    return focused;
  };

  const settle = (signal: Signal, waited: boolean) => {
    const at = now();
    const verdict = judgeNativeEscape(state, at, { waited });
    if (verdict === 'wait') {
      answer(signal, 'still waiting for a late key-down');
      pending = {
        signal,
        timer: setTimeout(() => {
          pending = null;
          settle(signal, true);
        }, LATE_KEYDOWN_GRACE_MS),
      };
      return;
    }
    if (verdict === 'delivered') {
      // When the press also ended (or met) a composition, the answer says so: that order is what
      // a person checking an input method's behaviour needs.
      const composition = state.composing
        ? '; a composition is still open'
        : state.lastCompositionEndAt !== null && within(state.lastCompositionEndAt, at)
          ? `; a composition ended ${signedMs(state.lastCompositionEndAt - signal.at)}`
          : '';
      answer(
        signal,
        `WebKit delivered it (${signedMs((state.lastRealEscapeAt ?? at) - signal.at)})${composition}`,
      );
      // A key-down answers one press: the next press, even a quick one, is judged on what
      // arrives for it.
      state.lastRealEscapeAt = null;
      return;
    }
    if (verdict === 'composing') {
      answer(
        signal,
        state.composing || state.lastCompositionEndAt === null
          ? 'a composition took it (still open)'
          : `a composition took it (ended ${signedMs(state.lastCompositionEndAt - signal.at)})`,
      );
      state.lastCompositionEndAt = null;
      return;
    }
    const landed = dispatchEscape();
    answer(
      signal,
      landed
        ? `stood in on ${describeElement(landed)} after ${Math.round(at - signal.at)} ms${
            doc.hasFocus() ? '' : ' (document not focused)'
          }`
        : 'nothing to stand in on',
    );
  };

  const onNativeEscape = (event: Event) => {
    const signal: Signal = { press: pressOf(event), at: now() };
    // A second press while the first is still waiting: the first is judged now, on what has
    // arrived so far, so neither press is lost.
    if (pending !== null) {
      const first = pending.signal;
      clearTimeout(pending.timer);
      pending = null;
      settle(first, true);
    }
    settle(signal, false);
  };

  const onVerdictQuestion = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== 'object') return;
    const question = detail as { press?: unknown; verdict?: unknown };
    const press = typeof question.press === 'number' ? question.press : null;
    question.verdict =
      (press !== null ? answers.get(press) : undefined) ?? 'the page got no signal for this press';
  };

  target.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('compositionstart', onCompositionStart, true);
  doc.addEventListener('compositionend', onCompositionEnd, true);
  target.addEventListener(NATIVE_ESCAPE_EVENT, onNativeEscape);
  target.addEventListener(NATIVE_ESCAPE_VERDICT_EVENT, onVerdictQuestion);
  return () => {
    if (pending !== null) clearTimeout(pending.timer);
    pending = null;
    target.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('compositionstart', onCompositionStart, true);
    doc.removeEventListener('compositionend', onCompositionEnd, true);
    target.removeEventListener(NATIVE_ESCAPE_EVENT, onNativeEscape);
    target.removeEventListener(NATIVE_ESCAPE_VERDICT_EVENT, onVerdictQuestion);
  };
}

/** The press number a native signal carries, or `null` from an older native side. */
function pressOf(event: Event): number | null {
  const detail: unknown = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== 'object') return null;
  const press = (detail as { press?: unknown }).press;
  return typeof press === 'number' && Number.isFinite(press) ? press : null;
}

/**
 * Where a stand-in went, for the log: the tag and its role, never an id, a name or any text,
 * so no vault content and nothing typed reaches the log.
 */
export function describeElement(element: Element): string {
  const role = element.getAttribute('role');
  return role ? `${element.tagName}[role=${role}]` : element.tagName;
}

/** `+12 ms` after the signal, `-3 ms` before it. */
function signedMs(delta: number): string {
  const rounded = Math.round(delta);
  return `${rounded >= 0 ? '+' : ''}${rounded} ms`;
}

function isTauriRuntime(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}
