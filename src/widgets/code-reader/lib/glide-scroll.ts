import { easeMotion } from "@/shared/motion/ease";
import { MOTION } from "@/shared/motion";

const GLIDE_MS = MOTION.slow.duration * 1000;
/** The person's own scrolling takes over from a glide at once. */
const TAKEOVER_EVENTS = ["wheel", "pointerdown", "keydown", "touchstart"] as const;

/** Where a glide from `fromPx` to `toPx` stands after `elapsedMs`, on the `--motion-slow` clock. */
export function glidePosition(fromPx: number, toPx: number, elapsedMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / GLIDE_MS));
  return fromPx + (toPx - fromPx) * easeMotion(progress);
}

/**
 * Scrolls `box` to `topPx` over `--motion-slow`, starting from where it stands now, so a second
 * choice mid-glide continues instead of restarting. Returns the cancel.
 */
export function glideScroll(box: HTMLElement, topPx: number): () => void {
  const fromPx = box.scrollTop;
  const startMs = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of TAKEOVER_EVENTS) box.removeEventListener(type, stop);
  };
  const step = (nowMs: number) => {
    const elapsedMs = nowMs - startMs;
    box.scrollTop = glidePosition(fromPx, topPx, elapsedMs);
    if (elapsedMs < GLIDE_MS) frame = requestAnimationFrame(step);
    else stop();
  };
  for (const type of TAKEOVER_EVENTS) box.addEventListener(type, stop, { passive: true });
  frame = requestAnimationFrame(step);
  return stop;
}
