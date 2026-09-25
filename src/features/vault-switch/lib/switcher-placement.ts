/**
 * Where the rail's folder switcher stands: **beside its chip, over a dimmed workspace.**
 *
 * Two placements were measured and both failed, for opposite reasons (reviews, 2026-09-25):
 *
 * 1. Hung from the chip's corner (x69-485 y70-186 at every width), it covered the INDEX search
 *    field and folder line, or the collapsed INDEX tab, with its edge straddling the INDEX
 *    card's - two equal-weight floating surfaces colliding.
 * 2. Stepped past INDEX onto the map toolbar's start line (x412-828), it covered the fitted
 *    graph's top node and its label at 1040 and 1280, and it stood ~350px from its chip under
 *    the toolbar's Expand all / Auto-arrange buttons, so it read as their dropdown.
 *
 * There is no free, chip-anchored room to find: the rail column holds the destinations, INDEX
 * (or its tab) abuts the rail, and the toolbar and the fitted graph fill the rest. So the rule
 * stops looking for a gap and makes the layering deliberate:
 * - **Beside the chip**: `gap` past the rail's right edge, top aligned with the chip's top, so
 *   it is plainly the chip's surface at every width, INDEX open or folded.
 * - **Over a scrim** that starts at the rail's right edge (`scrimLeft`): whatever the popover
 *   stands on - INDEX, the tab, the map - is dimmed and takes no input while it is open, which
 *   is the design system's rule for one surface owning the action ("blocking surfaces dim or
 *   suppress the rest"). The rail stays lit so the chip and its popover read as one thing.
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
  /** The rail the chip lives in; its right edge is where the popover and the scrim start. */
  rail: PlacementRect;
  viewport: { width: number; height: number };
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
  /** Where the dimming scrim begins: the rail's right edge. */
  scrimLeft: number;
}

/** Between the rail's edge and the popover. */
export const SWITCHER_GAP = 8;
/** Kept clear at the viewport's own edges. */
const SWITCHER_VIEWPORT_INSET = 16;

export function placeSwitcher(input: SwitcherPlacementInput): SwitcherPlacement {
  const { trigger, rail, viewport } = input;
  const scrimLeft = Math.round(rail.right);
  const left = scrimLeft + SWITCHER_GAP;
  const top = Math.round(trigger.top);
  const width = Math.max(0, Math.min(input.width, viewport.width - SWITCHER_VIEWPORT_INSET - left));
  const maxHeight = Math.max(0, Math.min(input.maxHeight, viewport.height - SWITCHER_VIEWPORT_INSET - top));
  return { left, top, width, maxHeight, scrimLeft };
}

/** Reads the rectangles `placeSwitcher` needs from the page. */
export function measureSwitcherPlacement(
  trigger: HTMLElement,
  preferred: { width: number; maxHeight: number },
): SwitcherPlacement {
  const triggerRect = trigger.getBoundingClientRect();
  const railElement = trigger.closest('[data-testid="app-nav-rail"]');
  return placeSwitcher({
    trigger: triggerRect,
    rail: railElement ? railElement.getBoundingClientRect() : triggerRect,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    ...preferred,
  });
}
