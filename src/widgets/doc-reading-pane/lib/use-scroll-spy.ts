"use client";

import { useEffect, useRef, useState } from "react";
import { scheduleStateSync } from "@/shared/lib/schedule-state-sync";

/**
 * Tracks the heading most recently passed by the 32px baseline, recomputed on each rAF-throttled
 * scroll (a few headings per document); null at the top, the last heading at the bottom. A
 * MutationObserver re-collects headings after async loads or DOM replacement.
 */
export function useDocReadingScrollSpy(
  selectedSlug: string | null,
  source: string,
): {
  articleScrollRef: React.MutableRefObject<HTMLDivElement | null>;
  activeHeadingSlug: string | null;
  setActiveHeadingSlug: React.Dispatch<React.SetStateAction<string | null>>;
} {
  const articleScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeHeadingSlug, setActiveHeadingSlug] = useState<string | null>(
    null,
  );
  useEffect(() => {
    scheduleStateSync(() => setActiveHeadingSlug(null));
    if (!selectedSlug) return;
    const root = articleScrollRef.current;
    if (!root) return;

    let headings: HTMLElement[] = [];
    let rafPending = 0;

    const collectHeadings = (): boolean => {
      headings = Array.from(
        root.querySelectorAll<HTMLElement>("h2[id], h3[id]"),
      );
      return headings.length > 0;
    };

    const recompute = () => {
      rafPending = 0;
      if (headings.length === 0) return;
      // Coordinates are relative to the scroll container, which starts mid-screen.
      const rootTop = root.getBoundingClientRect().top;
      let pick: string | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top - rootTop < 32) pick = h.id;
      }
      // Bottom clamp: a short last section may never pass the baseline.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 8) {
        pick = headings[headings.length - 1]?.id ?? pick;
      }
      setActiveHeadingSlug(pick);
    };

    const scheduleRecompute = () => {
      if (rafPending) return;
      rafPending = requestAnimationFrame(recompute);
    };

    const onScroll = () => scheduleRecompute();
    root.addEventListener("scroll", onScroll, { passive: true });

    // Re-collect when the heading set is empty or detached (async markdown, React replacing nodes).
    const domObserver = new MutationObserver(() => {
      if (headings.length === 0 || headings.some((h) => !h.isConnected)) {
        if (collectHeadings()) scheduleRecompute();
      }
    });
    const rafHandle = requestAnimationFrame(() => {
      if (collectHeadings()) scheduleRecompute();
      domObserver.observe(root, { childList: true, subtree: true });
    });

    return () => {
      cancelAnimationFrame(rafHandle);
      if (rafPending) cancelAnimationFrame(rafPending);
      root.removeEventListener("scroll", onScroll);
      domObserver.disconnect();
    };
  }, [selectedSlug, source]);

  return { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug };
}
