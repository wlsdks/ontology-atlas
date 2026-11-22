const DRAG_DISMISS_OFFSET_PX = 120;
const DRAG_DISMISS_VELOCITY_PX_PER_SECOND = 500;

/** A downward swipe from the handle closes the drawer by distance or by a quick flick. */
export function shouldDismissOnDrag(offsetY: number, velocityY: number): boolean {
  return offsetY > DRAG_DISMISS_OFFSET_PX || velocityY > DRAG_DISMISS_VELOCITY_PX_PER_SECOND;
}

/** A press outside the drawer dismisses it unless it lands on another interactive overlay. */
export function isPressOutsideDrawer(target: Element | null, drawer: Element | null): boolean {
  if (!target) return false;
  if (drawer?.contains(target)) return false;
  return !target.closest('[data-interactive-overlay="true"]');
}

/**
 * Where Tab or Shift+Tab must wrap to keep focus inside the drawer: the last item when
 * shifting back from the first, the first when tabbing on from the last, otherwise nowhere.
 */
export function focusTrapTarget(
  focusable: readonly HTMLElement[],
  active: Element | null,
  shiftKey: boolean,
): HTMLElement | null {
  const items = focusable.filter((element) => !element.hasAttribute("disabled"));
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  if (shiftKey) return active === first ? last : null;
  return active === last ? first : null;
}

/** A plain left click stays in this tab; a modified or non-primary click keeps the browser's behaviour. */
export function isPlainLeftClick(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);
}
