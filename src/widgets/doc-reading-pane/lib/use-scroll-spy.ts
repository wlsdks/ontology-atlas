"use client";

import { useEffect, useRef, useState } from "react";
import { scheduleStateSync } from "@/shared/lib/schedule-state-sync";

/**
 * Tracks the current heading inside the docs page's article scroll container.
 *
 * A rAF-throttled scroll handler recomputes each heading's position relative to the root and picks
 * the heading most recently passed by the 32px baseline at the top of the scroll. With no heading
 * passed yet (the very top of the document) it is null, and reaching the bottom clamps to the last
 * heading.
 *
 * The previous implementation used IntersectionObserver and had three latent defects: ① it queried
 * headings once, before the asynchronous markdown fetch, so the observer never attached; ② a React
 * re-render replacing the article DOM left it observing detached nodes; ③ a jump scroll skipping
 * the observed band produced no callback. There are only a handful of headings per document, so
 * recomputing directly on each scroll is simpler and deterministic. ① and ② are additionally
 * guarded by a permanently mounted MutationObserver that re-collects.
 *
 * Dependencies:
 * - `selectedSlug` changing resets active to null (a new document)
 * - `source` ('server' | 'local') changing redraws the article DOM, so it re-subscribes
 *
 * Returns:
 * - `articleScrollRef` — the article container div ref, attached by the caller
 * - `activeHeadingSlug` — the id of the current active heading, or null
 * - `setActiveHeadingSlug` — updates active immediately from an outside click, moving the
 *   indicator before the scroll animation arrives
 */
export function useDocsVaultScrollSpy(
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
      // Every coordinate is relative to the top of the scroll container (root) — measuring against
      // the viewport is wrong in this layout, where the root starts mid-screen.
      const rootTop = root.getBoundingClientRect().top;
      let pick: string | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top - rootTop < 32) pick = h.id;
      }
      // Bottom clamp — a short last section may never pass the baseline, so reaching the bottom
      // selects the last heading.
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

    // Covers both the asynchronous markdown arriving and React replacing DOM nodes — if the
    // heading set is empty or detached, re-collect and recompute.
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
