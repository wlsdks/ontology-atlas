/**
 * Coalesces triggers arriving several times within one frame into a single
 * requestAnimationFrame callback.
 *
 * Wiring a high-frequency event — a camera 'updated' firing several times per frame
 * during pan/zoom/animate — straight into React state does the same work repeatedly
 * within one frame. However many times `trigger()` is called, the callback runs at
 * most once before the next paint, capping re-renders at the display refresh rate.
 *
 * `cancel()` drops a scheduled frame; call it from effect cleanup so the callback
 * cannot run after unmount.
 */
export function coalesceRaf(fn: () => void): {
  trigger: () => void;
  cancel: () => void;
} {
  let rafId: number | null = null;
  return {
    trigger() {
      if (rafId !== null) return; // Already scheduled this frame — coalesce.
      rafId = requestAnimationFrame(() => {
        rafId = null;
        fn();
      });
    },
    cancel() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
