/**
 * The rail's folder switcher stands beside its chip over a scrim from the rail's edge, inside
 * the viewport. No free chip-anchored room exists, so the layering is deliberate.
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
