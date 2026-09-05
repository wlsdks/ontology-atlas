/**
 * Reading and writing `<vault>/.ontology-atlas/connectors.json`.
 *
 * The same shape as `project-source-store.ts`: a `medium` that knows how to move text, a serialized
 * queue so two saves cannot interleave, and a vault-file implementation over the File System Access
 * handle — which is what makes this work identically in the installed app and in a browser, because
 * both hold the same folder.
 *
 * ## What this refuses to do
 *
 * A **malformed** file blocks every write. The file may hold connectors somebody spent time on, or
 * it may be a newer version of this format written by a later build; overwriting it with what this
 * build happens to have in memory turns "Atlas could not read your file" into "Atlas deleted your
 * file". The screen reports it and points at the file.
 *
 * Writes go through `serializeConnectorState`, which throws rather than put a credential-shaped
 * literal into the vault folder. That throw is surfaced, not swallowed.
 */
import {
  ConnectorSecretLiteralError,
  type ConnectorRecord,
  deserializeConnectorState,
  serializeConnectorState,
} from './connector-record';
import { ensureSidecarIgnore, isNotFoundError, VAULT_SIDECAR_DIR } from './vault-sidecar';

export const CONNECTORS_VAULT_FILE = 'connectors.json';
export const CONNECTORS_RELATIVE_PATH = `${VAULT_SIDECAR_DIR}/${CONNECTORS_VAULT_FILE}`;

export interface ConnectorMedium {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export type ConnectorReadResult =
  | {
      status: 'ok';
      connectors: ConnectorRecord[];
      /** `<connector>.<variable>` for every plaintext credential the file held. */
      secretLiteralKeys: string[];
    }
  | { status: 'missing'; connectors: []; secretLiteralKeys: [] }
  | { status: 'malformed' | 'unavailable'; connectors: []; secretLiteralKeys: [] };

export type ConnectorWriteResult =
  | { status: 'saved'; connectors: ConnectorRecord[] }
  | {
      /** The variables that would have been written in plain text — never their values. */
      status: 'blocked_secret';
      connectors: ConnectorRecord[];
      keys: string[];
    }
  | {
      status: 'blocked_malformed' | 'blocked_unavailable' | 'write_failed';
      connectors: ConnectorRecord[];
    };

export interface ConnectorStore {
  read(): Promise<ConnectorReadResult>;
  /** Replace the whole list. Every mutation is expressed as a replacement of what was just read. */
  save(connectors: ConnectorRecord[]): Promise<ConnectorWriteResult>;
  /** Turn one connector on or off, re-reading first so a concurrent edit is not lost. */
  setEnabled(id: string, enabled: boolean): Promise<ConnectorWriteResult>;
  /** Add or replace one connector by id. */
  upsert(connector: ConnectorRecord): Promise<ConnectorWriteResult>;
  remove(id: string): Promise<ConnectorWriteResult>;
}

export function createConnectorStore(medium: ConnectorMedium): ConnectorStore {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const readCurrent = async (): Promise<ConnectorReadResult> => {
    let text: string | null;
    try {
      text = await medium.read();
    } catch {
      return { status: 'unavailable', connectors: [], secretLiteralKeys: [] };
    }
    if (text === null) return { status: 'missing', connectors: [], secretLiteralKeys: [] };
    const parsed = deserializeConnectorState(text);
    if (parsed.malformed) return { status: 'malformed', connectors: [], secretLiteralKeys: [] };
    return {
      status: 'ok',
      connectors: parsed.connectors,
      secretLiteralKeys: parsed.secretLiteralKeys,
    };
  };

  const commit = async (
    current: ConnectorReadResult,
    connectors: ConnectorRecord[],
  ): Promise<ConnectorWriteResult> => {
    if (current.status === 'malformed') {
      return { status: 'blocked_malformed', connectors: [] };
    }
    if (current.status === 'unavailable') {
      return { status: 'blocked_unavailable', connectors: [] };
    }
    let text: string;
    try {
      text = serializeConnectorState({ connectors });
    } catch (error) {
      if (error instanceof ConnectorSecretLiteralError) {
        return {
          status: 'blocked_secret',
          connectors: current.connectors,
          keys: error.keys,
        };
      }
      throw error;
    }
    try {
      await medium.write(text);
    } catch {
      return { status: 'write_failed', connectors: current.connectors };
    }
    return { status: 'saved', connectors };
  };

  /** Read, transform, write — all inside one queue slot, so nothing lands between the two. */
  const mutate = (
    change: (current: ConnectorRecord[]) => ConnectorRecord[],
  ): Promise<ConnectorWriteResult> =>
    enqueue(async () => {
      const current = await readCurrent();
      return commit(current, change(current.connectors));
    });

  return {
    read: () => enqueue(readCurrent),
    save: (connectors) => mutate(() => connectors),
    setEnabled: (id, enabled) =>
      mutate((current) =>
        current.map((connector) =>
          connector.id === id ? { ...connector, enabled } : connector,
        ),
      ),
    upsert: (connector) =>
      mutate((current) =>
        current.some((candidate) => candidate.id === connector.id)
          ? current.map((candidate) => (candidate.id === connector.id ? connector : candidate))
          : [...current, connector],
      ),
    remove: (id) => mutate((current) => current.filter((connector) => connector.id !== id)),
  };
}

export function createMemoryConnectorStore(seed: string | null = null): ConnectorStore {
  let text = seed;
  return createConnectorStore({
    read: async () => text,
    write: async (next) => {
      text = next;
    },
  });
}

/**
 * The store backed by the vault folder itself — the one both surfaces use, because both hold the
 * same directory handle. A missing file is an empty starting state; any other read failure stays a
 * failure, so an unreadable file is never overwritten as though it had vanished.
 */
export function createVaultFileConnectorStore(
  handle: FileSystemDirectoryHandle,
): ConnectorStore {
  const sidecar = (create: boolean) => handle.getDirectoryHandle(VAULT_SIDECAR_DIR, { create });
  let ignoreEnsured = false;
  return createConnectorStore({
    read: async () => {
      try {
        const directory = await sidecar(false);
        const file = await directory.getFileHandle(CONNECTORS_VAULT_FILE);
        return await (await file.getFile()).text();
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    write: async (text) => {
      const directory = await sidecar(true);
      if (!ignoreEnsured) {
        await ensureSidecarIgnore(directory);
        ignoreEnsured = true;
      }
      const file = await directory.getFileHandle(CONNECTORS_VAULT_FILE, { create: true });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
    },
  });
}

/** The connectors the person actually turned on — the only ones a session ever sees. */
export function enabledConnectors(
  connectors: readonly ConnectorRecord[],
): ConnectorRecord[] {
  return connectors.filter((connector) => connector.enabled);
}
