/**
 * A guard for `history.replaceState` / `pushState`.
 *
 * WebKit (the macOS app's WebView) throws `SecurityError` once a page makes more than 100 of
 * these calls in 10 seconds, and an exception there takes the whole route to its error screen
 * (measured in the installed app, 2026-09-25). A burst that large is always a loop between two
 * writers, never a person, so past a budget the write is dropped — the screen's state already
 * holds the value; only the address lags — and the loop is reported once, by name, so it is
 * fixed at its cause rather than hidden.
 */

/** Writes allowed in any 10-second window. Well under WebKit's 100, which counts every caller. */
export const HISTORY_WRITE_BUDGET = 60;
const HISTORY_WRITE_WINDOW_MS = 10_000;

export interface HistoryWriteGuard {
  /** True when a write may go ahead now (and records it). */
  allow(now: number): boolean;
}

export function createHistoryWriteGuard(
  budget = HISTORY_WRITE_BUDGET,
  windowMs = HISTORY_WRITE_WINDOW_MS,
  onRefuse: (count: number) => void = () => {},
): HistoryWriteGuard {
  const times: number[] = [];
  let reported = false;
  return {
    allow(now: number) {
      while (times.length && now - times[0]! >= windowMs) times.shift();
      if (times.length >= budget) {
        if (!reported) {
          reported = true;
          onRefuse(times.length);
        }
        return false;
      }
      times.push(now);
      reported = false;
      return true;
    },
  };
}

const shared = createHistoryWriteGuard(HISTORY_WRITE_BUDGET, HISTORY_WRITE_WINDOW_MS, (count) => {
  console.error(
    `[history] ${count} address writes in ${HISTORY_WRITE_WINDOW_MS / 1000}s — two writers are answering each other; the rest are dropped`,
  );
});

/** `history.replaceState` / `pushState` through the shared budget. Returns whether it wrote. */
export function guardedHistoryWrite(mode: 'replace' | 'push', url: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!shared.allow(Date.now())) return false;
  if (mode === 'replace') window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
  return true;
}
