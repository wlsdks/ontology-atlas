import { useSyncExternalStore } from "react";

/**
 * SSR-safe hook exposing `prefers-reduced-motion: reduce` as React state.
 *
 * CSS animations and transitions are already neutralised by the global rule in the base layer
 * of `app/globals.css`, but **JS-driven motion** (FLIP transforms, number count-ups) has to
 * decide for itself and jump straight to the final state. This is the single source for that
 * decision.
 *
 * ⚠️ **Read through `useSyncExternalStore`, not a `useState` initializer** (2026-08-30). The
 * first version read `matchMedia` synchronously in the initializer, so a reduced-motion
 * visitor's first client render disagreed with the server HTML on every element the preference
 * touches — measured on the download headline: React reported a hydration failure over 59
 * character spans, kept the server's classes, and the headline only recovered on the next
 * unrelated re-render. With a server snapshot of `false` React hydrates against the markup it
 * was given and then re-renders with the real preference before the first paint completes, so
 * JS motion that runs once on mount is still gated from its first visible frame, and nothing in
 * the console says the page disagreed with itself.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

const serverSnapshot = (): boolean => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, readReducedMotion, serverSnapshot);
}
