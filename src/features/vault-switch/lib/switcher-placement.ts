/**
 * Where the rail's folder switcher stands: beside the chip, and never over the map's chrome.
 *
 * Review, 2026-09-25 (1040, 1280, 1512 and 1920, INDEX open and collapsed): hung from the chip's
 * corner at the rail's right edge, the popover's rect was x69-485 y70-186 at every width. With
 * INDEX open it covered the whole INDEX search field and the folder line (49 of 49 samples);
 * with INDEX folded it covered the "Expand INDEX" tab (42 of 49); and its left edge at 69
 * straddled the INDEX card's edge at 88, so two floating surfaces overlapped by a few pixels -
 * the owner's "the position is odd, things overlap". Moving the anchor down the chip only moved
 * what it covered.
 *
 * The rule, from measured rectangles:
 * - **Beside the chip** by default (`gap` past the trigger's right edge, from its bottom edge).
 * - **Past every obstacle** (`[data-popover-obstacle]`: the INDEX panel or its collapsed tab)
 *   that the popover's column would cross, by the same gap - it opens in the free map, never
 *   over a panel.
 * - **Inside the map's toolbar box** (`[data-popover-boundary="free-map"]`) when one is on
 *   screen: the box already reserves INDEX, the node inspector and the dock seam, so its left
 *   edge is where the toolbar's own search lane starts, and the popover takes that same start
 *   line. It hangs below the box's bottom so no toolbar lane is under it.
 * - **Inside the viewport**, shrinking to the room there is (width and height).
 */
interface PlacementRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SwitcherPlacementInput {
  trigger: PlacementRect;
  viewport: { width: number; height: number };
  /** The map's top toolbar box, which spans the free map; `null` off the map. */
  toolbar: PlacementRect | null;
  /** Panels the popover must not cover (INDEX or its tab). */
  obstacles: readonly PlacementRect[];
  /** Preferred width in px. */
  width: number;
  /** Preferred maximum height in px. */
  maxHeight: number;
}

export interface SwitcherPlacement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/** Between the popover and whatever it stands beside (the chip, INDEX, the toolbar). */
export const SWITCHER_GAP = 8;
/** Kept clear at the viewport's own edges. */
const SWITCHER_VIEWPORT_INSET = 16;

export function placeSwitcher(input: SwitcherPlacementInput): SwitcherPlacement {
  const { trigger, viewport, toolbar, obstacles } = input;
  let left = trigger.right + SWITCHER_GAP;
  let top = trigger.bottom;
  let right = viewport.width - SWITCHER_VIEWPORT_INSET;
  if (toolbar) {
    left = Math.max(left, toolbar.left);
    right = Math.min(right, toolbar.right);
    top = Math.max(top, toolbar.bottom + SWITCHER_GAP);
  }
  // Obstacles sit at the map's left edge; step past each one the column would still cross.
  // Sorted so a tab and a panel side by side are both cleared in one pass.
  for (const obstacle of [...obstacles].sort((a, b) => a.left - b.left)) {
    if (obstacle.right <= left || obstacle.left >= left + input.width) continue;
    left = Math.max(left, obstacle.right + SWITCHER_GAP);
  }
  const width = Math.max(0, Math.min(input.width, right - left));
  const maxHeight = Math.max(0, Math.min(input.maxHeight, viewport.height - SWITCHER_VIEWPORT_INSET - top));
  return { left, top, width, maxHeight };
}

/** Reads the rectangles `placeSwitcher` needs from the page. */
export function measureSwitcherPlacement(
  trigger: HTMLElement,
  preferred: { width: number; maxHeight: number },
): SwitcherPlacement {
  const drawn = (element: Element | null): PlacementRect | null => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  };
  const obstacles = Array.from(document.querySelectorAll('[data-popover-obstacle]'))
    .map(drawn)
    .filter((rect): rect is PlacementRect => rect !== null);
  return placeSwitcher({
    trigger: trigger.getBoundingClientRect(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    toolbar: drawn(document.querySelector('[data-popover-boundary="free-map"]')),
    obstacles,
    ...preferred,
  });
}
