"use client";

import { useLayoutEffect } from "react";

/**
 * Set `document.title` dynamically on the client.
 *
 * The App Router's metadata system rewrites `<title>` to the layout default (the
 * locale-aware site name) on the initial commit, so a plain `useEffect` is
 * overwritten right after it runs. Two defences:
 *
 *  1. `useLayoutEffect` writes it once before paint.
 *  2. A MutationObserver watches the `<title>` node's textContent and restores our
 *     value the moment anything else (Next.js metadata) rewrites it. The observer
 *     disconnects on unmount.
 *
 * A `null` or empty string is a no-op, leaving the default title in place.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const trimmed = title?.trim();
    if (!trimmed) return;
    const previous = document.title;
    document.title = trimmed;
    const titleEl = document.querySelector("title");
    let observer: MutationObserver | null = null;
    if (titleEl) {
      observer = new MutationObserver(() => {
        if (document.title !== trimmed) {
          document.title = trimmed;
        }
      });
      observer.observe(titleEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return () => {
      observer?.disconnect();
      document.title = previous;
    };
  }, [title]);
}
