import { EXIT_TRANSITION, MOTION } from "@/shared/motion";

/**
 * The index column's motion, on the Web Animations API so every move starts from the value last
 * drawn: a fade or glide that is asked again mid-flight continues instead of restarting.
 */

const running = new WeakMap<Element, Map<string, Animation>>();

function cubic([x1, y1, x2, y2]: readonly number[]): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

function canAnimate(el: Element): el is HTMLElement {
  return typeof (el as HTMLElement).animate === "function";
}

/** Cancels the named motion on `el` and holds `next` in its place; read what it drew before calling. */
function takeOver(el: HTMLElement, name: string, next: Animation | null): void {
  const byName = running.get(el) ?? new Map<string, Animation>();
  byName.get(name)?.cancel();
  if (next) byName.set(name, next);
  else byName.delete(name);
  running.set(el, byName);
}

/** Fades a whole view in or out from its current opacity; leaving accelerates away. Instant when reduced. */
export function fadeView(el: Element, visible: boolean): void {
  if (!canAnimate(el)) return;
  const from = Number.parseFloat(getComputedStyle(el).opacity);
  const to = visible ? 1 : 0;
  const timing = visible ? MOTION.base : EXIT_TRANSITION;
  const animation = el.animate([{ opacity: Number.isFinite(from) ? from : 1 - to }, { opacity: to }], {
    duration: prefersReducedMotion() ? 0 : timing.duration * 1000,
    easing: cubic(timing.ease),
    fill: "forwards",
  });
  takeOver(el, "fade", animation);
}

/** Sets a moved row down where it now belongs, starting `offsetPx` above or below it. */
export function glideFrom(el: Element, offsetPx: number): void {
  if (!canAnimate(el) || prefersReducedMotion()) return;
  const drawn = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
  const from = offsetPx + (Number.isFinite(drawn) ? drawn : 0);
  if (Math.abs(from) < 0.5) return;
  const animation = el.animate([{ transform: `translateY(${from}px)` }, { transform: "none" }], {
    duration: MOTION.settle.duration * 1000,
    easing: cubic(MOTION.settle.ease),
  });
  takeOver(el, "glide", animation);
  animation.onfinish = () => takeOver(el, "glide", null);
}

/** A row new to the data fades in where it lands; rows that only scrolled into view do not. */
export function arriveInPlace(el: Element): void {
  if (!canAnimate(el) || prefersReducedMotion()) return;
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.base.duration * 1000, easing: cubic(MOTION.base.ease) });
}
