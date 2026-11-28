import { useCallback, useEffect, useState, type RefObject } from "react";
import { scheduleStateSync } from "@/shared/lib/render-timing/schedule-state-sync";

/**
 * Back-to-top visibility and click for the article scroll container. A new `dependencyKey` is a new
 * document: visibility resets and the listener re-attaches, covering a container not yet mounted.
 */

export const BACK_TO_TOP_SCROLL_THRESHOLD = 640;

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
    const htmlElement = scrollRef.current;
    if (!htmlElement) return;
    const onScroll = () => {
      setVisible(shouldShowBackToTop(htmlElement.scrollTop, threshold));
    };
    htmlElement.addEventListener("scroll", onScroll, { passive: true });
    return () => htmlElement.removeEventListener("scroll", onScroll);
  }, [scrollRef, dependencyKey, threshold]);

  const scrollToTop = useCallback(() => {
    const htmlElement = scrollRef.current;
    if (!htmlElement) return;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    htmlElement.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [scrollRef]);

  return { visible, scrollToTop };
}
