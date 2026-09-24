import { useEffect, type RefObject } from "react";

import { MOTION } from "@/shared/motion";

/** The rise a pane arrives with: small enough to read as the same place, not a new screen. */
const ARRIVAL_RISE_PX = 6;

/**
 * **The reader's pane arrives instead of appearing** (design sweep, 2026-09-25).
 *
 * Measured by polling `document.getAnimations()` every 16ms while opening a wiki row,
 * pressing *Close page* and switching tabs: only hover colour transitions ran. The graph
 * and the reading pane swapped in one frame, which is the hard cut `.claude/rules/design.md`
 * refuses.
 *
 * Each time `key` changes, the element that `ref` now points at plays one entrance on the
 * Web Animations API: opacity and a 6px rise on `--motion-base` with the entry curve, read
 * from the JS mirror of the CSS ramp (`src/shared/motion`). Under reduced motion it is the
 * crossfade alone — the axis that moves is the one reduced motion removes, the change is
 * still visible as a change. Nothing remounts: the pane keeps its scroll and its state, the
 * animation only restarts.
 *
 * The first render does not animate — a page that loads with a document open is arriving
 * as a page, not as a change inside one.
 */
export function usePaneArrival(ref: RefObject<HTMLElement | null>, key: string): void {
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof node.animate !== "function") return;
    if (!node.dataset.paneArrivalSeen) {
      node.dataset.paneArrivalSeen = key;
      return;
    }
    if (node.dataset.paneArrivalSeen === key) return;
    node.dataset.paneArrivalSeen = key;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const [x1, y1, x2, y2] = MOTION.base.ease;
    const animation = node.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateY(${ARRIVAL_RISE_PX}px)` },
            { opacity: 1, transform: "none" },
          ],
      {
        duration: MOTION.base.duration * 1000,
        easing: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`,
      },
    );
    return () => animation.cancel();
  }, [ref, key]);
}
