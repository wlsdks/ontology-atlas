import { useEffect } from "react";

import {
  LIBRARY_TOAST_BOTTOM_OFFSET,
  LIBRARY_TOAST_DIALOG_OFFSET,
  LIBRARY_TOAST_RIGHT_OFFSET,
} from "@/shared/ui/toast/toast-position";

/** The work card's box (`h-36` in `WorkRunCard`); a toast above it clears this much. */
const WORK_CARD_HEIGHT = "9rem";
const TOAST_GAP_ABOVE_CARD = "12px";

/**
 * Where the Library's toasts and its work card stand: a dialog on screen moves both corners in, and
 * the work card keeps the corner, so a toast stands on top of it rather than over it.
 */
export function libraryToastOffsets({ dialogOpen, workCardShown }: { dialogOpen: boolean; workCardShown: boolean }) {
  const right = dialogOpen ? LIBRARY_TOAST_DIALOG_OFFSET : LIBRARY_TOAST_RIGHT_OFFSET;
  const bottom = dialogOpen ? LIBRARY_TOAST_DIALOG_OFFSET : LIBRARY_TOAST_BOTTOM_OFFSET;
  const toastBottom = workCardShown ? `calc(${bottom} + ${WORK_CARD_HEIGHT} + ${TOAST_GAP_ABOVE_CARD})` : bottom;
  return { right, workCardBottom: bottom, toastBottom };
}

/** Publishes `libraryToastOffsets` as the app's toast custom properties while the Library is open. */
export function useLibraryToastOffsets(input: { dialogOpen: boolean; workCardShown: boolean }) {
  const { dialogOpen, workCardShown } = input;
  useEffect(() => {
    const root = document.documentElement;
    const { right, workCardBottom, toastBottom } = libraryToastOffsets({ dialogOpen, workCardShown });
    root.style.setProperty("--app-toast-right-offset", right);
    root.style.setProperty("--app-work-card-bottom-offset", workCardBottom);
    root.style.setProperty("--app-toast-bottom-offset", toastBottom);
    root.style.setProperty("--app-toast-mobile-right-offset", right);
    root.style.setProperty("--app-toast-mobile-bottom-offset", toastBottom);
    return () => {
      root.style.removeProperty("--app-toast-right-offset");
      root.style.removeProperty("--app-work-card-bottom-offset");
      root.style.removeProperty("--app-toast-bottom-offset");
      root.style.removeProperty("--app-toast-mobile-right-offset");
      root.style.removeProperty("--app-toast-mobile-bottom-offset");
    };
  }, [dialogOpen, workCardShown]);
}
