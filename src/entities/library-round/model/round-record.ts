/**
 * **A Library round** — a rule the Library keeps on its own while the app is open.
 *
 * Spec: `docs/superpowers/specs/2026-09-17-library-rounds-design.md`. Decision:
 * `docs/records/decisions/2026-09-17-library-rounds-standing-scope-*.md`.
 *
 * Two kinds exist in this slice. A **consistency** round hashes every cited source and runs the
 * structural wiki report on this machine, with no agent turn; it may start one Compile turn for
 * the sources that went stale. A **service** round is one agent turn per pass that re-reads the
 * documents one attached connector brought in, then writes or redrafts their pages.
 *
 * The record is what the person approved in the registration sheet. Nothing here executes; the
 * runner (`views/library/lib/use-rounds-runner.ts`) reads these, and the scope judge in
 * `features/library-rounds` decides per request.
 *
 * ## Cadence is local wall-clock time
 *
 * "Daily at 09:00" means the person's 09:00, on the Mac that runs the round. The next due time
 * is computed from local date components so that a daylight-saving change moves the run with the
 * clock on the wall rather than by a fixed number of milliseconds. Hourly and six-hourly rounds
 * run on the hour (00, 06, 12, 18 for six-hourly) so two rounds with the same cadence line up
 * and the ledger reads as a grid.
 */

const ROUND_STORE_VERSION = 1 as const;

const ROUND_KINDS = ['consistency', 'service', 'ontology'] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export type RoundOnStale = 'mark' | 'redraft';

export type RoundCadence =
  | { every: 'hour' }
  | { every: '6h' }
  | { daily: string; weekdaysOnly: boolean };

export type RoundCadenceKey = 'hour' | '6h' | 'daily' | 'weekdays';

export interface RoundRecord {
  id: string;
  /** Shown in the index and the ledger. Derived at registration, editable afterwards. */
  name: string;
  kind: RoundKind;
  cadence: RoundCadence;
  enabled: boolean;
  /** Consistency only: what to do when a page's source changed under it. */
  onStale?: RoundOnStale;
  /** Service only: the `ConnectorRecord.id` whose tools this round may call. */
  connectorId?: string;
  /** Service only: the label the person knows the connector by, kept for the brief and the ledger. */
  connectorName?: string;
  /** Service only: what to look for beyond re-reading known documents. */
  query?: string;
  /** Service only: cap on new documents per pass. */
  limit?: number;
  createdAt: string;
  lastPassAt?: string;
  /** ISO-8601. The next scheduled time; a pass runs at the first tick at or after it. */
  nextDueAt: string;
}

export interface RoundState {
  v: typeof ROUND_STORE_VERSION;
  rounds: RoundRecord[];
  /**
   * When the window last went hidden with the app still open, so the morning card can say
   * "since you left" with a real span. Moved into `lastAway` when the person is back.
   */
  awayFrom?: string;
  /** The last completed absence — what "since you left" spans until the next one begins. */
  lastAway?: { from: string; to: string };
}

export const DEFAULT_SERVICE_ROUND_LIMIT = 20;

/** `HH:MM`, 24-hour, both parts two digits. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidClockTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function cadenceKey(cadence: RoundCadence): RoundCadenceKey {
  if ('every' in cadence) return cadence.every === 'hour' ? 'hour' : '6h';
  return cadence.weekdaysOnly ? 'weekdays' : 'daily';
}

export function cadenceFromKey(key: RoundCadenceKey, time = '09:00'): RoundCadence {
  switch (key) {
    case 'hour':
      return { every: 'hour' };
    case '6h':
      return { every: '6h' };
    case 'daily':
      return { daily: time, weekdaysOnly: false };
    case 'weekdays':
      return { daily: time, weekdaysOnly: true };
  }
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * The first scheduled time **strictly after** `from`, in local time.
 *
 * Strictly after is what makes a catch-up run once: the runner passes the moment it actually
 * ran, and the next boundary after that moment is always in the future, so a window missed
 * during sleep produces one pass, never one per missed hour.
 */
export function nextDueAt(cadence: RoundCadence, from: Date): Date {
  if ('every' in cadence) {
    const step = cadence.every === 'hour' ? 1 : 6;
    const next = new Date(from);
    next.setMinutes(0, 0, 0);
    const hour = next.getHours();
    const aligned = Math.floor(hour / step) * step;
    next.setHours(aligned);
    while (next.getTime() <= from.getTime()) next.setHours(next.getHours() + step);
    return next;
  }
  const [hours, minutes] = cadence.daily.split(':').map(Number);
  const next = new Date(from);
  next.setHours(hours, minutes, 0, 0);
  while (next.getTime() <= from.getTime() || (cadence.weekdaysOnly && isWeekend(next))) {
    next.setDate(next.getDate() + 1);
    next.setHours(hours, minutes, 0, 0);
  }
  return next;
}

