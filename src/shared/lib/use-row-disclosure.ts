'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Expand/collapse for a list row — the lifecycle that puts **opening, closing, and
 * content swaps through one height transition.** The visual grammar's source of
 * truth is the `.ai-row-disclosure` family in `app/globals.css`; this hook is the
 * **behaviour** side, shared by everything that uses that grammar.
 *
 * It moved down to `shared` from the AI-connection vendor row: the insights queue
 * row does the same interaction (edit one field inline, save or cancel), and a
 * second implementation would make the same behaviour look different per surface.
 * With the curve, the exit duration, and the ResizeObserver re-measure in one place,
 * "the same behaviour looks the same" is structural rather than a matter of
 * discipline.
 *
 * Why go to this length: for a cancel to read as cancelled, the card has to leave
 * **the way it arrived**. Conditional rendering alone gives it no way out — it just
 * vanishes. So the row stays in the DOM after `open` turns false, until the exit
 * transition finishes.
 *
 * Height is driven in px for the reasons recorded in the `.ai-row-disclosure`
 * comment: `auto` cannot be interpolated, and `0fr↔1fr` cannot carry a content swap
 * (draft form → saved confirmation). Writing the real content height continuously
 * from a ResizeObserver puts open, close, swap, and reflow all on the same curve.
 *
 * Why not a permanent mount: the body of a collapsed row (inputs and the like)
 * would stay in the screen-reader output and the tab order. What is not visible
 * must not be reachable either.
 */
export function useRowDisclosure(open: boolean): {
  /** Whether to render into the DOM — stays true while collapsing (exit transition). */
  mounted: boolean;
  open: boolean;
  /** The `.ai-row-disclosure` box, i.e. the element whose height transitions. */
  boxRef: React.RefObject<HTMLDivElement | null>;
  /** The `.ai-row-disclosure-body` content, i.e. where the real height comes from. */
  contentRef: React.RefObject<HTMLDivElement | null>;
} {
  const [mounted, setMounted] = useState(open);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Open state at the previous commit. `null` means nothing has been rendered yet,
  // so that commit is a *state*, not a *transition*: an already-open row unfolding
  // by itself as it appears is motion the user never asked for.
  const previousOpenRef = useRef<boolean | null>(null);

  // An open request mounts in the same commit — content arriving one frame later
  // shows an empty gap between the click and the response.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return undefined;
    // Exit: unmount after the transition ends. The CSS token owns the duration, so
    // it is read rather than copied here — a copy would drift silently.
    const timer = window.setTimeout(() => setMounted(false), readDisclosureExitMs());
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    // Record the previous value **before** checking for the box. While closed the
    // box is unmounted, so putting this update after the guard below leaves
    // `previous` at `null` forever — and then a user-initiated open (closed →
    // open) is misread as a first mount and the animation dies. That regression
    // happened on 2026-07-28; the "닫힘 → 열림" case (closed → open) in
    // `use-row-disclosure.test.tsx` caught it.
    const previous = previousOpenRef.current;
    previousOpenRef.current = open;

    const box = boxRef.current;
    if (!box) return undefined;
    const content = contentRef.current;
    const isTransition = previous !== null && previous !== open;

    if (!open) {
      // Closing: pin the start at a measured px value, then go to 0. Starting from
      // `auto` leaves the browser with no value to interpolate from, so the row
      // simply vanishes.
      if (isTransition) {
        box.style.height = `${box.scrollHeight}px`;
        forceReflow(box);
      }
      box.style.height = '0px';
      return undefined;
    }

    if (!content) return undefined;

    if (!isTransition) {
      // **A mount is not a transition** — an already-open row does not unfold by
      // itself. That also removes any reason to measure the height here: under
      // `auto` the content takes its own space and nothing is clipped.
      //
      // What measuring would cost (trace measured 2026-07-28): `offsetHeight` is a
      // layout read **immediately after a style write**, i.e. a forced reflow. A
      // datasheet holds several such rows, each doing it in its own effect, which
      // becomes layout thrashing — **61ms of the 62ms** of forced reflow on a single
      // node click was this hook (Chrome ForcedReflow insight, top cause).
      //
      // No ResizeObserver here either. That exists to stop a height **pinned** in px
      // from clipping when the content changes, and `auto` cannot clip in the first
      // place. The first toggle (a real transition) measures and starts observing.
      box.style.height = 'auto';
      return undefined;
    }

    box.style.height = '0px';
    forceReflow(box);
    box.style.height = `${content.offsetHeight}px`;

    if (typeof ResizeObserver === 'undefined') return undefined;
    // Content swaps (a successful save turning the form into a confirmation line, a
    // 3-line caption becoming 1) and width changes that alter the line count ride
    // the same curve. Measuring the height once and pinning it starts clipping from
    // that moment on.
    const observer = new ResizeObserver(() => {
      box.style.height = `${content.offsetHeight}px`;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [open, mounted]);

  return { mounted, open, boxRef, contentRef };
}

/** Commits the start value to the browser. Without this read the two style writes
 *  coalesce into one frame and the transition is skipped entirely. */
function forceReflow(element: HTMLElement): void {
  void element.getBoundingClientRect().height;
}

/**
 * The exit duration. `--motion-base` is the single source of truth and JS **reads**
 * it. Cached at module level: the token does not change at runtime, and calling
 * getComputedStyle per row would force a layout on every expand.
 */
let disclosureExitMs: number | null = null;
export function readDisclosureExitMs(): number {
  if (disclosureExitMs !== null) return disclosureExitMs;
  const fallback = 180;
  if (typeof window === 'undefined') return fallback;
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--motion-base')
    .trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  disclosureExitMs = raw.endsWith('ms') ? value : value * 1000;
  return disclosureExitMs;
}
