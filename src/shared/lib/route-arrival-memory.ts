"use client";

import { useCallback, useState } from "react";

/**
 * **What a pane already knows, kept across a route change.**
 *
 * ## The defect this exists for (owner, 2026-09-12)
 *
 * *"When this right-hand area switches there are situations where it loads with a strange
 * flicker."* Measured on the static export at 1512×901 with the installed app's runtime
 * injected and every native answer costing 120 ms
 * (`tests/e2e/desktop-rail-arrival-harness.ts`), arriving at History from the rail:
 *
 * | | first arrival | **second arrival** |
 * |---|---|---|
 * | loading skeleton + connect stepper on screen | 43-282 ms | **43-278 ms** |
 * | workbench | 285 ms | **283 ms** |
 * | native commands re-issued | `git_probe` `git_status` `git_diff` `git_history` | **the same four** |
 *
 * The second row is the whole point: **nothing was remembered.** A screen the app had already
 * read, laid out and shown was thrown away on the way out and rebuilt from zero on the way
 * back in, so the same 240 ms of skeleton was paid every single time.
 *
 * ## Why that reads as a flicker rather than as loading
 *
 * A rail navigation runs inside `document.startViewTransition`
 * (`shared/lib/route-view-transition.ts`). The browser captures the **new** state when the
 * update callback resolves — about 25-40 ms after the click, while the arriving pane is still
 * its own fallback — and crossfades the old screen into that capture over `--motion-base`.
 * While the transition runs the live document is not painted. So the sequence a person
 * actually sees is:
 *
 *   old screen --(180 ms crossfade)--> **the skeleton** --(hard cut)--> the real screen
 *
 * Two events where the design system promised one, and the second one has no motion at all.
 * The crossfade is not wasted time, it is spent on the wrong picture. Lengthening it, delaying
 * the fallback, or fading the fallback out would all still be two events; the only way to get
 * one is for the arriving pane to **be the real screen when it is captured**.
 *
 * ## The shape
 *
 * This is a `useState` whose first value is the last value the same key resolved to in this
 * tab. A returning pane therefore mounts already showing what it showed when the person left,
 * its own refresh runs exactly as before, and the new value replaces the old **in place** —
 * no stage change, no fallback, nothing for the capture to catch.
 *
 * ⚠️ **It is memory, not a cache with a policy.** There is no expiry and no revalidation
 * here on purpose: every caller already re-reads on mount, and the files on disk stay the
 * authority (`.claude/rules/local-first.md`). What is remembered is only *what to draw during
 * the few hundred milliseconds before the fresh answer lands* — which is exactly what a
 * skeleton was drawing, only with the truth from a moment ago instead of nothing.
 *
 * ⚠️ **It is not a timer.** Nothing here delays a fallback or hides a slow answer. A genuine
 * first arrival, with nothing remembered, still shows its fallback for as long as the work
 * really takes — that fallback is honest and stays.
 *
 * ⚠️ **Key the memory on what the value describes.** The vault identity boundary in
 * `app/providers/AppShell.tsx` exists because a pane once painted one vault's data while
 * another was mounted. Remembering a value under a key that does not name its vault would
 * recreate exactly that defect, so `null` is accepted as "do not remember this" and a
 * changed key re-derives during render rather than in an effect (an effect would cost the
 * extra painted frame this module exists to remove).
 *
 * Memory lives for the life of the tab. It is deliberately not `sessionStorage`: a value from
 * a previous run of the app would be drawn before anything had verified the folder still says
 * so, and that is a different and worse defect than a skeleton.
 */
const memory = new Map<string, unknown>();

/** The last value remembered under `key`, or `undefined` if there is none. */
export function readArrivalMemory<T>(key: string): T | undefined {
  return memory.has(key) ? (memory.get(key) as T) : undefined;
}

/** Remembers `value` under `key` for the life of the tab. */
export function writeArrivalMemory<T>(key: string, value: T): void {
  memory.set(key, value);
}

/** Test-only: forgets everything, so one case cannot seed the next. */
export function clearArrivalMemory(): void {
  memory.clear();
}

/**
 * A `useState` that survives the unmount a route change causes.
 *
 * @param key what the value describes — `null` means "do not remember", which is the right
 *   answer while the thing it would describe (a vault path, a folder) is not known yet.
 * @param fallback the value to use when nothing has been remembered under this key.
 */
export function useArrivalMemory<T>(
  key: string | null,
  fallback: T,
): [T, (next: T) => void] {
  const resolve = (forKey: string | null): T =>
    forKey === null ? fallback : (readArrivalMemory<T>(forKey) ?? fallback);

  const [entry, setEntry] = useState<{ key: string | null; value: T }>(() => ({
    key,
    value: resolve(key),
  }));

  /*
   * **A stable identity, like the `useState` setter this replaces.**
   *
   * Callers put this in their effect and callback dependency lists, so a `useCallback` keyed
   * on `key` would re-run those reads whenever a vault path changed — for nothing, since the
   * function's behaviour is identical. The key it needs is already inside the state, and the
   * render-phase adjustment below keeps `entry.key` equal to `key`, so reading it from the
   * updater's `previous` is both current and dependency-free.
   *
   * ⚠️ **The write is deferred out of the updater, not called from it.** React may run an
   * updater during render, and `tests/contract/pure-updater.contract.test.ts` forbids a side
   * effect there — a rule this repository paid for twice on 2026-08-13, when the studio's
   * autosave dispatched an event mid-render. That contract names the remedy it accepts, and a
   * microtask is early enough by a wide margin: nothing reads this memory until some later
   * mount asks what to draw.
   *
   * `useEffectEvent` was tried first and is not available here: the lint rule refuses to let
   * one be returned from a hook ("cannot be assigned to a variable or passed down").
   */
  const set = useCallback((next: T) => {
    setEntry((previous) => {
      const forKey = previous.key;
      if (forKey !== null) queueMicrotask(() => writeArrivalMemory(forKey, next));
      return { key: forKey, value: next };
    });
  }, []);

  /*
   * The key changed, so the value on screen describes something else. Deriving the new
   * key's value **during this render** is React's documented adjustment pattern, and it is
   * the only option that costs no extra paint: an effect would commit one frame showing the
   * previous key's value, which is the class of defect this module removes.
   */
  if (entry.key !== key) {
    const value = resolve(key);
    setEntry({ key, value });
    return [value, set];
  }

  return [entry.value, set];
}
