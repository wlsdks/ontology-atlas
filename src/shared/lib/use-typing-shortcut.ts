"use client";

import { useEffect } from "react";

interface Combo {
  /** The lowercase key token (e.g. "k", "f", "?"). `?` is the actual key Shift+/ produces. */
  key: string;
  /** Whether Cmd/Ctrl is required. Defaults to false. */
  meta?: boolean;
  /** Whether Shift is required. Leave false for `?`, whose key is already the Shift result. */
  shift?: boolean;
}

export interface TypingShortcut {
  combo: Combo;
  onFire: () => void;
  /** Disable condition (another overlay is open, say). When true the callback never fires. */
  disabled?: boolean;
}

/**
 * Global key shortcuts that skip while focus is in an input, textarea or
 * contenteditable. Extracted so HomePage and ProjectDetailPage share one rule for
 * the `?` cheat sheet, `Cmd+K` search and `F` presentation mode.
 */
export function useTypingShortcuts(shortcuts: TypingShortcut[]) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;

      for (const shortcut of shortcuts) {
        if (shortcut.disabled) continue;
        const { combo, onFire } = shortcut;
        const metaRequired = combo.meta ?? false;
        const metaDown = event.metaKey || event.ctrlKey;
        if (metaRequired !== metaDown) continue;
        if (combo.shift && !event.shiftKey) continue;
        if (event.key.toLowerCase() !== combo.key.toLowerCase() && event.key !== combo.key)
          continue;
        event.preventDefault();
        onFire();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
