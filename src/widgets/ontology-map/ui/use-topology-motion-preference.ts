"use client";

import {
  useEffect,
  type RefObject
} from "react";

interface Dependencies {
  reducedMotionRef: RefObject<boolean>;
}

/** Keep reduced-motion state synchronized and dispose its media listener. */
export function useTopologyMotionPreference({
  reducedMotionRef,
}: Dependencies) {

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = query.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, [reducedMotionRef]);

}
