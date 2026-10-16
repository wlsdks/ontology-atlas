import { MOTION } from "@/shared/motion";

const curve = (ease: readonly number[]) => `cubic-bezier(${ease.join(", ")})`;
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const afterPanelArrival = () => (reduced() ? 0 : MOTION.base.duration * 1000);

export function landInk(node: HTMLElement | null): void {
  if (!node || typeof node.animate !== "function") return;
  const ghost = getComputedStyle(node).getPropertyValue("--color-text-quaternary").trim();
  if (!ghost) return;
  const still = reduced();
  node.animate([{ color: ghost }, {}], {
    duration: (still ? MOTION.fast : MOTION.settle).duration * 1000,
    delay: afterPanelArrival(),
    easing: still ? "linear" : curve(MOTION.settle.ease),
    fill: "backwards",
  });
}

export function countIn(node: HTMLElement | null): void {
  if (!node || typeof node.animate !== "function") return;
  const still = reduced();
  node.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: MOTION.fast.duration * 1000,
    delay: afterPanelArrival(),
    easing: still ? "linear" : curve(MOTION.fast.ease),
    fill: "backwards",
  });
}
