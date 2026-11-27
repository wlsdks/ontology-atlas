/**
 * Guard for `history.replaceState` / `pushState`: WebKit throws `SecurityError` past 100 calls in 10
 * seconds, taking the route to its error screen. Such a burst is a loop between two writers, so past
 * a budget the write is dropped and the loop is reported once by name.
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

/** The history of the router that owns the window; `flush` makes the write land before the caller returns. */
export interface RouterHistoryWriter {
  push(url: string): void;
  replace(url: string): void;
  flush(): void;
}

let routerHistory: RouterHistoryWriter | null = null;

/** Called once by the entry that mounts the router; where none is set, the browser's own history is written. */
export function setRouterHistory(writer: RouterHistoryWriter | null): void {
  routerHistory = writer;
}

/**
 * The one door every direct address write goes through. Under a router the write is the router's, so
 * its history keys stay and Back and Forward land where they should.
 */
export function guardedHistoryWrite(mode: 'replace' | 'push', url: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!shared.allow(Date.now())) return false;
  if (routerHistory) {
    // The router takes a path; callers may hold the absolute form `URL.toString()` gives.
    const target = new URL(url, window.location.href);
    routerHistory[mode](`${target.pathname}${target.search}${target.hash}`);
    routerHistory.flush();
  } else if (mode === 'replace') window.history.replaceState(window.history.state, '', url);
  else window.history.pushState(window.history.state, '', url);
  return true;
}
