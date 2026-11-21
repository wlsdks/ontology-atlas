import { yieldToFrame } from "@/shared/lib/scheduling/yield-to-frame";
import type { LayoutSteps } from "../../../flat-graph/layout";

/** Slice length on the main thread, decision 1 of `docs/specs/2026-11-20-performance-strategy.md`. */
export const WORLD_SLICE_MS = 8;

export interface RunStepsOptions {
  budgetMs?: number;
  /** Injected by tests; the browser's clock and `yieldToFrame` otherwise. */
  now?: () => number;
  yieldNow?: () => Promise<void>;
}

/**
 * Steps `steps` on the calling thread, the first slice at once, giving the browser a turn whenever a
 * slice has run `budgetMs`. A throw in the first slice reaches the caller, a later one `onError`.
 * Contract: `onDone` runs at most once, and never after the returned cancel.
 */
export function runStepsSliced<T>(
  steps: LayoutSteps<T>,
  onDone: (value: T) => void,
  onError: (error: unknown) => void,
  { budgetMs = WORLD_SLICE_MS, now = () => performance.now(), yieldNow = yieldToFrame }: RunStepsOptions = {},
): () => void {
  let cancelled = false;
  const slice = (): void => {
    if (cancelled) return;
    const start = now();
    for (;;) {
      const step = steps.next();
      if (step.done) {
        onDone(step.value);
        return;
      }
      if (now() - start >= budgetMs) {
        void yieldNow().then(slice).catch(onError);
        return;
      }
    }
  };
  slice();
  return () => {
    cancelled = true;
  };
}
