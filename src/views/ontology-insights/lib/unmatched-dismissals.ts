import { useCallback, useSyncExternalStore } from "react";

/**
 * **Which unmatched rows this viewer has chosen not to look at.**
 *
 * ## It is a preference, never a vault write
 *
 * "I have seen this one" is a fact about a reader, not about the ontology. Writing it
 * into the vault would put one person's screen state into everyone's Git diff and make
 * a shared source of truth carry a private opinion — and, worse, would make a row
 * disappear for a colleague who never dismissed it. So it lives in this browser only.
 * Nothing here reaches the folder, and `buildUnmatchedBoard` keeps the vault's own
 * counts unmoved by it: dismissing hides a row, it does not fix one.
 *
 * ## Scoped to the vault, for the reason the notification box already learned
 *
 * `agent-activity/model/read-at-storage.ts` records the same defect from 2026-08-01: one
 * global key meant opening the bell in one vault marked another vault's items read. The
 * list of missing names is per vault, so its dismissals are too. An empty scope is
 * refused outright rather than falling back to a shared slot — a fallback is how the
 * global key comes back.
 *
 * Persistence grammar follows `shared/lib/audience-preference.ts`: localStorage is the
 * truth, a custom event plus `storage` drives live updates, and the server snapshot is
 * empty so a static export hydrates without a mismatch.
 */
const DISMISSED_KEY_PREFIX = "atlas.insights.unmatchedDismissed:";
const DISMISSED_EVENT = "ontology-atlas:insights-unmatched-dismissals-change";

const EMPTY: ReadonlySet<string> = new Set();

/** Cached so `useSyncExternalStore` sees a stable reference between changes. */
let snapshot = new Map<string, ReadonlySet<string>>();

export function unmatchedDismissalKey(vaultScope: string): string {
  return `${DISMISSED_KEY_PREFIX}${vaultScope}`;
}

function parse(raw: string | null): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    // A slot is ordinary browser storage anything on this origin can write. Only
    // strings become row ids; nothing else is coerced into one.
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return EMPTY;
  }
}

export function readUnmatchedDismissals(vaultScope: string): ReadonlySet<string> {
  if (!vaultScope || typeof window === "undefined") return EMPTY;
  const cached = snapshot.get(vaultScope);
  if (cached) return cached;
  let value: ReadonlySet<string> = EMPTY;
  try {
    value = parse(window.localStorage.getItem(unmatchedDismissalKey(vaultScope)));
  } catch {
    /* private mode — nothing stored, nothing read */
  }
  snapshot.set(vaultScope, value);
  return value;
}

export function writeUnmatchedDismissals(
  vaultScope: string,
  ids: ReadonlySet<string>,
): void {
  if (!vaultScope || typeof window === "undefined") return;
  snapshot = new Map(snapshot);
  snapshot.set(vaultScope, new Set(ids));
  try {
    const key = unmatchedDismissalKey(vaultScope);
    // Nothing dismissed is the absence of a slot, not a slot holding nothing.
    if (ids.size === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify([...ids].sort()));
  } catch {
    /* private mode — the change still holds for this session */
  }
  window.dispatchEvent(new Event(DISMISSED_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const handle = () => {
    snapshot = new Map();
    onChange();
  };
  window.addEventListener(DISMISSED_EVENT, handle);
  window.addEventListener("storage", handle);
  return () => {
    window.removeEventListener(DISMISSED_EVENT, handle);
    window.removeEventListener("storage", handle);
  };
}

/** The dismissed ids for one vault, plus a toggle for one row. */
export function useUnmatchedDismissals(
  vaultScope: string,
): [ReadonlySet<string>, (id: string, dismissed: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readUnmatchedDismissals(vaultScope),
    () => EMPTY,
  );
  const toggle = useCallback(
    (id: string, dismissed: boolean) => {
      const next = new Set(readUnmatchedDismissals(vaultScope));
      if (dismissed) next.add(id);
      else next.delete(id);
      writeUnmatchedDismissals(vaultScope, next);
    },
    [vaultScope],
  );
  return [value, toggle];
}
