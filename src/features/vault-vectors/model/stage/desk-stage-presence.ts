import { useCallback, useEffect, useState, useSyncExternalStore, type RefCallback } from 'react';

const stages = new Map<string, number>();
const stageListeners = new Set<() => void>();

function subscribeStages(listener: () => void): () => void {
  stageListeners.add(listener);
  return () => {
    stageListeners.delete(listener);
  };
}

function moveStage(rootPath: string, by: 1 | -1): void {
  const count = (stages.get(rootPath) ?? 0) + by;
  if (count > 0) stages.set(rootPath, count);
  else stages.delete(rootPath);
  for (const listener of stageListeners) listener();
}

/** The seat stands down while the line is drawn, so progress is never said twice; a line inside a hidden desk has no box and is not a stage. */
export function useVectorRunStage(rootPath: string | null): RefCallback<HTMLElement> {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (rootPath === null || element === null || typeof ResizeObserver === 'undefined') return undefined;
    let shown = false;
    const show = (next: boolean) => {
      if (next === shown) return;
      shown = next;
      moveStage(rootPath, next ? 1 : -1);
    };
    // Measured at once as well, so a line that replaces another never leaves the stage for a frame.
    show(element.getBoundingClientRect().width > 0);
    const observer = new ResizeObserver(([entry]) => show(entry.contentRect.width > 0));
    observer.observe(element);
    return () => {
      observer.disconnect();
      show(false);
    };
  }, [rootPath, element]);
  return setElement;
}

export function useVectorRunStageShown(rootPath: string | null): boolean {
  const read = useCallback(() => rootPath !== null && stages.has(rootPath), [rootPath]);
  return useSyncExternalStore(subscribeStages, read, () => false);
}
