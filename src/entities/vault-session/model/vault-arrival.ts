import { useSyncExternalStore } from 'react';
import { useLocalVault } from './local-vault-context';

export interface VaultArrivalStore<Part> {
  get: () => Part | null;
  version: () => number;
  set: (part: Part | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createVaultArrivalStore<Part>(): VaultArrivalStore<Part> {
  let current: Part | null = null;
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    version: () => version,
    set: (part) => {
      if (part === current) return;
      current = part;
      version += 1;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const IDLE_STORE = createVaultArrivalStore<never>();

export function useArrivingManifest() {
  const vault = useLocalVault();
  const store = vault.arrivalStore ?? IDLE_STORE;
  useSyncExternalStore(store.subscribe, store.version, () => 0);
  return vault.partialTotal > 0 ? store.get() : null;
}
