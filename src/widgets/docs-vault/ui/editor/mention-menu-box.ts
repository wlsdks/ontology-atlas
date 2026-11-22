export const MENTION_MENU_WIDTH = 320;
export const MENTION_MENU_MAX_HEIGHT = 280;

export const MENTION_MENU_CLASS =
  'pointer-events-auto absolute z-10 overflow-hidden rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--chrome-shadow)]';

export function mentionMenuStyle(at: { top: number; left: number } | null) {
  return { width: MENTION_MENU_WIDTH, top: at?.top ?? 0, left: at?.left ?? 0 };
}
