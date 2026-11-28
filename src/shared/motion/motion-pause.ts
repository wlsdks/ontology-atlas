import { useSyncExternalStore } from 'react';

/**
 * One pause for everything on the download page that moves by itself (WCAG 2.2.2): its clip, Moru,
 * looping scenes and canvas field. Remembered in this browser only, as a convenience.
 */
const KEY = 'atlas.download.motion';
const listeners = new Set<() => void>();
let paused: boolean | null = null;

export function isMotionPaused(): boolean {
  if (paused === null) {
    try {
      paused = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === 'paused';
    } catch {
      paused = false;
    }
  }
  return paused;
}

export function setMotionPaused(next: boolean): void {
  paused = next;
  try {
    if (next) localStorage.setItem(KEY, 'paused');
    else localStorage.removeItem(KEY);
  } catch {
    /* Storage may be blocked; the choice still holds for this visit. */
  }
  for (const listener of listeners) listener();
}

export function subscribeMotionPause(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMotionPaused(): boolean {
  return useSyncExternalStore(subscribeMotionPause, isMotionPaused, () => false);
}
