import { useCallback, useSyncExternalStore } from "react";

/**
 * Global switch for whether guided tours start **on their own**.
 *
 * **Why a separate axis** (owner report, 2026-07-29): *"Every time is a bit
 * much — once at the start is enough, or when I click."* (every time is a bit
 * much — once at the start is enough, or when I click). Each tour already shows
 * once per destination (`guided-tour:<destination>:v1`), but there are six of
 * them, so moving between destinations feels like "every time" rather than
 * "once". Six honest behaviours adding up to an annoyance cannot be fixed in the
 * individual keys — hence one more axis: does it start automatically. Turned off,
 * nothing opens by itself and the tours are still reachable from the compass tile
 * and settings, which is the "or when I click" half of the request.
 *
 * **Default off** (owner, 2026-08-13, overturning the 2026-07-29 default of on):
 * *"Can these stop
 * appearing? Default the guides to off in settings, and let whoever wants them
 * turn them on."* (can these stop
 * appearing? default the guides to off in settings, and let whoever wants them
 * turn them on). The report came back even after the global switch existed. A
 * stored explicit "1" is still honoured.
 */

const GUIDE_AUTO_START_KEY = "ontology-atlas:guide-auto-start:v1";

/** Same-tab notification; cross-tab arrives through the `storage` event. */
const GUIDE_AUTO_START_EVENT = "ontology-atlas:guide-auto-start-change";

export const DEFAULT_GUIDE_AUTO_START = false;

/**
 * Only an explicit choice counts ("1" on, "0" off); anything else takes the
 * default. That is what let the default flip to off without discarding the "1"
 * of everyone who had turned tours on.
 */
export function resolveGuideAutoStart(saved: string | null): boolean {
  if (saved === "1") return true;
  if (saved === "0") return false;
  return DEFAULT_GUIDE_AUTO_START;
}

export function readGuideAutoStart(): boolean {
  if (typeof window === "undefined") return DEFAULT_GUIDE_AUTO_START;
  try {
    return resolveGuideAutoStart(window.localStorage.getItem(GUIDE_AUTO_START_KEY));
  } catch {
    return DEFAULT_GUIDE_AUTO_START;
  }
}

export function writeGuideAutoStart(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUIDE_AUTO_START_KEY, value ? "1" : "0");
  } catch {
    /* Private mode: the event still updates this session. */
  }
  window.dispatchEvent(new CustomEvent(GUIDE_AUTO_START_EVENT));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(GUIDE_AUTO_START_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(GUIDE_AUTO_START_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useGuideAutoStart(): boolean {
  const getSnapshot = useCallback(() => readGuideAutoStart(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_GUIDE_AUTO_START, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
