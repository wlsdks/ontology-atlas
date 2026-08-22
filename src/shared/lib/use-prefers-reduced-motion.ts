import { useEffect, useState } from "react";

/**
 * SSR-safe hook exposing `prefers-reduced-motion: reduce` as React state.
 *
 * CSS animations and transitions are already neutralised by the global rule in the base layer
 * of `app/globals.css`, but **JS-driven motion** (FLIP transforms, number count-ups) has to
 * decide for itself and jump straight to the final state. This is the single source for that
 * decision.
 *
 * Under static export there is no `matchMedia`, so it starts at false (motion allowed) and
 * reads the real preference synchronously on the client's first render — so JS motion that
 * runs once on mount is gated correctly from its very first frame.
 */
function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    // Initial value already read synchronously in useState; here we only
    // subscribe to later changes (avoids a redundant setState in the effect body).
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
