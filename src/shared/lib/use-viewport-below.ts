import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Exposes "is the viewport currently narrower than this width" as a React value.
 *
 * **Why CSS alone is not enough**: *hiding* a surface that does not fit is not the
 * same as *not building* it. A surface hidden with `display:none` is still
 * mounted, still running effects, focus and measurement — living on underneath
 * while the screen says "you cannot come here". Degradation is a substitute, not
 * concealment.
 *
 * **Why not `useState` + `useEffect`**: matchMedia is a store outside React, so
 * `useSyncExternalStore` is the correct subscription. Catching up to the initial
 * value with a setState inside an effect causes a cascading render
 * (`react-hooks/set-state-in-effect`) and always paints the first frame with the
 * wrong value. A separate server snapshot also keeps static export's prerender and
 * hydration from diverging: the server renders "wide" and hydration settles on the
 * real width in one step.
 *
 * `minWidthPx` takes the **same number** as the Tailwind breakpoint (`lg` = 1024).
 * The boundary matches CSS too — "below min-width" — by querying 1023.98px so it
 * cannot disagree with the `lg:` utilities at fractional pixel ratios.
 */
export function useViewportBelow(minWidthPx: number): boolean {
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

  const getSnapshot = useCallback(() => query?.matches ?? false, [query]);
  // The server and prerender have no width; "wide" is the safe answer, because
  // degradation happens only after the real width has been observed.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The Tailwind `lg` breakpoint — the narrowest width at which the desktop rail (`lg:flex`) stands. */
export const LG_BREAKPOINT_PX = 1024;
