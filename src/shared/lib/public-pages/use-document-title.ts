import { useLayoutEffect } from "react";

/**
 * Sets `document.title` on the client. The App Router rewrites `<title>` to the layout default on the
 * initial commit, so `useLayoutEffect` writes before paint and a MutationObserver restores our value
 * when anything else rewrites it. A `null` or empty title is a no-op.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const trimmed = title?.trim();
    if (!trimmed) return;
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
    // Only the observer is torn down: restoring the mount-time title would overwrite the next route's
    // title.
    return () => {
      observer?.disconnect();
    };
  }, [title]);
}
