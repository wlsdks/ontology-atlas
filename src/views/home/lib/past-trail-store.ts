/**
 * Storage layer for past trails — the only path that reads, writes,
 * or erases them. Nothing here expires or idles a live trail out.
 *
 * **Why a file inside the vault.** Browser storage (localStorage/IndexedDB) is
 * per-origin, so trails accumulated on the web and trails accumulated in the
 * installed Tauri app (a different origin) would be invisible to each other even
 * with the same vault folder open. Owner decision: "웹/앱에서 동일하게 보여야지?"
 * (the web and the app must show the same thing), and the vault folder is the
 * only ground both surfaces share.
 *
 * It does not leak to a team: `.ontology-atlas/` is this product's existing
 * sidecar folder (`agent-activity.json` lives there), this repo's `.gitignore`
 * already ignores it whole, and the vault indexer skips dot-directories, so
 * writing here never triggers a manifest rebuild.
 *
 * **Why the interface is this narrow.** Screens know only the four
 * `PastTrailStore` methods; file access is confined to
 * `createVaultFilePastTrailStore` below; and the format rules (schema, caps,
 * duplicate detection, serialization) sit as pure functions in
 * `past-trail-record.ts`. Moving the storage location again swaps one medium.
 */

import {
  deserializePastTrails,
  serializePastTrails,
  upsertPastWalk,
  type PastWalk,
  type PastWalkEntry,
  type UpsertPastWalkOptions,
} from "./past-trail-record";

/** Sidecar folder inside the vault — where `agent-activity.json` already lives. */
export const PAST_TRAILS_VAULT_DIR = ".ontology-atlas";
export const PAST_TRAILS_VAULT_FILE = "past-trails.json";
export const PAST_TRAILS_RELATIVE_PATH = `${PAST_TRAILS_VAULT_DIR}/${PAST_TRAILS_VAULT_FILE}`;
/** Lets the sidecar folder hide itself from git, matching this repo's `.gitignore`. */
export const SIDECAR_IGNORE_FILE = ".gitignore";
export const SIDECAR_IGNORE_CONTENT = "# Ontology Atlas local runtime state — not for commit.\n*\n";

/** Everything screens and hooks see. Each call returns the updated list, so no caller re-reads. */
export interface PastTrailStore {
  /** Saved trails, most recent first. A read failure degrades to an empty list. */
  list(): Promise<PastWalk[]>;
  /**
   * Overwrites the walk in progress under the same id; below the threshold it
   * does nothing. A failed write (no permission, say) returns the list and moves
   * on — saving is a convenience and must never block the session.
   */
  save(
    walkId: string,
    entries: readonly PastWalkEntry[],
    options?: UpsertPastWalkOptions,
  ): Promise<PastWalk[]>;
  /** Removes one trail. */
  remove(walkId: string): Promise<PastWalk[]>;
  /** Removes everything, the file included. */
  clear(): Promise<PastWalk[]>;
}

/** The swap point: one blob of text in and out. The medium knows no schema, cap, or dedup rule. */
export interface PastTrailMedium {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  erase(): Promise<void>;
}

/** Layers the format rules over a medium — the body every implementation shares. */
export function createPastTrailStore(medium: PastTrailMedium): PastTrailStore {
  // Writes are serialized: this is a read-modify-write called on every step, and
  // overlapping ones would drop the last step.
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
  // A failed write must not pretend the list grew — a screen disagreeing with
  // what is on disk is a silent lie. It does not throw either: saving is a
  // convenience and must never block the session.
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
        // Unchanged content leaves the file alone: this runs on every step, and
        // pointless writes must not pile up on the user's disk.
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

/** Silent stand-in for contract tests and for sessions with no vault to write to. */
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
 * **The only place that touches vault files.** Moving storage swaps the medium
 * built here and nothing else.
 *
 * It never asks for write permission: prompting someone who came only to browse
 * is friction. Sessions that already hold readwrite record quietly; the rest
 * record nothing (the caller checks the permission and decides).
 */
export function createVaultFilePastTrailStore(
  handle: FileSystemDirectoryHandle,
): PastTrailStore {
  const dir = async (create: boolean) =>
    handle.getDirectoryHandle(PAST_TRAILS_VAULT_DIR, { create });
  // The sidecar ignores itself: a user's vault is usually its own git repo, and
  // a trail file showing in `git status` can get committed by accident and expose
  // their browsing to the team. An existing file is never overwritten.
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
        // Neither folder nor file existing yet is the normal initial state.
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
