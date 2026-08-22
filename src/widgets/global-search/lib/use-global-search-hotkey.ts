import { useEffect } from "react";

export interface GlobalSearchHotkeyOptions {
  /**
   * Requires shift to be held as well. Defaults to false (plain ⌘K).
   *
   * For coexisting with the home topology's SearchPalette (project-only ⌘K) —
   * ontology search is split off onto ⇧⌘K.
   */
  shift?: boolean;
  /**
   * Disable the hotkey binding itself (used on a controlled mount, where an external
   * hotkey manages the open state).
   */
  disabled?: boolean;
}

/**
 * ⌘K (mac) / Ctrl+K (elsewhere) — the global search toggle hotkey.
 *
 * Inert inside input, textarea and contentEditable — except that closing an already
 * open search is allowed, so ⌘K closes from within the search input.
 *
 * With options.shift=true it becomes ⇧⌘K (split from SearchPalette on home); with
 * disabled=true the binding is inert (a controlled mount where an external hotkey
 * manages open).
 */
export function useGlobalSearchHotkey(
  open: boolean,
  setOpen: (next: boolean) => void,
  options: GlobalSearchHotkeyOptions = {},
) {
  const { shift = false, disabled = false } = options;
  useEffect(() => {
    if (disabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      if (shift && !event.shiftKey) return;
      if (!shift && event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
      if (isEditable && !open) return;
      event.preventDefault();
      setOpen(!open);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen, shift, disabled]);
}
