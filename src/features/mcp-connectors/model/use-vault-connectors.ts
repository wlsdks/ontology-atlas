'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ConnectorRecord } from '@/shared/lib/connector-record';
import {
  type ConnectorReadResult,
  type ConnectorStore,
  type ConnectorWriteResult,
  createVaultFileConnectorStore,
} from '@/shared/lib/connector-store';

/**
 * The connectors beside the open vault as screen state. The file is the source of truth: each
 * change re-reads before writing (`connector-store.ts`) and the write result updates the
 * screen, because an optimistic copy could disagree with a folder edited elsewhere. The list
 * works on the web too; keychain tokens and agent spawning stay app-only, and the screen says so.
 */
export interface VaultConnectorsState {
  /**
   * `malformed` means the file exists and is not ours, which blocks writing, so the screen must
   * say so rather than show an empty list.
   */
  status: 'loading' | 'ready' | 'malformed' | 'unavailable';
  connectors: ConnectorRecord[];
  /** `<connector>.<variable>` for each plaintext credential the file still holds. */
  secretLiteralKeys: string[];
  reload: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<ConnectorWriteResult | null>;
  upsert: (connector: ConnectorRecord) => Promise<ConnectorWriteResult | null>;
  remove: (id: string) => Promise<ConnectorWriteResult | null>;
}

/**
 * Stable, so a consumer memoising on `connectors` does not rebuild its session descriptor.
 */
const NONE: ConnectorRecord[] = [];
const NO_KEYS: string[] = [];

/** Keyed by the folder that answered, so a late answer from the previous vault is dropped. */
interface Loaded {
  store: ConnectorStore;
  status: 'ready' | 'malformed' | 'unavailable';
  connectors: ConnectorRecord[];
  secretLiteralKeys: string[];
}

function toLoaded(store: ConnectorStore, result: ConnectorReadResult): Loaded {
  return {
    store,
    status:
      result.status === 'malformed'
        ? 'malformed'
        : result.status === 'unavailable'
          ? 'unavailable'
          : 'ready',
    connectors: [...result.connectors],
    secretLiteralKeys: [...result.secretLiteralKeys],
  };
}

export function useVaultConnectors(
  handle: FileSystemDirectoryHandle | null | undefined,
): VaultConnectorsState {
  const store: ConnectorStore | null = useMemo(
    () => (handle ? createVaultFileConnectorStore(handle) : null),
    [handle],
  );
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void store.read().then((result) => {
      if (!cancelled) setLoaded(toLoaded(store, result));
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const reload = useCallback(async () => {
    if (!store) return;
    setLoaded(toLoaded(store, await store.read()));
  }, [store]);

  const run = useCallback(
    async (job: (store: ConnectorStore) => Promise<ConnectorWriteResult>) => {
      if (!store) return null;
      const result = await job(store);
      // A refused write changes only the status, so the reason sits beside a list that is still
      // true.
      setLoaded((previous) => ({
        store,
        status:
          result.status === 'blocked_malformed'
            ? 'malformed'
            : result.status === 'blocked_unavailable'
              ? 'unavailable'
              : 'ready',
        connectors: [...result.connectors],
        secretLiteralKeys: previous?.store === store ? previous.secretLiteralKeys : [],
      }));
      return result;
    },
    [store],
  );

  // Only this folder's answer; before the first read, and after the folder changes, the state
  // is loading, not the previous vault's list.
  const current = loaded && loaded.store === store ? loaded : null;

  return {
    status: store ? (current?.status ?? 'loading') : 'unavailable',
    connectors: current?.connectors ?? NONE,
    secretLiteralKeys: current?.secretLiteralKeys ?? NO_KEYS,
    reload,
    setEnabled: (id, enabled) => run((s) => s.setEnabled(id, enabled)),
    upsert: (connector) => run((s) => s.upsert(connector)),
    remove: (id) => run((s) => s.remove(id)),
  };
}
