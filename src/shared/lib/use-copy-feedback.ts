import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "./copy-text";

export type CopyFeedbackState = "idle" | "copied" | "done" | "failed";

type Outcome = Exclude<CopyFeedbackState, "idle">;

/**
 * **How long a result stays on screen — one answer.**
 *
 * The confirmation has to mean *just now*: left up permanently it becomes a lie to whoever
 * looks later. Copy, run and settle share this dwell, so the product has one.
 */
export const COPY_FEEDBACK_RESET_MS = 1500;

/**
 * Transient result feedback for a control: idle → copied, done or failed → idle.
 *
 * `run(action)` settles `done` when the action resolves and `failed` when it throws, so an
 * action that declines on purpose (a `reject_once` answer) reads as done, never as danger.
 * The same result twice in a row passes one idle frame first, so its animation restarts.
 */
export function useCopyFeedback(resetMs = COPY_FEEDBACK_RESET_MS): {
  state: CopyFeedbackState;
  copy: (text: string) => Promise<boolean>;
  fail: () => void;
  run: <T>(action: () => T | Promise<T>) => Promise<T | undefined>;
  settle: (outcome: "done" | "failed") => void;
} {
  const [state, setState] = useState<CopyFeedbackState>("idle");
  const current = useRef<CopyFeedbackState>("idle");
  const resetTimer = useRef<number | null>(null);
  const restartFrame = useRef<number | null>(null);

  const show = useCallback((next: CopyFeedbackState) => {
    current.current = next;
    setState(next);
  }, []);

  const clearPending = useCallback(() => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    if (restartFrame.current !== null) window.cancelAnimationFrame(restartFrame.current);
    resetTimer.current = null;
    restartFrame.current = null;
  }, []);

  useEffect(() => clearPending, [clearPending]);

  const land = useCallback(
    (next: Outcome) => {
      show(next);
      resetTimer.current = window.setTimeout(() => show("idle"), resetMs);
    },
    [resetMs, show],
  );

  const settle = useCallback(
    (next: Outcome) => {
      clearPending();
      if (current.current !== next) {
        land(next);
        return;
      }
      show("idle");
      restartFrame.current = window.requestAnimationFrame(() => {
        restartFrame.current = null;
        land(next);
      });
    },
    [clearPending, land, show],
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

  const run = useCallback(
    async <T>(action: () => T | Promise<T>): Promise<T | undefined> => {
      try {
        const result = await action();
        settle("done");
        return result;
      } catch {
        settle("failed");
        return undefined;
      }
    },
    [settle],
  );

  return { state, copy, fail, run, settle };
}
