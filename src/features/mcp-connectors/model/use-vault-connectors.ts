'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { connectorFingerprint, type ConnectorRecord } from '@/shared/lib/connector-record';
import {
  type ConnectorReadResult,
  type ConnectorStore,
  type ConnectorWriteResult,
  createVaultFileConnectorStore,
} from '@/shared/lib/connector-store';
import { forgetApproval, recordApproval, useMachineApprovals } from '@/shared/lib/machine-approvals';
import { getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';

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
  /** Null on the web, where nothing attaches, so nothing is asked. */
  vaultRoot: string | null;
  allowedHere: (connector: ConnectorRecord) => boolean;
  isOnHere: (connector: ConnectorRecord) => boolean;
  waitingHere: ReadonlySet<string>;
  changedSinceAllowed: ReadonlySet<string>;
  allowHere: (id: string) => boolean;
  reload: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<ConnectorWriteResult | null>;
  /** An edit made here to an allowed connector stays allowed. */
  upsert: (
    connector: ConnectorRecord,
    options?: { allowHere?: boolean },
  ) => Promise<ConnectorWriteResult | null>;
  remove: (id: string) => Promise<ConnectorWriteResult | null>;
}

/**
 * Stable, so a consumer memoising on `connectors` does not rebuild its session descriptor.
 */
const NONE: ConnectorRecord[] = [];
const NO_KEYS: string[] = [];
const NO_IDS: ReadonlySet<string> = new Set();

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
  const vaultRoot = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
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
  const connectors = current?.connectors ?? NONE;

  const approvals = useMachineApprovals();
  const allowedHere = useCallback(
    (connector: ConnectorRecord) =>
      approvals.approves('connector', vaultRoot, connector.id, connectorFingerprint(connector)),
    [approvals, vaultRoot],
  );
  const isOnHere = useCallback(
    (connector: ConnectorRecord) =>
      vaultRoot === null ? connector.enabled : connector.enabled && allowedHere(connector),
    [allowedHere, vaultRoot],
  );
  const waitingHere = useMemo(() => {
    if (vaultRoot === null) return NO_IDS;
    const ids = connectors
      .filter((connector) => connector.enabled && !allowedHere(connector))
      .map((connector) => connector.id);
    return ids.length > 0 ? new Set(ids) : NO_IDS;
  }, [allowedHere, connectors, vaultRoot]);
  const changedSinceAllowed = useMemo(() => {
    const ids = [...waitingHere].filter((id) => approvals.allowed('connector', vaultRoot, id) !== null);
    return ids.length > 0 ? new Set(ids) : NO_IDS;
  }, [approvals, vaultRoot, waitingHere]);

  // A press consents to the record as the screen shows it.
  const shown = (id: string) => connectors.find((connector) => connector.id === id);

  return {
    status: store ? (current?.status ?? 'loading') : 'unavailable',
    connectors,
    secretLiteralKeys: current?.secretLiteralKeys ?? NO_KEYS,
    vaultRoot,
    allowedHere,
    isOnHere,
    waitingHere,
    changedSinceAllowed,
    allowHere: (id) => {
      const connector = shown(id);
      return connector
        ? recordApproval('connector', vaultRoot, id, connectorFingerprint(connector))
        : false;
    },
    reload,
    setEnabled: (id, enabled) => {
      const connector = shown(id);
      // Before the write, so the row never reads "waiting" between the two.
      if (enabled && connector) {
        recordApproval('connector', vaultRoot, id, connectorFingerprint(connector));
      }
      return run((s) => s.setEnabled(id, enabled));
    },
    upsert: (connector, options) => {
      const before = shown(connector.id);
      if (options?.allowHere || (before !== undefined && allowedHere(before))) {
        recordApproval('connector', vaultRoot, connector.id, connectorFingerprint(connector));
      }
      return run((s) => s.upsert(connector));
    },
    remove: async (id) => {
      const result = await run((s) => s.remove(id));
      if (result?.status === 'saved') forgetApproval('connector', vaultRoot, id);
      return result;
    },
  };
}
