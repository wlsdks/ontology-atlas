import { isNotFoundError, VAULT_SIDECAR_DIR } from '@/shared/lib/vault-sidecar';

/**
 * `.ontology-atlas/rounds-ledger.jsonl` — one line per pass, and one per gap.
 *
 * The ledger is what the morning card and the time axis draw. It records what the app itself
 * witnessed: which round ran, when, what it checked, what went stale, what it wrote, and what it
 * refused. It holds no page text and no tool output, the same rule `acp-work.jsonl` keeps.
 * Page writes still reach `wiki/_log.md` through the Compile path; this file is the process, that
 * file is the wiki.
 *
 * `asleep` is an entry, not an absence: a person reading a gap in the axis must be able to tell
 * "the Mac was asleep" from "the round was paused" from "the app was not open", and only the
 * first two are things the app can know at the next tick.
 */

const ROUNDS_LEDGER_FILE = 'rounds-ledger.jsonl';
export const ROUNDS_LEDGER_CAP = 500;

export type RoundPassOutcome =
  | 'held'
  | 'stale'
  | 'redrafted'
  | 'refused'
  | 'failed'
  | 'asleep';

export interface RoundPassEntry {
  v: 1;
  id: string;
  /** Absent for an `asleep` gap, which belongs to no round. */
  roundId?: string;
  roundName?: string;
  kind?: 'consistency' | 'service';
  startedAt: string;
  endedAt: string;
  outcome: RoundPassOutcome;
  /** How many pages the pass looked at. */
  checked: number;
  /** Page slugs whose source changed under them. */
  stale: string[];
  /** Vault-relative paths written by the pass (sources and pages). */
  written: string[];
  /** Tool names or paths the standing scope refused. */
  refused: string[];
  /** Connector and vault tools the pass called, so a person sees exactly what it reached. */
  called: string[];
  agentTurns: 0 | 1;
  /** One sentence for the axis, in the locale the pass ran under. */
  summary: string;
  /** Manual "Run now" versus the clock. */
  trigger: 'clock' | 'manual' | 'catch-up';
}

const OUTCOMES: readonly RoundPassOutcome[] = ['held', 'stale', 'redrafted', 'refused', 'failed', 'asleep'];

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function parseRoundPassEntry(line: string): RoundPassEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (record.v !== 1 || typeof record.id !== 'string') return null;
  if (typeof record.startedAt !== 'string' || typeof record.endedAt !== 'string') return null;
  if (!OUTCOMES.includes(record.outcome as RoundPassOutcome)) return null;
  const entry: RoundPassEntry = {
    v: 1,
    id: record.id,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    outcome: record.outcome as RoundPassOutcome,
    checked: typeof record.checked === 'number' ? record.checked : 0,
    stale: stringList(record.stale),
    written: stringList(record.written),
    refused: stringList(record.refused),
    called: stringList(record.called),
    agentTurns: record.agentTurns === 1 ? 1 : 0,
    summary: typeof record.summary === 'string' ? record.summary : '',
    trigger: record.trigger === 'manual' || record.trigger === 'catch-up' ? record.trigger : 'clock',
  };
  if (typeof record.roundId === 'string') entry.roundId = record.roundId;
  if (typeof record.roundName === 'string') entry.roundName = record.roundName;
  if (record.kind === 'consistency' || record.kind === 'service') entry.kind = record.kind;
  return entry;
}

/** Oldest first, as the file holds them. Unreadable lines are skipped, never fatal. */
export function parseRoundLedger(text: string | null): RoundPassEntry[] {
  if (!text) return [];
  const entries: RoundPassEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const entry = parseRoundPassEntry(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function appendToLedgerText(current: string, entry: RoundPassEntry, cap = ROUNDS_LEDGER_CAP): string {
  const prior = current.split('\n').filter((line) => line.trim()).slice(-(cap - 1));
  return [...prior, JSON.stringify(entry)].join('\n') + '\n';
}

export interface RoundLedger {
  read(): Promise<RoundPassEntry[]>;
  append(entry: RoundPassEntry): Promise<void>;
}

interface LedgerMedium {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

function createRoundLedger(medium: LedgerMedium): RoundLedger {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
  return {
    read: () => enqueue(async () => parseRoundLedger(await medium.read())),
    append: (entry) =>
      enqueue(async () => {
        const current = (await medium.read()) ?? '';
        await medium.write(appendToLedgerText(current, entry));
      }),
  };
}

export function createMemoryRoundLedger(seed: string | null = null): RoundLedger & { text(): string | null } {
  let text = seed;
  const ledger = createRoundLedger({
    read: async () => text,
    write: async (next) => {
      text = next;
    },
  });
  return { ...ledger, text: () => text };
}

export function createVaultRoundLedger(handle: FileSystemDirectoryHandle): RoundLedger {
  const sidecar = (create: boolean) => handle.getDirectoryHandle(VAULT_SIDECAR_DIR, { create });
  return createRoundLedger({
    read: async () => {
      try {
        const directory = await sidecar(false);
        const file = await directory.getFileHandle(ROUNDS_LEDGER_FILE);
        return await (await file.getFile()).text();
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    write: async (text) => {
      const directory = await sidecar(true);
      const file = await directory.getFileHandle(ROUNDS_LEDGER_FILE, { create: true });
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
    },
  });
}
