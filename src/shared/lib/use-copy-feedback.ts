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
 * @param resetMs how long copied/failed shows before returning to idle
 *   (default {@link COPY_FEEDBACK_RESET_MS}).
 * @returns the state and `copy(text)`; `copy` also returns a success boolean so callers can
 *   add their own feedback, such as a toast.
 */
/**
 * **How long "copied" stays on screen — one answer.**
 *
 * The confirmation has to mean *just now*: left up permanently it becomes a lie to whoever
 * looks later. How long "just now" lasts was two answers until 2026-09-08 — this hook's
 * default at 13 call sites, and 1600 at four call sites that passed it explicitly plus three
 * that ran their own timer beside the hook. 100ms is nothing to a reader and everything to a
 * reviewer, who has to check twenty sites to learn whether the product has one dwell or two.
 */
export const COPY_FEEDBACK_RESET_MS = 1500;

export function useCopyFeedback(resetMs = COPY_FEEDBACK_RESET_MS): {
  state: CopyFeedbackState;
  copy: (text: string) => Promise<boolean>;
  /**
   * A copy that could not be attempted — the text itself could not be built — reads as the
   * failed copy it is, with the same dwell, so the control that was pressed says so (2026-09-26).
   */
  fail: () => void;
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

  const settle = useCallback(
    (next: Exclude<CopyFeedbackState, "idle">) => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
      }
      setState(next);
      resetTimer.current = window.setTimeout(() => setState("idle"), resetMs);
    },
    [resetMs],
  );

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await copyText(text);
      settle(ok ? "copied" : "failed");
      return ok;
    },
    [settle],
  );

  const fail = useCallback(() => settle("failed"), [settle]);

  return { state, copy, fail };
}
