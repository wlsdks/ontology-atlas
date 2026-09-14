'use client';

import { startTransition, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { focusMapCanvasWhenReady } from './focus-map-canvas';

interface MapNavigationPending {
  id: number;
  from: string;
  phase: 'preparing' | 'stalled';
  focusCanvas: boolean;
}

let current: MapNavigationPending | null = null;
let sequence = 0;
let timeout: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const readMapNavigationPending = () => current;
export function useMapNavigationPending() {
  return useSyncExternalStore(subscribe, readMapNavigationPending, () => null);
}

/** Paint live feedback before scheduling the destination's synchronous graph work. */
export function beginMapNavigation(navigate: () => void, from: string, focusCanvas = false) {
  if (current) {
    if (focusCanvas && !current.focusCanvas) { current = { ...current, focusCanvas: true }; emit(); }
    return current.id;
  }
  if (timeout) clearTimeout(timeout);
  const id = ++sequence;
  flushSync(() => {
    current = { id, from, phase: 'preparing', focusCanvas };
    emit();
  });
  // Two frames cross an actual paint boundary. This is not a minimum display time.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (current?.id !== id) return;
    startTransition(() => {
      try { navigate(); }
      catch { markStalled(id); }
    });
  }));
  // A hang detector, never simulated progress or successful completion. The
  // original route remains an explicit escape even if navigation never commits.
  timeout = setTimeout(() => markStalled(id), 15_000);
  return id;
}

function markStalled(id: number) {
  if (current?.id !== id) return;
  current = { ...current, phase: 'stalled' };
  emit();
}

export function cancelMapNavigation(id?: number | null) {
  if (id !== undefined && current?.id !== id) return;
  if (timeout) clearTimeout(timeout);
  timeout = undefined;
  current = null;
  sequence += 1;
  emit();
}

/** Only a successful draw (including zero nodes) calls this completion path. */
export function completeMapNavigation(id: number | null) {
  if (id === null || current?.id !== id) return;
  const focus = current.focusCanvas;
  cancelMapNavigation(id);
  const generation = sequence;
  if (focus) requestAnimationFrame(() => {
    if (sequence === generation && current === null) focusMapCanvasWhenReady();
  });
}
