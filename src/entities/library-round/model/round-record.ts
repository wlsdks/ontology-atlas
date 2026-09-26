/**
 * **A Library round** — a rule the Library keeps on its own while the app is open.
 *
 * Spec: `docs/specs/2026-09-17-library-rounds-design.md`. Decision:
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
  /**
   * The one interval form (2026-09-21). `hour` and `6h` stay as the two literals already on
   * disk, and the writer keeps emitting them for 60 and 360, so a file written today still
   * reads on the build before this one. Every other interval travels as minutes.
   */
  | { everyMinutes: number }
  | { daily: string; weekdaysOnly: boolean };

export type RoundCadenceKey = 'hour' | '6h' | 'minutes' | 'hours' | 'daily' | 'weekdays';

/** The longest interval the rail can say: a day. Anything longer is the daily form. */
const MAX_INTERVAL_MINUTES = 1440;

/**
 * **A place a round reads** (spec `2026-09-21-round-cadence-and-scope.md` §3).
 *
 * A round used to name one connector and nothing else, so the sheet could not say *which*
 * Slack channel or *which* Confluence space, and neither could the ledger next morning. A place
 * is either folders inside this vault or one connector narrowed to a location.
 */
export interface RoundPlaceVault {
  kind: 'vault';
  /** Folders relative to the root, picked from the real folder list. `[]` is the whole vault. */
  paths: string[];
  /** Only files under `sources/` with no `source_url` — what a person dropped in themselves. */
  ownDocumentsOnly?: boolean;
}

export interface RoundPlaceService {
  kind: 'service';
  connectorId: string;
  /** The name the connector is attached under — the `mcp__<name>__` prefix of its tools. */
  connectorName: string;
  /** The part of the service this round is limited to: `#release-room`, `ENG`, `Roadmap DB`. */
  location?: string;
  /** What to look for beyond re-reading the documents already here. */
  query?: string;
}

export type RoundPlace = RoundPlaceVault | RoundPlaceService;

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
  /**
   * The places this round reads. Absent on records written before 2026-09-21, which read as
   * one whole-vault place plus, for a service round, the connector in the legacy fields.
   */
  places?: RoundPlace[];
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

/** Minutes between two passes, or `null` for the daily and weekday forms. */
export function cadenceMinutes(cadence: RoundCadence): number | null {
  if ('every' in cadence) return cadence.every === 'hour' ? 60 : 360;
  if ('everyMinutes' in cadence) return cadence.everyMinutes;
  return null;
}

/**
 * The cadence an interval is stored as. 60 and 360 keep their literals because a build older
 * than 2026-09-21 reads only those two; every other interval is minutes.
 */
export function cadenceFromMinutes(minutes: number): RoundCadence {
  if (minutes === 60) return { every: 'hour' };
  if (minutes === 360) return { every: '6h' };
  return { everyMinutes: minutes };
}

export function cadenceKey(cadence: RoundCadence): RoundCadenceKey {
  const minutes = cadenceMinutes(cadence);
  if (minutes !== null) {
    if (minutes === 60) return 'hour';
    if (minutes === 360) return '6h';
    return minutes % 60 === 0 ? 'hours' : 'minutes';
  }
  return 'daily' in cadence && cadence.weekdaysOnly ? 'weekdays' : 'daily';
}

/** About how many agent turns a day a cadence costs when every pass spends one (spec §2.1). */
export function turnsPerDay(cadence: RoundCadence): number {
  const minutes = cadenceMinutes(cadence);
  return minutes !== null && minutes > 0 ? Math.round(MAX_INTERVAL_MINUTES / minutes) : 1;
}

