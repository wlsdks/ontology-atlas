'use client';

import { useMemo, useSyncExternalStore } from 'react';

const EMPTY_CONTEXT = { selectedId: null as string | null, query: '' };

function createReadingContext() {
  let snapshot = EMPTY_CONTEXT;
  const listeners = new Set<() => void>();
  return {
    read: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select: (selectedId: string | null) => {
      if (snapshot.selectedId === selectedId) return;
      snapshot = { ...snapshot, selectedId };
      listeners.forEach((listener) => listener());
    },
    search: (query: string) => {
      if (snapshot.query === query) return;
      snapshot = { ...snapshot, query };
      listeners.forEach((listener) => listener());
    },
  };
}

const folderContexts = new WeakMap<object, ReturnType<typeof createReadingContext>>();

export function useMapReadingContext(scope: object | null) {
  const store = useMemo(() => {
    if (!scope) return createReadingContext();
    let context = folderContexts.get(scope);
    if (!context) {
      context = createReadingContext();
      folderContexts.set(scope, context);
    }
    return context;
  }, [scope]);
  const snapshot = useSyncExternalStore(store.subscribe, store.read, () => EMPTY_CONTEXT);
  return { ...snapshot, select: store.select, search: store.search };
}
