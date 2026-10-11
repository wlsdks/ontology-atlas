import { useCallback, useSyncExternalStore } from "react";

function readLocalStorageBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    if (saved === null) return fallback;
    return saved === "1";
  } catch {
    return fallback;
  }
}

export function useLocalStorageBoolean(
  key: string,
  fallback: boolean,
): boolean {
  const getSnapshot = useCallback(
    () => readLocalStorageBoolean(key, fallback),
    [fallback, key],
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(() => () => undefined, getSnapshot, getServerSnapshot);
}
