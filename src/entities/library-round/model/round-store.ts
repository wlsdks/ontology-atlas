import { ensureSidecarIgnore, isNotFoundError, VAULT_SIDECAR_DIR } from '@/shared/lib/vault-sidecar';

import {
  type RoundRecord,
  type RoundState,
  emptyRoundState,
  parseRoundState,
  serializeRoundState,
} from './round-record';

/**
 * `.ontology-atlas/rounds.json`, local to this Mac. Like `connector-store.ts`, every mutation
 * re-reads first and a malformed file is never overwritten.
 */

const ROUNDS_VAULT_FILE = 'rounds.json';

export interface RoundMedium {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

type RoundReadResult =
  | { status: 'ok' | 'missing'; state: RoundState }
  | { status: 'malformed' | 'unavailable'; state: RoundState };

type RoundWriteResult =
  | { status: 'saved'; state: RoundState }
  | { status: 'blocked_malformed' | 'blocked_unavailable' | 'write_failed'; state: RoundState };

export interface RoundStore {
  read(): Promise<RoundReadResult>;
  /** Replaces the whole state; every mutation replaces what was just read. */
  save(state: RoundState): Promise<RoundWriteResult>;
  upsert(round: RoundRecord): Promise<RoundWriteResult>;
  remove(id: string): Promise<RoundWriteResult>;
  /** Re-reads first; an unknown id saves unchanged. */
  patch(id: string, change: Partial<RoundRecord> | ((current: RoundRecord) => Partial<RoundRecord>)): Promise<RoundWriteResult>;
  /** Records when the window went hidden, unless an absence is open. */
  markAway(at: string): Promise<RoundWriteResult>;
  /** Closes the open absence into `lastAway`; none open saves unchanged. */
  markBack(at: string): Promise<RoundWriteResult>;
}

/** The newest moment the state proves the app was awake; an older `awayFrom` is stale. */
function lastKnownActivity(state: RoundState): number | null {
  let latest: number | null = null;
  const consider = (value: string | undefined) => {
    if (!value) return;
    const at = Date.parse(value);
    if (Number.isFinite(at) && (latest === null || at > latest)) latest = at;
  };
  for (const round of state.rounds) consider(round.lastPassAt);
  consider(state.lastAway?.to);
  return latest;
}

/** An on-disk absence starts no earlier than the app was last awake. */
function clampAbsenceStart(state: RoundState, awayFrom: string, at: string, bornAt: number): string {
  const opened = Date.parse(awayFrom);
  const floor = lastKnownActivity(state) ?? bornAt;
  if (Number.isFinite(opened) && opened >= floor) return awayFrom;
  const returned = Date.parse(at);
  // An absence never ends before it starts, whatever the two clocks say.
  return new Date(Number.isFinite(returned) ? Math.min(floor, returned) : floor).toISOString();
}

export function createRoundStore(medium: RoundMedium): RoundStore {
  /* An `awayFrom` this process did not write may be left by a crash, so its start is clamped;
   * one opened here is exact. */
  const bornAt = Date.now();
  let openedHere = false;

  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
  };

  const readCurrent = async (): Promise<RoundReadResult> => {
    let text: string | null;
    try {
      text = await medium.read();
    } catch {
      return { status: 'unavailable', state: emptyRoundState() };
    }
    const parsed = parseRoundState(text);
    return { status: parsed.status, state: parsed.state };
  };

  const write = async (state: RoundState): Promise<RoundWriteResult> => {
    try {
      await medium.write(serializeRoundState(state));
      return { status: 'saved', state };
    } catch {
      return { status: 'write_failed', state };
    }
  };

  const mutate = (change: (state: RoundState) => RoundState): Promise<RoundWriteResult> =>
    enqueue(async () => {
      const current = await readCurrent();
      if (current.status === 'malformed') return { status: 'blocked_malformed', state: current.state };
      if (current.status === 'unavailable') return { status: 'blocked_unavailable', state: current.state };
      return write(change(current.state));
    });

  return {
    read: () => enqueue(readCurrent),
    save: (state) => mutate(() => state),
    upsert: (round) =>
      mutate((state) => {
        const index = state.rounds.findIndex((entry) => entry.id === round.id);
        const rounds = index < 0 ? [...state.rounds, round] : state.rounds.map((entry, i) => (i === index ? round : entry));
        return { ...state, rounds };
      }),
    remove: (id) => mutate((state) => ({ ...state, rounds: state.rounds.filter((entry) => entry.id !== id) })),
    patch: (id, change) =>
      mutate((state) => ({
        ...state,
        rounds: state.rounds.map((entry) => (entry.id === id ? { ...entry, ...(typeof change === 'function' ? change(entry) : change), id } : entry)),
      })),
    markAway: (at) =>
      mutate((state) => {
        if (state.awayFrom) return state;
        openedHere = true;
        return { ...state, awayFrom: at };
      }),
    markBack: (at) =>
      mutate((state) => {
        if (!state.awayFrom) return state;
        const from = openedHere ? state.awayFrom : clampAbsenceStart(state, state.awayFrom, at, bornAt);
        openedHere = false;
        const next: RoundState = { ...state, lastAway: { from, to: at } };
        delete next.awayFrom;
        return next;
      }),
  };
}

export function createMemoryRoundStore(seed: string | null = null): RoundStore & { text(): string | null } {
  let text = seed;
  const store = createRoundStore({
    read: async () => text,
    write: async (next) => {
      text = next;
    },
  });
  return { ...store, text: () => text };
}

export function createVaultFileRoundStore(handle: FileSystemDirectoryHandle): RoundStore {
  const sidecar = (create: boolean) => handle.getDirectoryHandle(VAULT_SIDECAR_DIR, { create });
  let ignoreEnsured = false;
  return createRoundStore({
    read: async () => {
      try {
        const directory = await sidecar(false);
        const file = await directory.getFileHandle(ROUNDS_VAULT_FILE);
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
      const file = await directory.getFileHandle(ROUNDS_VAULT_FILE, { create: true });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
    },
  });
}
