import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The behaviour side of `.ai-row-disclosure` (`app/globals.css`). The row stays mounted until its
 * exit ends, so a cancel leaves the way it arrived. Height is px from a ResizeObserver: `auto`
 * cannot interpolate and `0fr↔1fr` cannot carry a content swap. A collapsed body unmounts so it
 * leaves the tab order.
 */
export function useRowDisclosure(open: boolean): {
  /** Whether to render into the DOM — stays true while collapsing (exit transition). */
  mounted: boolean;
  open: boolean;
  boxRef: React.RefObject<HTMLDivElement | null>;
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
    const timer = window.setTimeout(() => {
      if (boxRef.current) boxRef.current.style.height = '0px';
      setMounted(false);
    }, readDisclosureExitMs());
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useLayoutEffect(() => {
    // Record the previous value before checking for the box: while closed the box is unmounted, so
    // updating after the guard leaves `previous` null and a user-initiated open is misread as a first
    // mount.
    const previous = previousOpenRef.current;
    previousOpenRef.current = open;

    const box = boxRef.current;
    if (!box) return undefined;
    const content = contentRef.current;
    const isTransition = previous !== null && previous !== open;

    if (!open) {
      // Preserve the fading content's space when height travel is disabled.
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
      // Closing: pin the start at a measured px value, then go to 0. Starting from
      // `auto` leaves the browser with no value to interpolate from, so the row
      // simply vanishes.
      if (isTransition) {
        box.style.height = `${box.getBoundingClientRect().height}px`;
        forceReflow(box);
      }
      box.style.height = '0px';
      return undefined;
    }

    if (!content) return undefined;

    if (!isTransition) {
      // A mount is not a transition: an already-open row does not unfold by itself, so no height is
      // measured (`offsetHeight` after a style write forces a reflow). No ResizeObserver: it only guards a
      // height pinned in px, and `auto` cannot clip.
      box.style.height = 'auto';
      return undefined;
    }

    // Reversing an unfinished close starts at its painted height, never at zero.
    const fromHeight = box.style.height ? box.getBoundingClientRect().height : 0;
    box.style.height = `${fromHeight}px`;
    if (fromHeight === 0) {
      content.style.transition = 'none';
      content.style.opacity = '0';
    }
    forceReflow(box);
    box.style.height = `${content.offsetHeight}px`;
    content.style.transition = '';
    content.style.opacity = '';

    if (typeof ResizeObserver === 'undefined') return undefined;
    // Content swaps and line-count changes ride the same curve; a height measured once would clip.
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
function readDisclosureExitMs(): number {
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
