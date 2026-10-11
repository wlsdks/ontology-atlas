"use client";

import { useEffect, useRef } from "react";

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
 * Physical key code for a single Latin letter (`d` to `KeyD`): with a Korean input source
 * `event.key` is a jamo, so letter shortcuts match `event.code`. Punctuation keeps character
 * matching.
 */
function physicalCodeFor(key: string): string | null {
  return /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : null;
}

const KEYBOARD_OWNING_POPUP =
  '[role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="combobox"]';

function comboMatches(event: KeyboardEvent, combo: Combo): boolean {
  const expectedCode = physicalCodeFor(combo.key);
  if (expectedCode && event.code === expectedCode) return true;
  return (
    event.key.toLowerCase() === combo.key.toLowerCase() || event.key === combo.key
  );
}

/**
 * Global key shortcuts that skip while focus is in an input, textarea or
 * contenteditable. Extracted so HomePage and ProjectDetailPage share one rule for
 * the `?` cheat sheet, `Cmd+K` search and `F` presentation mode.
 */
export function useTypingShortcuts(shortcuts: TypingShortcut[]) {
  // Call sites pass a fresh array literal every render, so depending on it tore the
  // window listener down and rebuilt it on every frame of a canvas-heavy page. The
  // ref keeps the listener installed once and still reads the current callbacks.
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      // Mid-composition keystrokes belong to the IME, not to a shortcut: while a
      // syllable is being assembled the same physical key is still being typed, and
      // stealing it would break composition.
      if (event.isComposing) return;

      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      // An open listbox or menu owns the keyboard too: its options are focused buttons, not inputs, so
      // typing must not fire letter shortcuts.
      if (target?.closest?.(KEYBOARD_OWNING_POPUP)) return;

      for (const shortcut of shortcutsRef.current) {
        if (shortcut.disabled) continue;
        const { combo, onFire } = shortcut;
        const metaRequired = combo.meta ?? false;
        const metaDown = event.metaKey || event.ctrlKey;
        if (metaRequired !== metaDown) continue;
        if (combo.shift && !event.shiftKey) continue;
        if (!comboMatches(event, combo)) continue;
        event.preventDefault();
        onFire();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
