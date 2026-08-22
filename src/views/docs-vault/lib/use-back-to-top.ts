"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { scheduleStateSync } from "./persistence";

/**
 * The visibility threshold and click behaviour of the "back to top" button in the article scroll
 * container.
 *
 * It subscribes to the same container (`articleScrollRef`) as `use-scroll-spy.ts` but is a separate
 * hook because the concern differs (tracking the active heading vs toggling visibility), so the
 * existing spy logic is not polluted.
 *
 * Dependency: when `dependencyKey` (the caller's `selectedSlug`) changes it is treated as a new
 * document — visible resets to false and the listener re-attaches. This matches `use-scroll-spy`'s
 * `selectedSlug` dependency pattern, and the re-attach also covers the first-render case where the
 * scroll container's DOM node may not be mounted yet when switching documents.
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
