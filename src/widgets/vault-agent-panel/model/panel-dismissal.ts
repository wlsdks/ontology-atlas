/** Escape counts only from inside the panel and never while an IME is composing. */
export function isEscapeInsidePanel(
  event: Pick<KeyboardEvent, 'key' | 'isComposing' | 'defaultPrevented' | 'target'>,
  panel: HTMLElement | null,
): boolean {
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return false;
  return Boolean(panel && event.target instanceof Node && panel.contains(event.target));
}

/** The control that had focus outside the panel when it opened, or none. */
export function openerToRemember(
  active: Element | null,
  panel: HTMLElement | null,
): HTMLElement | null {
  return active instanceof HTMLElement && active !== document.body && !panel?.contains(active)
    ? active
    : null;
}

/**
 * Whether focus already sits on a real control outside the panel when it closes: a close pressed on
 * the toolbar toggle leaves focus on that toggle, where it belongs.
 */
export function focusIsOutsidePanel(focused: Element | null, panel: HTMLElement | null): boolean {
  return Boolean(focused && focused !== document.body && !panel?.contains(focused));
}
