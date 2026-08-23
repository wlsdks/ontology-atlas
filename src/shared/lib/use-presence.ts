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
 * **Do not draw a loading indicator for work that takes 0ms.**
 *
 * Measured 2026-08-08 (owner report: *"Three grey lines appear and vanish, right? It flickers away in well under a second"* — three grey lines appear and vanish, a
 * flicker gone in well under a second): switching documents in the workspace
 * drew the viewer's 3-line skeleton for **8.2–15.9ms** (median 9.7ms), inside a
 * single 60Hz frame (16.7ms). It happened on all 8 transitions.
 *
 * The cause is not slow loading. The parent remounts the viewer via
 * `key={doc.slug}`, so body state restarts at `null` every time, and even when
 * the body is already in memory the promise resolves on the next tick — so
 * **the skeleton wins at least one frame**. It was telling the user to wait when
 * there was nothing to wait for.
 *
 * So anything finishing before this window elapses **draws nothing at all**.
 *
 * The value comes from Nielsen (1993): under 0.1s a person perceives no delay,
 * so there is nothing to announce. The extra 50ms keeps a couple of slow frames
 * from tripping the skeleton back into a flicker, and a genuinely slow read
 * still gets its indicator far ahead of the 1-second "train of thought breaks"
 * boundary.
 *
 * Same category as `EXIT_WINDOW_MS` — **a mount timer, not a motion value**, so
 * it does not read the `--motion-*` ramp.
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
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a presence gate is by definition "sync React state with an external system, the timer". Deriving it during render removes the exit window and the surface goes back to vanishing in one frame (measured 2026-07-28: INDEX panel delta 13.25 @17ms).
      setMounted(true);
      setExiting(false);
      return;
    }
    // open=false: open the exit-animation window instead of unmounting now.
    setExiting(true);
    const id = setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, exitMs);
    return () => clearTimeout(id);
  }, [open, exitMs]);
  return { mounted, exiting };
}

/**
 * Two surfaces **taking turns in the same slot**. Unlike the gate above, the
 * outgoing and incoming surfaces must exist **at the same time** for a
 * crossfade to happen at all.
 *
 * Why it is needed (frame measurement, 2026-07-28): collapsing INDEX made the
 * thing the user actually clicked (300px wide, 23% of the viewport) disappear in
 * one frame with `animation: none · opacity 1` (delta 13.25 @17ms), while the
 * map — merely the consequence — got a 217ms ease. Only the arriving surface had
 * entry grammar; the departing one had nothing. That is charter rule ① exactly:
 * a hard-cut winner over an eased background is a defect.
 *
 * `leaving` holds the previous value for the exit window. Consumers draw both
 * frames stacked in the same slot and give the outgoing one `inert` +
 * `pointer-events-none`.
 */
export function useSurfaceSwap<T>(
  current: T,
  exitMs: number = EXIT_WINDOW_MS,
): { leaving: T | null } {
  const [leaving, setLeaving] = useState<T | null>(null);
  const previousRef = useRef(current);
  useEffect(() => {
    if (previousRef.current === current) return;
    const previous = previousRef.current;
    previousRef.current = current;
    // The previous value is only knowable **after** the swap has happened —
    // during render the comparison cannot be made at all (same reason as
    // `usePanelPresence` above).
    setLeaving(previous);
    const id = setTimeout(() => setLeaving(null), exitMs);
    return () => clearTimeout(id);
  }, [current, exitMs]);
  return { leaving };
}

/**
 * Keeps **the box from jumping** when a surface is swapped.
 *
 * Measured 2026-07-28 (insights tab switch): the content crossfaded correctly on
 * `--motion-fast` (first frame 5.4%, ramp ~120ms), but in the same frame the
 * container height went `878.5 → 605` in **one frame** and the whole document
 * jumped 246px. The crossfade **did not wrap the reflow** — the text bleeds
 * through while the box snaps.
 *
 * The technique matches the list-row expansion contract: right after the swap,
 * restore the previous height, transition in one step (`--motion-base`) to the
 * measured new height, then hand it back to `auto`. Layout is never pinned
 * permanently, so responsive behaviour and scrolling are untouched.
 *
 * **Not applied under `prefers-reduced-motion`** — height is the axis that
 * shakes, and that is exactly the axis those users need removed. The content
 * crossfade stays, so "what changed" is still readable.
 *
 * Zero new duration/easing values — ramp tokens are only referenced inline.
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
    const settle = () => {
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
   * ★ **Compare by key, not by identity** — learned by measurement 2026-08-03.
   *
   * The first version compared `value !== held`, and attaching it to the map's
   * edge panel **killed the whole map with React #301 (infinite re-render)**.
   * The consumer's model was a `useMemo` whose identity was recreated on every
   * render, so `setState` ran on every render and the loop never ended.
   *
   * Hence the key requirement. When holding an object, pass a **primitive** that
   * identifies the surface (e.g. `` `${sourceId}→${targetId}` ``). With no key
   * the value itself is used as the key, so **a non-primitive value must always
   * be given one**.
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
