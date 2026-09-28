import { isNotFoundError, VAULT_SIDECAR_DIR } from '@/shared/lib/vault-sidecar';

/**
 * `.ontology-atlas/rounds-ledger.jsonl`: one line per pass or gap, with no page text or tool
 * output. `asleep` is an entry so a sleeping Mac is told apart from a paused round.
 */

const ROUNDS_LEDGER_FILE = 'rounds-ledger.jsonl';
export const ROUNDS_LEDGER_CAP = 500;

export type RoundPassOutcome =
  | 'held'
  | 'reviewed'
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
  kind?: 'consistency' | 'service' | 'ontology';
  startedAt: string;
  endedAt: string;
  outcome: RoundPassOutcome;
  checked: number;
  /** Pages whose source changed under them. */
  stale: string[];
  /** Paths written by the pass. */
  written: string[];
  /** Tool names or paths the standing scope refused. */
  refused: string[];
  /** Tools the pass called. */
  called: string[];
  /** Place labels, absent on older entries. */
  places?: string[];
  agentTurns: 0 | 1;
  /** In the locale the pass ran under. */
  summary: string;
  trigger: 'clock' | 'manual' | 'catch-up';
  /** `no-agent`: no guarded agent was ready, so nothing was written; `stopped`: removed or paused mid-pass. */
  note?: 'no-agent' | 'stopped';
  undone?: RoundUndone[];
  leftAsIs?: string[];
}

export type RoundUndoReason = 'not-draft' | 'duplicate-key' | 'forbidden-key' | 'no-frontmatter' | 'unreadable';

export interface RoundUndone {
  path: string;
  reason: RoundUndoReason;
  key?: string;
  action: 'restored' | 'removed' | 'failed';
  copy?: string;
}

const UNDO_REASONS: readonly RoundUndoReason[] = ['not-draft', 'duplicate-key', 'forbidden-key', 'no-frontmatter', 'unreadable'];
const UNDO_ACTIONS: readonly RoundUndone['action'][] = ['restored', 'removed', 'failed'];

function parseUndone(value: unknown): RoundUndone[] {
  if (!value || typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  if (typeof item.path !== 'string' || !UNDO_REASONS.includes(item.reason as RoundUndoReason)) return [];
  if (!UNDO_ACTIONS.includes(item.action as RoundUndone['action'])) return [];
  const undone: RoundUndone = { path: item.path, reason: item.reason as RoundUndoReason, action: item.action as RoundUndone['action'] };
  if (typeof item.key === 'string') undone.key = item.key;
  if (typeof item.copy === 'string') undone.copy = item.copy;
  return [undone];
}

const OUTCOMES: readonly RoundPassOutcome[] = ['held', 'reviewed', 'stale', 'redrafted', 'refused', 'failed', 'asleep'];

/** Filler older builds stored as a summary; read as no summary. */
const LEGACY_ONTOLOGY_FILLER = 'Read-only refinement review completed.';

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
  if (record.kind === 'consistency' || record.kind === 'service' || record.kind === 'ontology')
    entry.kind = record.kind;
  if (entry.kind === 'ontology' && entry.summary === LEGACY_ONTOLOGY_FILLER) entry.summary = '';
  if (record.note === 'no-agent' || record.note === 'stopped') entry.note = record.note;
  const places = stringList(record.places);
  if (places.length > 0) entry.places = places;
  const undone = Array.isArray(record.undone) ? record.undone.flatMap(parseUndone) : [];
  if (undone.length > 0) entry.undone = undone;
  const leftAsIs = stringList(record.leftAsIs);
  if (leftAsIs.length > 0) entry.leftAsIs = leftAsIs;
  return entry;
}

/** Oldest first; unreadable lines are skipped. */
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
