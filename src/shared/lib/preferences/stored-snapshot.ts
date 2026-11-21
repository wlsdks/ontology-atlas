/**
 * `useSyncExternalStore` compares snapshots with `Object.is`, so returning a fresh object or Set on
 * every call loops forever. This returns the same value until the raw stored string changes, and
 * parses again only then.
 */
export function createStoredSnapshot<Value>(
  storageKey: string,
  fallback: Value,
  parse: () => Value,
): () => Value {
  let cachedRaw: string | null = null;
  let cachedValue: Value = fallback;
  return () => {
    if (typeof window === "undefined") return fallback;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      return fallback;
    }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    cachedValue = parse();
    return cachedValue;
  };
}
