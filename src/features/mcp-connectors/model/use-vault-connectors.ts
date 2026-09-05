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
 * The connectors stored beside the open vault, as one piece of screen state.
 *
 * The file is the source of truth and this is a view of it: every change re-reads before it writes
 * (`connector-store.ts` serializes that pair), and the result of the write is what updates the
 * screen. Holding an optimistic copy here would let the screen and the folder disagree, and the
 * folder is the thing another surface — or the person, in an editor — can change underneath us.
 *
 * Both surfaces use this. The store is built from the directory handle, which the browser has too,
 * so the *list* works on the web. What the web cannot do is put a token in a keychain or spawn the
 * agent that would use one; that boundary belongs to the screen, which says so.
 */
export interface VaultConnectorsState {
  /**
   * `loading` before the first read, `unavailable` with no folder open. `malformed` means the
   * file exists and is not ours — which blocks writing, so the screen must say it rather than
   * showing an empty list somebody would happily add to.
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
 * A stable empty array, so a consumer memoising on `connectors` does not rebuild its session
 * descriptor on every render of a vault that has none.
 */
const NONE: ConnectorRecord[] = [];
const NO_KEYS: string[] = [];

/** What the file said, and **which folder said it** — a late answer from the previous vault is
 * dropped rather than painted over the current one. */
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
      // A refused write leaves the screen showing what the file still says; only the status
      // changes, so the reason can be stated beside a list that is still true.
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

  // The answer for **this** folder only. Before the first read lands — and after the folder
  // changes — the honest state is "loading", not the previous vault's list.
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
