import { useSyncExternalStore } from 'react';
import { useLocalVault } from './local-vault-context';

const NOTIFY_INTERVAL_MS = 250;

interface VaultLoadProgress {
  read: number;
  total: number;
}

export interface VaultLoadProgressStore {
  get: () => VaultLoadProgress | null;
  set: (progress: VaultLoadProgress | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createVaultLoadProgressStore(): VaultLoadProgressStore {
  let current: VaultLoadProgress | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const listener of listeners) listener();
  };
  return {
    get: () => current,
    set: (progress) => {
      if (progress === current) return;
      const first = current === null;
      current = progress;
      if (progress === null || first) notify();
      else if (timer === null) timer = setTimeout(notify, NOTIFY_INTERVAL_MS);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const IDLE_STORE = createVaultLoadProgressStore();

export function useVaultLoadProgress(): VaultLoadProgress | null {
  const store = useLocalVault().loadProgressStore ?? IDLE_STORE;
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}