export function cadenceFromKey(key: RoundCadenceKey, time = '09:00'): RoundCadence {
  switch (key) {
    case 'hour':
      return { every: 'hour' };
    case '6h':
      return { every: '6h' };
    case 'minutes':
    case 'hours':
      // The two interval keys are descriptions of a stored interval, not choices a caller
      // makes blind: a caller that wants one builds it from minutes.
      return { every: 'hour' };
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
  const minutes = cadenceMinutes(cadence);
  if (minutes !== null && minutes > 0) {
    const next = new Date(from);
    if (minutes < 60 && 60 % minutes === 0) {
      // Shorter than an hour: the hour is the grid, so :00 :05 :10 … and two five-minute
      // rounds share one column in the ledger.
      next.setSeconds(0, 0);
      next.setMinutes(Math.floor(next.getMinutes() / minutes) * minutes);
      while (next.getTime() <= from.getTime()) next.setMinutes(next.getMinutes() + minutes);
      return next;
    }
    /*
     * An hour or longer: the **day** is the grid, counted from local midnight, so a two-hour
     * round runs at 00 02 04 … and a daylight-saving day moves the run with the clock on the
     * wall rather than by a fixed number of milliseconds — `setMinutes` walks wall time.
     */
    next.setHours(0, 0, 0, 0);
    const elapsed = Math.floor((from.getTime() - next.getTime()) / 60_000);
    next.setMinutes(Math.max(0, Math.floor(elapsed / minutes)) * minutes);
    while (next.getTime() <= from.getTime()) next.setMinutes(next.getMinutes() + minutes);
    return next;
  }
  if (!('daily' in cadence)) {
    // An interval of zero or less is not a cadence; treat it as an hour rather than looping.
    return nextDueAt({ every: 'hour' }, from);
  }
  const [clockHours, clockMinutes] = cadence.daily.split(':').map(Number);
  const next = new Date(from);
  next.setHours(clockHours, clockMinutes, 0, 0);
  while (next.getTime() <= from.getTime() || (cadence.weekdaysOnly && isWeekend(next))) {
    next.setDate(next.getDate() + 1);
    next.setHours(clockHours, clockMinutes, 0, 0);
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
  if ('everyMinutes' in record) {
    const minutes = record.everyMinutes;
    return typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_INTERVAL_MINUTES;
  }
  return typeof record.daily === 'string' && isValidClockTime(record.daily) && typeof record.weekdaysOnly === 'boolean';
}

function readPlaces(value: unknown): RoundPlace[] | null {
  if (!Array.isArray(value)) return null;
  const places: RoundPlace[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    if (record.kind === 'vault') {
      const paths = Array.isArray(record.paths) ? record.paths.filter((path): path is string => typeof path === 'string') : [];
      const place: RoundPlaceVault = { kind: 'vault', paths };
      if (record.ownDocumentsOnly === true) place.ownDocumentsOnly = true;
      places.push(place);
      continue;
    }
    if (record.kind === 'service' && typeof record.connectorId === 'string' && typeof record.connectorName === 'string') {
      const place: RoundPlaceService = { kind: 'service', connectorId: record.connectorId, connectorName: record.connectorName };
      if (typeof record.location === 'string' && record.location.trim()) place.location = record.location;
      if (typeof record.query === 'string' && record.query.trim()) place.query = record.query;
      places.push(place);
    }
  }
  return places;
}

/**
 * The places a record describes, for a record written before 2026-09-21 too: the whole vault,
 * plus the connector the legacy fields name. Nothing here invents a location the person never
 * chose — an old service round watched wherever its connector reached, and still says so.
 */
export function roundPlaces(round: RoundRecord): RoundPlace[] {
  if (round.places && round.places.length > 0) return round.places;
  const places: RoundPlace[] = [{ kind: 'vault', paths: [] }];
  if (round.kind === 'service' && round.connectorId && round.connectorName) {
    const place: RoundPlaceService = { kind: 'service', connectorId: round.connectorId, connectorName: round.connectorName };
    if (round.query?.trim()) place.query = round.query;
    places.push(place);
  }
  return places;
}

/** Service places only, in the order the person added them. */
export function servicePlaces(places: readonly RoundPlace[]): RoundPlaceService[] {
  return places.filter((place): place is RoundPlaceService => place.kind === 'service');
}

/** The one vault place a round always has; the first when a file somehow holds two. */
export function vaultPlace(places: readonly RoundPlace[]): RoundPlaceVault {
  return places.find((place): place is RoundPlaceVault => place.kind === 'vault') ?? { kind: 'vault', paths: [] };
}

/**
 * The kind is **derived** from the places, never chosen (spec §3.2): a round that names any
 * service spends an agent turn per pass and is a service round; one that names none is the
 * local check. The stored `kind` stays in the record because the scope judge, the ledger and
 * every build before this one read it.
 */
export function deriveRoundKind(places: readonly RoundPlace[]): RoundKind {
  return servicePlaces(places).length > 0 ? 'service' : 'consistency';
}

/** The short labels the index row, the ledger and the morning card name a pass's places by. */
export function roundPlaceLabels(places: readonly RoundPlace[]): string[] {
  const labels: string[] = [];
  for (const place of places) {
    if (place.kind === 'service') {
      labels.push(place.location?.trim() ? `${place.connectorName} · ${place.location.trim()}` : place.connectorName);
      continue;
    }
    for (const path of place.paths) labels.push(path);
  }
  return labels;
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
  const places = readPlaces(record.places);
  if (places && places.length > 0) round.places = places;
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
