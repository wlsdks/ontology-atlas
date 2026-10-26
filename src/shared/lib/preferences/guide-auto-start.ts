import { useCallback, useSyncExternalStore } from "react";

/** Whether the sample offers the first-visit folder-opening guide automatically; default off. */

const GUIDE_AUTO_START_KEY = "ontology-atlas:guide-auto-start:v1";

/** Same-tab notification; cross-tab arrives through the `storage` event. */
const GUIDE_AUTO_START_EVENT = "ontology-atlas:guide-auto-start-change";

export const DEFAULT_GUIDE_AUTO_START = false;

/**
 * Only an explicit choice counts ("1" on, "0" off); anything else takes the
 * default. That is what let the default flip to off without discarding the "1"
 * of everyone who had enabled automatic folder guidance.
 */
export function resolveGuideAutoStart(saved: string | null): boolean {
  if (saved === "1") return true;
  if (saved === "0") return false;
  return DEFAULT_GUIDE_AUTO_START;
}

export function readGuideAutoStart(): boolean {
  if (typeof window === "undefined") return DEFAULT_GUIDE_AUTO_START;
  try {
    return resolveGuideAutoStart(window.localStorage.getItem(GUIDE_AUTO_START_KEY));
  } catch {
    return DEFAULT_GUIDE_AUTO_START;
  }
}

export function writeGuideAutoStart(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUIDE_AUTO_START_KEY, value ? "1" : "0");
  } catch {
    /* Private mode: the event still updates this session. */
  }
  window.dispatchEvent(new CustomEvent(GUIDE_AUTO_START_EVENT));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(GUIDE_AUTO_START_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(GUIDE_AUTO_START_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useGuideAutoStart(): boolean {
  const getSnapshot = useCallback(() => readGuideAutoStart(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_GUIDE_AUTO_START, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
