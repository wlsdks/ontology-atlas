"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { scheduleStateSync } from "@/shared/lib/schedule-state-sync";

/**
 * Back-to-top visibility and click for the article scroll container. A new `dependencyKey` is a new
 * document: visibility resets and the listener re-attaches, covering a container not yet mounted.
 */

export const BACK_TO_TOP_SCROLL_THRESHOLD = 640;

/** A pure verdict, split out of the hook for testability. */
export function shouldShowBackToTop(
  scrollTop: number,
  threshold: number = BACK_TO_TOP_SCROLL_THRESHOLD,
): boolean {
  return scrollTop > threshold;
}

export function useBackToTop(
  scrollRef: RefObject<HTMLElement | null>,
  dependencyKey: string | null,
  threshold: number = BACK_TO_TOP_SCROLL_THRESHOLD,
): { visible: boolean; scrollToTop: () => void } {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    scheduleStateSync(() => setVisible(false));
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setVisible(shouldShowBackToTop(el.scrollTop, threshold));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, dependencyKey, threshold]);

  const scrollToTop = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [scrollRef]);

  return { visible, scrollToTop };
}
