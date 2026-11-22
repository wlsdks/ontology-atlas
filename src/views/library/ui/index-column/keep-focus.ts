/** The row that held focus, so it keeps focus when an update moves it out of the window. */
export interface HeldFocus {
  el: HTMLElement;
  key: string;
  slug: string | null;
  group: string | null;
}

/** A focused row an update took away hands focus to its page elsewhere, else its group's line. */
export function keepFocus(list: HTMLElement, held: HeldFocus | null): void {
  if (!held || held.el.isConnected) return;
  const active = document.activeElement;
  if (active && active !== document.body && list.ownerDocument.contains(active)) return;
  const stop = "[data-row-index]";
  const candidates = [
    `[data-glide-key="${CSS.escape(held.key)}"] ${stop}`,
    held.slug ? `[data-index-slug="${CSS.escape(held.slug)}"] ${stop}` : null,
    held.group ? `[data-index-group="${CSS.escape(held.group)}"] [data-index-more]` : null,
    stop,
  ];
  for (const selector of candidates) {
    const target = selector ? list.querySelector<HTMLElement>(selector) : null;
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
  }
}