export function isRoundDue(round: RoundRecord, now: Date): boolean {
  if (!round.enabled) return false;
  const due = Date.parse(round.nextDueAt);
  return Number.isFinite(due) && due <= now.getTime();
}

export type RoundProblem =
  | 'name-empty'
  | 'kind-unknown'
  | 'cadence-invalid'
  | 'service-without-connector'
  | 'limit-invalid';

export function roundProblems(round: RoundRecord): RoundProblem[] {
  const problems: RoundProblem[] = [];
  if (!round.name.trim()) problems.push('name-empty');
  if (!ROUND_KINDS.includes(round.kind)) problems.push('kind-unknown');
  if (!isValidCadence(round.cadence)) problems.push('cadence-invalid');
  if (round.kind === 'service' && !round.connectorId) problems.push('service-without-connector');
  if (round.limit !== undefined && !(Number.isInteger(round.limit) && round.limit > 0 && round.limit <= 100)) {
    problems.push('limit-invalid');
  }
  return problems;
}

function isValidCadence(value: unknown): value is RoundCadence {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if ('every' in record) return record.every === 'hour' || record.every === '6h';
  return typeof record.daily === 'string' && isValidClockTime(record.daily) && typeof record.weekdaysOnly === 'boolean';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readRound(value: unknown): RoundRecord | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  if (!ROUND_KINDS.includes(record.kind as RoundKind)) return null;
  if (!isValidCadence(record.cadence)) return null;
  if (typeof record.createdAt !== 'string' || typeof record.nextDueAt !== 'string') return null;
  const round: RoundRecord = {
    id: record.id,
    name: record.name,
    kind: record.kind as RoundKind,
    cadence: record.cadence,
    enabled: record.enabled === true,
    createdAt: record.createdAt,
    nextDueAt: record.nextDueAt,
  };
  if (record.onStale === 'mark' || record.onStale === 'redraft') round.onStale = record.onStale;
  if (typeof record.connectorId === 'string') round.connectorId = record.connectorId;
  if (typeof record.connectorName === 'string') round.connectorName = record.connectorName;
  if (typeof record.query === 'string') round.query = record.query;
  if (typeof record.limit === 'number') round.limit = record.limit;
  if (typeof record.lastPassAt === 'string') round.lastPassAt = record.lastPassAt;
  return round;
}

export type RoundStateParse =
  | { status: 'ok'; state: RoundState }
  | { status: 'missing'; state: RoundState }
  | { status: 'malformed'; state: RoundState };

export function emptyRoundState(): RoundState {
  return { v: ROUND_STORE_VERSION, rounds: [] };
}

/**
 * A malformed file is reported, not repaired: the store refuses to write over a file it could not
 * read, the same rule `connector-store.ts` keeps, so a person's hand edit is never erased by a
 * round that happened to tick first.
 */
export function parseRoundState(text: string | null): RoundStateParse {
  if (text === null || text.trim() === '') return { status: 'missing', state: emptyRoundState() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 'malformed', state: emptyRoundState() };
  }
  const record = asRecord(parsed);
  if (!record || record.v !== ROUND_STORE_VERSION || !Array.isArray(record.rounds)) {
    return { status: 'malformed', state: emptyRoundState() };
  }
  const rounds: RoundRecord[] = [];
  for (const entry of record.rounds) {
    const round = readRound(entry);
    if (!round) return { status: 'malformed', state: emptyRoundState() };
    rounds.push(round);
  }
  const state: RoundState = { v: ROUND_STORE_VERSION, rounds };
  if (typeof record.awayFrom === 'string') state.awayFrom = record.awayFrom;
  const away = asRecord(record.lastAway);
  if (away && typeof away.from === 'string' && typeof away.to === 'string') {
    state.lastAway = { from: away.from, to: away.to };
  }
  return { status: 'ok', state };
}

export function serializeRoundState(state: RoundState): string {
  const out: RoundState = { v: ROUND_STORE_VERSION, rounds: state.rounds };
  if (state.awayFrom) out.awayFrom = state.awayFrom;
  if (state.lastAway) out.lastAway = state.lastAway;
  return JSON.stringify(out, null, 2) + '\n';
}
