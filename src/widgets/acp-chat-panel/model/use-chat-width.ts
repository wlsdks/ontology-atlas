'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

import {
  CHAT_WIDTH_DEFAULT,
  clampChatWidth,
  defaultChatWidth,
  readStoredChatWidth,
  writeStoredChatWidth,
} from './panel-width';

/**
 * **Remember** the chat panel's width.
 *
 * ## Why not `useState` plus `useEffect`
 *
 * The stored width is a value outside React (`localStorage` on disk). Pulling it in
 * with `setState` after mount makes the first paint stand at the default width and
 * then re-render, and React warns about that pattern too. `useSyncExternalStore` is
 * the door React provides for **external values**, and it takes a separate server
 * answer, so it does not disagree with static export's first HTML either.
 *
 * ## Why the width during a drag is held separately
 *
 * Writing to disk on every drag frame is dozens of writes per second. So **only the
 * width during the drag** is held in React state, and it is written once on
 * release. The temporary value is discarded afterwards, so the truth is always the
 * single stored value (the same value is never kept in two places).
 */

/** Where a stored-width change is announced — sent to subscribers on the same screen. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // When the window narrows, the stored width exceeds this screen's upper bound — fold it again.
  window.addEventListener('resize', onChange);
  // Follow along when another window changes the width too.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('resize', onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * ⚠️ **A stored width and a default width are folded differently** (2026-09-06). Both used to
 * go through `clampChatWidth`, so the default inherited the floor a *drag* may not cross:
 * raising it to 520 handed a 1040px window — the app's own minimum — a 480px map, which is
 * exactly `MAP_MIN_WIDTH`, and the map dropped a relation caption that had drawn the day
 * before. Nobody asked for that panel; `defaultChatWidth` yields the map more room instead.
 */
function snapshot(): number {
  const stored = readStoredChatWidth(window.localStorage);
  return stored === null
    ? defaultChatWidth(window.innerWidth)
    : clampChatWidth(stored, window.innerWidth);
}

/** The server has neither storage nor a window — draw at the default width. */
function serverSnapshot(): number {
  return CHAT_WIDTH_DEFAULT;
}

export function useChatWidth(): {
  width: number;
  /** Called during a drag — it does not store. */
  setWidth: (width: number) => void;
  /** Called on release — that is when it stores, once. */
  commitWidth: (width: number) => void;
} {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [dragging, setDragging] = useState<number | null>(null);

  const setWidth = useCallback((next: number) => {
    setDragging(clampChatWidth(next, window.innerWidth));
  }, []);

  const commitWidth = useCallback((next: number) => {
    writeStoredChatWidth(window.localStorage, clampChatWidth(next, window.innerWidth));
    // Discard the temporary value and return to the stored one — one event, so it paints once.
    setDragging(null);
    for (const listener of listeners) listener();
  }, []);

  return { width: dragging ?? stored, setWidth, commitWidth };
}
