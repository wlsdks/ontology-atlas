import { useCallback, useSyncExternalStore } from "react";

/**
 * Plain (non-developer) audience mode — hides developer chrome such as the
 * history and Atlas Git surfaces.
 *
 * It used to be local state inside `HomePage`. Once the rail's bottom utility
 * tier moved up into the shell, the shell had to read the same value, so it was
 * promoted to a shared store — two places each reading localStorage produce the
 * classic drift where changing it in settings updates only one of them.
 *
 * Same local-first persistence grammar as `appearance-preferences`: localStorage
 * is the source of truth, with a `useSyncExternalStore` subscription plus a
 * custom event for live updates within the same tab. SSR and static-export
 * prerender return false to avoid a hydration mismatch.
 */

const AUDIENCE_PLAIN_KEY = "demo:audience-plain:v1";
const AUDIENCE_EVENT = "ontology-atlas:audience-preference-change";

export function readAudiencePlain(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUDIENCE_PLAIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAudiencePlain(next: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIENCE_PLAIN_KEY, next ? "1" : "0");
  } catch {
    /* private mode — session-only, no persistence */
  }
  window.dispatchEvent(new Event(AUDIENCE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(AUDIENCE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AUDIENCE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getServerSnapshot(): boolean {
  return false;
}

/** The current plain-mode value plus its setter. Changing it on any screen updates every subscriber. */
export function useAudiencePlain(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, readAudiencePlain, getServerSnapshot);
  const set = useCallback((next: boolean) => writeAudiencePlain(next), []);
  return [value, set];
}
