export type LanePopoverAlign = "start" | "end";

/**
 * Which edge of a lane chip a popover `widthPx` wide hangs from: its right corner while the
 * popover starts inside the free map, else its left. The free map is the closest
 * `[data-popover-boundary]` (the toolbar), or the window.
 */
export function resolveLanePopoverAlign(root: HTMLElement | null, widthPx: number): LanePopoverAlign {
  if (!root) return "end";
  const chip = root.getBoundingClientRect();
  const boundary = root.closest<HTMLElement>("[data-popover-boundary]")?.getBoundingClientRect();
  const left = boundary ? boundary.left : 0;
  const right = boundary ? boundary.right : window.innerWidth;
  if (chip.right - widthPx >= left) return "end";
  // Rightward when it fits, and otherwise when it overlaps less (the boundary's right edge is the
  // window's).
  return chip.left + widthPx <= right || chip.left - left < right - chip.right ? "start" : "end";
}
