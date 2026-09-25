import { useEffect } from "react";

export interface GlobalSearchHotkeyOptions {
  /**
   * Disable the hotkey binding itself (used on a controlled mount, where an external
   * hotkey manages the open state).
   */
  disabled?: boolean;
}

/**
 * Is this ⌘K (Ctrl+K elsewhere), with or without Shift.
 *
 * **One search, one key** (2026-09-26). ⇧⌘K used to be a second row in the shortcut sheet —
 * "search concepts, docs and projects together" beside ⌘K's "open the search palette" — left
 * over from when the map's ⌘K opened a project-only palette and this search lived on ⇧⌘K. The
 * map has opened this one search on both keys since then, so two rows taught two searches that
 * were the same dialog. The sheet now teaches ⌘K alone; Shift is accepted, never required, so a
 * hand that learned ⇧⌘K still lands here.
 *
 * **The key's position, not only its character.** With a Korean input source the K key emits a
 * Hangul jamo, so `event.key` is never `k`, and with Shift held it is `K`: the character check
 * alone was dead in both cases. `event.code` is the position and does not move with the input
 * source (the same reason as `useTypingShortcuts`).
 */
export function isGlobalSearchHotkey(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey">,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  return event.code === "KeyK" || event.key.toLowerCase() === "k";
}

/**
 * ⌘K (mac) / Ctrl+K (elsewhere) — the global search toggle hotkey.
 *
 * Inert inside input, textarea and contentEditable — except that closing an already
 * open search is allowed, so ⌘K closes from within the search input.
 *
 * With disabled=true the binding is inert (a controlled mount where an external hotkey
 * manages open).
 */
export function useGlobalSearchHotkey(
  open: boolean,
  setOpen: (next: boolean) => void,
  options: GlobalSearchHotkeyOptions = {},
) {
  const { disabled = false } = options;
  useEffect(() => {
    if (disabled) return;
    const handler = (event: KeyboardEvent) => {
      if (!isGlobalSearchHotkey(event)) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (isEditable && !open) return;
      event.preventDefault();
      setOpen(!open);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen, disabled]);
}
