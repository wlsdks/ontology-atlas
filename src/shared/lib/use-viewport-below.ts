import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * A surface that does not fit is not built rather than hidden, so it runs no effects. `minWidthPx`
 * is the Tailwind breakpoint, queried 0.02px below so it agrees with `lg:` at fractional ratios.
 * `serverBelow` is the prerender's answer: narrow only where most windows sit below the breakpoint.
 */
export function useViewportBelow(minWidthPx: number, serverBelow = false): boolean {
  const query = useMemo(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
    return window.matchMedia(`(max-width: ${minWidthPx - 0.02}px)`);
  }, [minWidthPx]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!query) return () => undefined;
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => query?.matches ?? serverBelow, [query, serverBelow]);
  // The server and prerender have no width; "wide" is the safe default, because
  // degradation happens only after the real width has been observed.
  const getServerSnapshot = useCallback(() => serverBelow, [serverBelow]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The Tailwind `lg` breakpoint — the narrowest width at which the desktop rail (`lg:flex`) stands. */
export const LG_BREAKPOINT_PX = 1024;
