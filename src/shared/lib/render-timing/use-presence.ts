"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Two presence gates that give a surface **a way out**.
 *
 * They live in one file because three surfaces (node datasheet, INDEX slot,
 * settings sheet) were each solving the same problem separately and two of them
 * were not solving it at all. Surfaces on the map must share **one exit window**
 * (`EXIT_WINDOW_MS`), and that fact has to be written in one place or the next
 * surface is born hard-cutting again.
 *
 * This window (140ms) is **an unmount timer, not a motion value** — CSS owns the
 * real exit duration (2/3 of the entry, ≈120ms). The extra 20ms keeps the last
 * frame from being clipped when the timer and the compositor disagree. It is not
 * a ramp token, so `--motion-*` is not read here.
 */
export const EXIT_WINDOW_MS = 140;

/**
 * Work finishing before this window draws nothing. Under 0.1s no delay is perceived; the extra
 * 50ms keeps slow frames from flickering the skeleton. A mount timer, not a `--motion-*` value.
 */
export const SKELETON_DELAY_MS = 150;

/**
 * Becomes `true` only if `active` outlives this window. Work that finishes first
 * never flips it, so nothing is ever drawn.
 */
export function useDelayedVisible(
  active: boolean,
  delayMs: number = SKELETON_DELAY_MS,
): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    /*
     * Reset during cleanup: setting state synchronously in the effect body
     * chains renders (lint warns). The return value is also multiplied by
     * `active`, so nothing leaks if the reset lands a tick late.
     */
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);
  return active && elapsed;
}

/**
 * One surface opening and closing. When `open` goes false, `mounted` is held
 * until the exit animation finishes, with `exiting` carrying the exit class in
 * the meantime.
 */
export function usePanelPresence(
  open: boolean,
  exitMs: number = EXIT_WINDOW_MS,
): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a presence gate is by definition "sync React state with an external system, the timer". Deriving it during render removes the exit window and the surface goes back to vanishing in one frame (measured 2026-07-28: INDEX panel delta 13.25 @17ms).
      setMounted(true);
      return;
    }
    // open=false: open the exit-animation window instead of unmounting now.
    const id = setTimeout(() => {
      setMounted(false);
    }, exitMs);
    return () => clearTimeout(id);
  }, [open, exitMs]);
  /*
   * Closed mounted frames are exiting immediately, before passive effects; an open frame must not
   * inherit exit lockout on an immediate reopen. The timer owns mounting only.
   */
  return { mounted, exiting: mounted && !open };
}

/**
 * Two surfaces taking turns in the same slot: outgoing and incoming must exist at once to
 * crossfade. `leaving` holds the previous value for the exit window; render it `inert`.
 */
export function useSurfaceSwap<T>(
  current: T,
  exitMs: number = EXIT_WINDOW_MS,
): { leaving: T | null } {
  const [swap, setSwap] = useState<{ current: T; leaving: T | null }>({ current, leaving: null });
  if (!Object.is(swap.current, current)) {
    setSwap({ current, leaving: swap.current });
  }
  useEffect(() => {
    if (swap.leaving === null) return;
    const id = setTimeout(
      () => setSwap((state) => (state.leaving === null ? state : { current: state.current, leaving: null })),
      exitMs,
    );
    return () => clearTimeout(id);
  }, [swap, exitMs]);
  return { leaving: Object.is(swap.current, current) ? swap.leaving : null };
}

/**
 * Prevents the box height snapping on a surface swap: restore the previous height, transition to
 * the new one, then return to `auto`. Skipped under `prefers-reduced-motion`.
 */
export function useSwapHeight<T>(token: T) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fromHeightRef = useRef<number | null>(null);

  /**
   * Called by **whoever causes the swap** — the previous height can only be
   * measured before the DOM changes, and the only code that knows that moment is
   * the handler changing the state. Measuring inside an effect already sees the
   * new layout, so it would always transition from a value to itself.
   */
  const capture = useCallback(() => {
    const host = hostRef.current;
    fromHeightRef.current = host ? host.getBoundingClientRect().height : null;
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const from = fromHeightRef.current;
    fromHeightRef.current = null;
    if (!host || from === null) return;
    const to = host.getBoundingClientRect().height;
    if (Math.abs(from - to) < 1) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    host.style.height = `${from}px`;
    // Forced reflow — without this line the browser coalesces the two
    // assignments and no transition happens.
    void host.offsetHeight;
    host.style.transition = "height var(--motion-base) var(--motion-ease)";
    host.style.height = `${to}px`;
    let done = false;
    const settle = (event?: Event) => {
      // `transitionend` bubbles. A child fading or the host's own color/opacity
      // transition must not clear this host's in-flight height early.
      if (
        event &&
        (event.target !== host || (event as TransitionEvent).propertyName !== 'height')
      ) {
        return;
      }
      if (done) return;
      done = true;
      host.style.height = "";
      host.style.transition = "";
      host.removeEventListener("transitionend", settle);
    };
    host.addEventListener("transitionend", settle);
    // Safety net: an interrupted transition (rapid tab clicks, unmount) would
    // otherwise leave the height pinned.
    const id = setTimeout(settle, 400);
    return () => {
      clearTimeout(id);
      settle();
    };
  }, [token]);

  return { hostRef, capture };
}

/**
 * Holds **the previous value** for the exit window.
 *
 * Wrapping in `<Surface open={Boolean(model)}>` keeps the surface alive through
 * the exit window, but **the parent supplies the content** — the moment `model`
 * becomes `null` the child renders empty, so the surface fades out prettily
 * around an empty box. Adding enter/exit motion ends up worse than not having it.
 *
 * So the value has to be held too. That is what "the parent's render gate has to
 * hold the model through the exit window, so it isn't mechanical" means, and why
 * this is a hook — reinvented per surface, one of them will be wrong.
 *
 * **Why render-phase adjustment rather than an effect.** Holding it in
 * `useEffect` is **one frame late**, and during that frame the child receives
 * `null` and flickers. Setting state during render is the "adjust state when a
 * prop changes" pattern React documents, and it re-renders before painting, so
 * there is no flicker. It needs a condition to avoid an infinite loop — that is
 * the `identity !== state.key` check below.
 */
export function useHeldValue<T>(value: T | null | undefined, key?: string | number | null): T | null {
  /*
   * Compare by key, not identity: a consumer whose value is recreated each render would loop
   * forever. When holding an object pass a primitive key.
   */
  const identity = key ?? (value as unknown as string | number | null | undefined) ?? null;
  const [state, setState] = useState<{ key: unknown; value: T | null }>({
    key: value == null ? null : identity,
    value: value ?? null,
  });
  if (value != null && identity !== state.key) {
    // setState during render — React re-renders immediately and paints once.
    setState({ key: identity, value });
  }
  return value ?? state.value;
}
