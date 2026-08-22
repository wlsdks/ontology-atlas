import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "./copy-text";

export type CopyFeedbackState = "idle" | "copied" | "failed";

/**
 * Clipboard copy plus transient state feedback (idle → copied/failed → idle).
 *
 * Consolidates logic that was hand-repeated at 16+ call sites: a `copyState` useState, a
 * reset-timer ref, unmount cleanup, and a setTimeout back to idle after `copyText`. Each site
 * keeps its own styling and shares only the state machine.
 *
 * @param resetMs how long copied/failed shows before returning to idle (default 1500).
 * @returns the state and `copy(text)`; `copy` also returns a success boolean so callers can
 *   add their own feedback, such as a toast.
 */
export function useCopyFeedback(resetMs = 1500): {
  state: CopyFeedbackState;
  copy: (text: string) => Promise<boolean>;
} {
  const [state, setState] = useState<CopyFeedbackState>("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await copyText(text);
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
      setState(ok ? "copied" : "failed");
      resetTimer.current = window.setTimeout(() => setState("idle"), resetMs);
      return ok;
    },
    [resetMs],
  );

  return { state, copy };
}
