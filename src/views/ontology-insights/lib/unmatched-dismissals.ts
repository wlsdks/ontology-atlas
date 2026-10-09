
/**
 * Unmatched rows this viewer chose not to look at: a browser preference, never a vault write, so it never reaches
 * a colleague's diff and `buildUnmatchedBoard`'s counts ignore it. Scoped per vault
 * (as `agent-activity/model/read-at-storage.ts`), and an empty scope is refused rather than falling back to a shared
 * slot. The scope is the folder's name (`handle.name`, the only persistable part), so two same-named folders share
 * dismissals: a bounded error that hides and never writes. Persistence follows `shared/lib/audience-preference.ts`:
 * localStorage is the truth, events drive updates, and the server snapshot is empty for static export.
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
    // Anything on this origin can write the slot, so only strings become row ids.
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
    // Nothing dismissed is no slot at all.
    if (ids.size === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify([...ids].sort()));
  } catch {
    /* private mode — the change still holds for this session */
  }
  window.dispatchEvent(new Event(DISMISSED_EVENT));
}
