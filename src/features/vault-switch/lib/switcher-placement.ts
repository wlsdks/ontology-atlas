/** No free chip-anchored room exists, so the layering over the scrim is deliberate. */
interface PlacementRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SwitcherPlacementInput {
  trigger: PlacementRect;
  rail: PlacementRect;
  viewport: { width: number; height: number };
  width: number;
  maxHeight: number;
}

export interface SwitcherPlacement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  scrimLeft: number;
}

export const SWITCHER_GAP = 8;
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
