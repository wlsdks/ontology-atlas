'use client';

import { useMemo, useSyncExternalStore } from 'react';

type Phase = 'idle' | 'creating' | 'failed';

class StarterRecoveryStore {
  private phase: Phase = 'idle';
  private listeners = new Set<() => void>();

  read = () => this.phase;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  begin() {
    if (this.phase === 'creating') return false;
    this.set('creating');
    return true;
  }

  fail() { this.set('failed'); }
  clear = () => { this.set('idle'); };

  private set(phase: Phase) {
    this.phase = phase;
    this.listeners.forEach((listener) => listener());
  }
}

const folders = new WeakMap<object, StarterRecoveryStore>();

export function getStarterRecovery(scope: object | null) {
  if (!scope) return new StarterRecoveryStore();
  let store = folders.get(scope);
  if (!store) {
    store = new StarterRecoveryStore();
    folders.set(scope, store);
  }
  return store;
}

export function useStarterRecovery(scope: object | null) {
  const store = useMemo(() => getStarterRecovery(scope), [scope]);
  const phase = useSyncExternalStore(store.subscribe, store.read, () => 'idle');
  return { store, phase };
}
