import { useCallback, useSyncExternalStore } from "react";

export const PREFERENCE_CHANGE_EVENT = "ontology-atlas:preference-change";

export interface PreferenceDefinition<V extends string> {
  readonly key: string;
  readonly values: readonly V[];
  readonly fallback: V;
}

export interface Preference<V extends string> extends PreferenceDefinition<V> {
  resolve(saved: string | null): V;
  read(): V;
  write(value: V): void;
  subscribe(onChange: () => void): () => void;
  use(): V;
}

export function definePreference<V extends string>({
  key,
  values,
  fallback,
}: PreferenceDefinition<V>): Preference<V> {
  const resolve = (saved: string | null): V =>
    values.includes(saved as V) ? (saved as V) : fallback;

  const read = (): V => {
    if (typeof window === "undefined") return fallback;
    try {
      return resolve(window.localStorage.getItem(key));
    } catch {
      return fallback;
    }
  };

  const write = (value: V): void => {
    if (typeof window === "undefined") return;
    const announce = () =>
      window.dispatchEvent(new CustomEvent(PREFERENCE_CHANGE_EVENT, { detail: { key } }));
    try {
      window.localStorage.setItem(key, value);
    } catch {
      announce();
      return;
    }
    announce();
  };

  const subscribe = (onChange: () => void): (() => void) => {
    if (typeof window === "undefined") return () => undefined;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) onChange();
    };
    window.addEventListener(PREFERENCE_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PREFERENCE_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  };

  const getServerSnapshot = (): V => fallback;

  function use(): V {
    const getSnapshot = useCallback(read, []);
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  }

  return { key, values, fallback, resolve, read, write, subscribe, use };
}
