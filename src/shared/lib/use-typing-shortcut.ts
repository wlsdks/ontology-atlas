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
 * The physical-key code for a single Latin letter (`d` → `KeyD`).
 *
 * ⚠️ **Why the physical key and not the typed character** (2026-08-24). Every
 * combo used to be matched against `event.key` alone — the character the key
 * *produced*. With a Korean input source active (`2SetKorean`, the default for
 * this product's primary user) the D key emits a Hangul jamo and the K key emits
 * another, so `event.key` was never `"d"` or `"k"` and **every letter shortcut the
 * app advertises was dead**: `d` (docs drawer), `⌘K` / `⇧⌘K` (search), `⌘O`
 * (open folder), `⌘P` (docs palette). The shortcut sheet listed keys that did
 * nothing for the exact audience the sheet is written for.
 *
 * `event.code` is the position on the keyboard and does not change with the
 * input source, so it is the identity a letter shortcut actually means. It is
 * only derived for single Latin letters: punctuation (`?`, `/`) keeps character
 * matching, because its *position* is what moves between layouts while the
 * character stays put — `?` is Shift+/ on both US and 2-set Korean.
 *
 * Verified by dispatching a Hangul-jamo `key` alongside `code:'KeyD'` (and the
 * same for `code:'KeyK'` with `metaKey`) against the built app: dead before,
 * live after.
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
      // An open listbox or menu owns the keyboard too: its options are focused
      // buttons, not inputs, so typing a concept's name into the relation editor's
      // target picker used to fire the letter shortcuts underneath (`d` painted the
      // documents drawer over the editor, installed app, 2026-09-06).
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
