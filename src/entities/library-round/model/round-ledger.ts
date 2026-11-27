import { isNotFoundError, VAULT_SIDECAR_DIR } from '@/shared/lib/vault-folder/vault-sidecar';

/**
 * `.ontology-atlas/rounds-ledger.jsonl`: one line per pass or gap, with no page text or tool
 * output. `asleep` is an entry so a sleeping Mac is told apart from a paused round.
 */

const ROUNDS_LEDGER_FILE = 'rounds-ledger.jsonl';
export const ROUNDS_LEDGER_CAP = 500;

export type RoundPassOutcome =
  | 'rechecked'
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
  kind?: 'consistency' | 'service' | 'ontology' | 'recheck';
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
  /** A recheck run, or the undo of one (`undoOf`). */
  recheck?: RecheckRecord;
}

/** How Atlas settled one concept of a recheck run. */
export type RecheckConceptOutcome = 'accurate' | 'outdated' | 'left';

/** Why a concept was left "Not decided", when the agent's own reason is not the reason. */
export type RecheckLeftReason = 'no-answer' | 'changed-meanwhile' | 'refused-path' | 'cut-unread' | 'cannot-tell' | 'too-large';

export interface RecheckConcept {
  slug: string;
  /** Vault-relative document. */
  path: string;
  outcome: RecheckConceptOutcome;
  /** Cited files whose change was sent to the agent. */
  files: string[];
  /** The agent's reason, cut. */
  reason?: string;
  /** The passage the agent named as out of date, cut. */
  passage?: string;
  leftReason?: RecheckLeftReason;
  /** The cited path that was refused or not read, for the two reasons that name one. */
  leftPath?: string;
  /** The document's dating commit and its files' commits, so an unchanged concept left undecided is not sent again. */
  basis?: string;
}

export type RecheckHoldReason = 'git' | 'branch' | 'refused';
export type RecheckError = 'reply-unreadable' | 'head-moved' | 'commit-held' | 'commit-refused' | 'commit-rewritten' | 'interrupted';

export interface RecheckRecord {
  /** HEAD when the run started. */
  head?: string;
  /** The run's own commit, when it committed. */
  commit?: string;
  concepts: RecheckConcept[];
  sentBytes: number;
  waiting: number;
  skippedUncommitted: number;
  ignored: number;
  hold?: { reason: RecheckHoldReason; detail: string };
  error?: RecheckError;
  /** Git's words for a refusal. */
  detail?: string;
  /** After a refused commit or an interrupted run: documents put back, and where the taken-out text was kept. */
  restored?: number;
  copy?: string;
  /** Set on the ledger line that undid part or all of the run with this id. */
  undoOf?: string;
  /** On an undo line: the documents it put back. */
  undone?: string[];
  /** After `commit-rewritten`: documents a hook changed while Git committed them. */
  rewritten?: string[];
}

/** Documents of the recheck run `runId` that a later undo line put back. */
export function recheckUndonePaths(entries: readonly RoundPassEntry[], runId: string): Set<string> {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (entry.recheck?.undoOf === runId) for (const path of entry.recheck.undone ?? []) paths.add(path);
  }
  return paths;
}

const RECHECK_OUTCOMES: readonly RecheckConceptOutcome[] = ['accurate', 'outdated', 'left'];
const RECHECK_LEFT_REASONS: readonly RecheckLeftReason[] = ['no-answer', 'changed-meanwhile', 'refused-path', 'cut-unread', 'cannot-tell', 'too-large'];
const RECHECK_HOLDS: readonly RecheckHoldReason[] = ['git', 'branch', 'refused'];
const RECHECK_ERRORS: readonly RecheckError[] = ['reply-unreadable', 'head-moved', 'commit-held', 'commit-refused', 'commit-rewritten', 'interrupted'];

const optionalString = (value: unknown) => (typeof value === 'string' ? value : undefined);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);

function parseRecheckConcept(value: unknown): RecheckConcept[] {
  if (!value || typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  if (typeof item.slug !== 'string' || typeof item.path !== 'string') return [];
  if (!RECHECK_OUTCOMES.includes(item.outcome as RecheckConceptOutcome)) return [];
  const concept: RecheckConcept = { slug: item.slug, path: item.path, outcome: item.outcome as RecheckConceptOutcome, files: stringList(item.files) };
  for (const key of ['reason', 'passage', 'leftPath', 'basis'] as const) {
    const text = optionalString(item[key]);
    if (text !== undefined) concept[key] = text;
  }
  if (RECHECK_LEFT_REASONS.includes(item.leftReason as RecheckLeftReason)) concept.leftReason = item.leftReason as RecheckLeftReason;
  return [concept];
}

function parseRecheckRecord(value: unknown): RecheckRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const record: RecheckRecord = {
    concepts: Array.isArray(item.concepts) ? item.concepts.flatMap(parseRecheckConcept) : [],
    sentBytes: count(item.sentBytes),
    waiting: count(item.waiting),
    skippedUncommitted: count(item.skippedUncommitted),
    ignored: count(item.ignored),
  };
  for (const key of ['head', 'commit', 'detail', 'copy', 'undoOf'] as const) {
    const text = optionalString(item[key]);
    if (text !== undefined) record[key] = text;
  }
  const hold = item.hold as Record<string, unknown> | undefined;
  if (hold && RECHECK_HOLDS.includes(hold.reason as RecheckHoldReason)) {
    record.hold = { reason: hold.reason as RecheckHoldReason, detail: optionalString(hold.detail) ?? '' };
  }
  if (RECHECK_ERRORS.includes(item.error as RecheckError)) record.error = item.error as RecheckError;
  if (typeof item.restored === 'number') record.restored = count(item.restored);
  const undone = stringList(item.undone);
  if (undone.length > 0) record.undone = undone;
  const rewritten = stringList(item.rewritten);
  if (rewritten.length > 0) record.rewritten = rewritten;
  return record;
}

export type RoundUndoReason = 'not-draft' | 'duplicate-key' | 'forbidden-key' | 'no-frontmatter' | 'unreadable';

export interface RoundUndone {
  path: string;
  reason: RoundUndoReason;
  key?: string;
  action: 'restored' | 'removed' | 'failed' | 'left';
  copy?: string;
}

const UNDO_REASONS: readonly RoundUndoReason[] = ['not-draft', 'duplicate-key', 'forbidden-key', 'no-frontmatter', 'unreadable'];
const UNDO_ACTIONS: readonly RoundUndone['action'][] = ['restored', 'removed', 'failed', 'left'];

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

const OUTCOMES: readonly RoundPassOutcome[] = ['rechecked', 'held', 'reviewed', 'stale', 'redrafted', 'refused', 'failed', 'asleep'];

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
  if (record.kind === 'consistency' || record.kind === 'service' || record.kind === 'ontology' || record.kind === 'recheck')
    entry.kind = record.kind;
  if (entry.kind === 'ontology' && entry.summary === LEGACY_ONTOLOGY_FILLER) entry.summary = '';
  if (record.note === 'no-agent' || record.note === 'stopped') entry.note = record.note;
  const places = stringList(record.places);
  if (places.length > 0) entry.places = places;
  const undone = Array.isArray(record.undone) ? record.undone.flatMap(parseUndone) : [];
  if (undone.length > 0) entry.undone = undone;
  const leftAsIs = stringList(record.leftAsIs);
  if (leftAsIs.length > 0) entry.leftAsIs = leftAsIs;
  const recheck = parseRecheckRecord(record.recheck);
  if (recheck) entry.recheck = recheck;
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
