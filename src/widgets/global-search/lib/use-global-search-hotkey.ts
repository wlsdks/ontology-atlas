import { useEffect } from "react";

export interface GlobalSearchHotkeyOptions {
  /**
   * Disable the hotkey binding itself (used on a controlled mount, where an external
   * hotkey manages the open state).
   */
  disabled?: boolean;
}

/**
 * Cmd+K (Ctrl+K elsewhere), Shift accepted but never required. Checks `event.code` too, because a
 * Korean input source emits a jamo in `event.key`.
 */
export function isGlobalSearchHotkey(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey">,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  return event.code === "KeyK" || event.key.toLowerCase() === "k";
}

/**
 * Global search toggle hotkey; inert in inputs except for closing an open search, and fully inert
 * when disabled.
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
