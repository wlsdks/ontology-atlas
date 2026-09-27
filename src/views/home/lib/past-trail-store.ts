/**
 * The only path that reads, writes or erases past trails.
 * A vault file, not browser storage, because the web and the app (different origins) must show the
 * same trails.
 * `.ontology-atlas/` is gitignored and skipped by the indexer, so writes never trigger a manifest
 * rebuild.
 */

import {
  deserializePastTrails,
  serializePastTrails,
  upsertPastWalk,
  type PastWalk,
  type PastWalkEntry,
  type UpsertPastWalkOptions,
} from "./past-trail-record";

/** Where `agent-activity.json` already lives. */
export const PAST_TRAILS_VAULT_DIR = ".ontology-atlas";
export const PAST_TRAILS_VAULT_FILE = "past-trails.json";
export const PAST_TRAILS_RELATIVE_PATH = `${PAST_TRAILS_VAULT_DIR}/${PAST_TRAILS_VAULT_FILE}`;
export const SIDECAR_IGNORE_FILE = ".gitignore";
export const SIDECAR_IGNORE_CONTENT = "# Ontology Atlas local runtime state — not for commit.\n*\n";

/** Each call returns the updated list, so no caller re-reads. */
export interface PastTrailStore {
  /** A read failure degrades to an empty list. */
  list(): Promise<PastWalk[]>;
  /**
   * Below the threshold it does nothing; a failed write returns the list, since saving never
   * blocks the session.
   */
  save(
    walkId: string,
    entries: readonly PastWalkEntry[],
    options?: UpsertPastWalkOptions,
  ): Promise<PastWalk[]>;
  remove(walkId: string): Promise<PastWalk[]>;
  clear(): Promise<PastWalk[]>;
}

/** The swap point: one blob of text; the medium knows no schema, cap or dedup rule. */
export interface PastTrailMedium {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  erase(): Promise<void>;
}

export function createPastTrailStore(medium: PastTrailMedium): PastTrailStore {
  // Serialized read-modify-write on every step, or overlapping saves drop the last step.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const readWalks = async () => {
    try {
      return deserializePastTrails(await medium.read());
    } catch {
      return [];
    }
  };
  // A failed write keeps the old list, or the screen disagrees with disk; it does not throw
  // either.
  const commit = async (walks: PastWalk[], fallback: PastWalk[]) => {
    try {
      await medium.write(serializePastTrails(walks));
      return walks;
    } catch {
      return fallback;
    }
  };

  return {
    list: () => enqueue(readWalks),
    save: (walkId, entries, options) =>
      enqueue(async () => {
        const current = await readWalks();
        const next = upsertPastWalk(current, walkId, entries, options);
        // Skips unchanged content, since this runs on every step.
        if (serializePastTrails(next) === serializePastTrails(current)) return current;
        return commit(next, current);
      }),
    remove: (walkId) =>
      enqueue(async () => {
        const current = await readWalks();
        return commit(
          current.filter((walk) => walk.id !== walkId),
          current,
        );
      }),
    clear: () =>
      enqueue(async () => {
        try {
          await medium.erase();
        } catch {
          /* ignore */
        }
        return [];
      }),
  };
}

export function createMemoryPastTrailStore(seed: string | null = null): PastTrailStore {
  let text: string | null = seed;
  return createPastTrailStore({
    read: async () => text,
    write: async (next) => {
      text = next;
    },
    erase: async () => {
      text = null;
    },
  });
}

/**
 * The only place that touches vault files. It never asks for write permission: prompting a browser
 * is friction.
 * Sessions without readwrite record nothing (the caller decides).
 */
export function createVaultFilePastTrailStore(
  handle: FileSystemDirectoryHandle,
): PastTrailStore {
  const dir = async (create: boolean) =>
    handle.getDirectoryHandle(PAST_TRAILS_VAULT_DIR, { create });
  // A vault is usually its own git repo, so the sidecar ignores itself, or a commit can expose
  // browsing to the team.
  // An existing file is never overwritten.
  let ignoreEnsured = false;
  const ensureSelfIgnore = async (sidecar: FileSystemDirectoryHandle) => {
    if (ignoreEnsured) return;
    ignoreEnsured = true;
    try {
      await sidecar.getFileHandle(SIDECAR_IGNORE_FILE);
      return;
    } catch {
      /* absent, so create it */
    }
    try {
      const fh = await sidecar.getFileHandle(SIDECAR_IGNORE_FILE, { create: true });
      const writable = await fh.createWritable();
      await writable.write(SIDECAR_IGNORE_CONTENT);
      await writable.close();
    } catch {
      /* no permission — the trail write is blocked anyway */
    }
  };
  return createPastTrailStore({
    read: async () => {
      try {
        const file = await (await dir(false)).getFileHandle(PAST_TRAILS_VAULT_FILE);
        return await (await file.getFile()).text();
      } catch {
        return null;
      }
    },
    write: async (text) => {
      const sidecar = await dir(true);
      await ensureSelfIgnore(sidecar);
      const file = await sidecar.getFileHandle(PAST_TRAILS_VAULT_FILE, {
        create: true,
      });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
    },
    erase: async () => {
      try {
        await (await dir(false)).removeEntry(PAST_TRAILS_VAULT_FILE);
      } catch {
        /* already gone */
      }
    },
  });
}
