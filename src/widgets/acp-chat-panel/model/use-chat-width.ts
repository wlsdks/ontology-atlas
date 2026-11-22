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
 * Remembers the chat panel's width. `useSyncExternalStore` reads the stored width (`localStorage`)
 * without painting the default first, and takes a server answer for static export's first HTML.
 * A drag is held in React state and written once on release, so the stored value stays the truth.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // When the window narrows, the stored width exceeds this screen's upper bound — fold it again.
  window.addEventListener('resize', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('resize', onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * A stored width goes through `clampChatWidth`; a default goes through `defaultChatWidth`, which
 * yields the map more room than the floor a drag may not cross.
 */
function snapshot(): number {
  const stored = readStoredChatWidth(window.localStorage);
  return stored === null
    ? defaultChatWidth(window.innerWidth)
    : clampChatWidth(stored, window.innerWidth);
}

function serverSnapshot(): number {
  return CHAT_WIDTH_DEFAULT;
}

export function useChatWidth(): {
  width: number;
  setWidth: (width: number) => void;
  commitWidth: (width: number) => void;
} {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [dragging, setDragging] = useState<number | null>(null);

  const setWidth = useCallback((next: number) => {
    setDragging(clampChatWidth(next, window.innerWidth));
  }, []);

  const commitWidth = useCallback((next: number) => {
    writeStoredChatWidth(window.localStorage, clampChatWidth(next, window.innerWidth));
    setDragging(null);
    for (const listener of listeners) listener();
  }, []);

  return { width: dragging ?? stored, setWidth, commitWidth };
}
