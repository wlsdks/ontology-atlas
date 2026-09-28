/**
 * A Library round the person approved (spec `docs/specs/2026-09-17-library-rounds-design.md`; decision
 * `docs/records/decisions/2026-09-17-library-rounds-standing-scope-0e82da66-48d2-44f1-a923-82857d7a3710.md`).
 * Cadence is local wall-clock time, so daylight saving moves a run with the clock.
 */

const ROUND_STORE_VERSION = 1 as const;

const ROUND_KINDS = ['consistency', 'service', 'ontology'] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export type RoundOnStale = 'mark' | 'redraft';

export type RoundCadence =
  | { every: 'hour' }
  | { every: '6h' }
  /** `hour` and `6h` stay the on-disk literals for 60 and 360 so older builds still read them. */
  | { everyMinutes: number }
  | { daily: string; weekdaysOnly: boolean };

export type RoundCadenceKey = 'hour' | '6h' | 'minutes' | 'hours' | 'daily' | 'weekdays';

/** A day; anything longer is the daily form. */
const MAX_INTERVAL_MINUTES = 1440;

/** A place a round reads: vault folders, or one connector narrowed to a location (spec `2026-09-21-round-cadence-and-scope.md` §3). */
export interface RoundPlaceVault {
  kind: 'vault';
  /** Folders relative to the root; `[]` is the whole vault. */
  paths: string[];
  /** Only `sources/` files without `source_url`, i.e. ones a person added. */
  ownDocumentsOnly?: boolean;
}

export interface RoundPlaceService {
  kind: 'service';
  connectorId: string;
  /** The `mcp__<name>__` prefix of the connector's tools. */
  connectorName: string;
  /** e.g. `#release-room`, `ENG`, `Roadmap DB`. */
  location?: string;
  /** What to look for beyond re-reading the documents already here. */
  query?: string;
}

export type RoundPlace = RoundPlaceVault | RoundPlaceService;

export interface RoundRecord {
  id: string;
  /** Derived at registration, editable afterwards. */
  name: string;
  kind: RoundKind;
  cadence: RoundCadence;
  enabled: boolean;
  /** Consistency only: what to do when a page's source changed under it. */
  onStale?: RoundOnStale;
  /** Service only: the `ConnectorRecord.id` whose tools this round may call. */
  connectorId?: string;
  /** Service only: the connector label the person knows. */
  connectorName?: string;
  /** Service only: what to look for beyond re-reading known documents. */
  query?: string;
  /** Service only: cap on new documents per pass. */
  limit?: number;
  /** Absent on older records, which read as the whole vault plus the legacy connector fields. */
  places?: RoundPlace[];
  createdAt: string;
  lastPassAt?: string;
  /** ISO-8601; a pass runs at the first tick at or after it. */
  nextDueAt: string;
}

export interface RoundState {
  v: typeof ROUND_STORE_VERSION;
  rounds: RoundRecord[];
  /** When the window last went hidden, moved into `lastAway` on return. */
  awayFrom?: string;
  /** The last completed absence, spanned by "since you left". */
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

/** 60 and 360 keep their literals for older builds; other intervals are minutes. */
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

/** Approximate agent turns per day when every pass spends one (spec §2.1). */
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
      // Interval keys describe a stored interval; callers build one from minutes.
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

const MINUTE_MS = 60_000;

const minuteOfDay = (at: Date) => at.getHours() * 60 + at.getMinutes();

function jumpsOverGrid(before: Date, after: Date, minutes: number): boolean {
  const skipped = before.getTimezoneOffset() - after.getTimezoneOffset();
  for (let step = 1; step <= skipped; step += 1) {
    if (((minuteOfDay(before) + step) % MAX_INTERVAL_MINUTES) % minutes === 0) return true;
  }
  return false;
}

function nextOnClockGrid(minutes: number, from: Date): Date {
  const start = Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  if (!Number.isFinite(start)) return new Date(Number.NaN);
  let before = new Date(start - MINUTE_MS);
  for (let step = 0; step < 3 * MAX_INTERVAL_MINUTES; step += 1) {
    const clock = new Date(start + step * MINUTE_MS);
    if (minuteOfDay(clock) % minutes === 0 || jumpsOverGrid(before, clock, minutes)) return clock;
    before = clock;
  }
  return new Date(Number.NaN);
}

/** The first scheduled time strictly after `from`, so a missed window catches up once. */
export function nextDueAt(cadence: RoundCadence, from: Date): Date {
  const minutes = cadenceMinutes(cadence);
  if (minutes !== null) return nextOnClockGrid(minutes > 0 ? minutes : 60, from);
  if (!('daily' in cadence)) return nextOnClockGrid(60, from);
  const [clockHours, clockMinutes] = cadence.daily.split(':').map(Number);
  const next = new Date(from);
  next.setHours(clockHours, clockMinutes, 0, 0);
  while (next.getTime() <= from.getTime() || (cadence.weekdaysOnly && isWeekend(next))) {
    next.setDate(next.getDate() + 1);
    next.setHours(clockHours, clockMinutes, 0, 0);
  }
  return next;
}

export function dueOnThisClock(round: RoundRecord, now: Date): string {
  const stored = Date.parse(round.nextDueAt);
  if (!Number.isFinite(stored) || stored <= now.getTime()) return round.nextDueAt;
  if (nextDueAt(round.cadence, new Date(stored - 1)).getTime() === stored) return round.nextDueAt;
  return nextDueAt(round.cadence, now).toISOString();
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

/** The places a record describes, including older records: the whole vault plus the legacy connector. */
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

/** The first vault place. */
export function vaultPlace(places: readonly RoundPlace[]): RoundPlaceVault {
  return places.find((place): place is RoundPlaceVault => place.kind === 'vault') ?? { kind: 'vault', paths: [] };
}

/** Derived from the places (spec §3.2); the stored `kind` remains for older readers. */
export function deriveRoundKind(places: readonly RoundPlace[]): RoundKind {
  return servicePlaces(places).length > 0 ? 'service' : 'consistency';
}

function canonicalCadence(cadence: RoundCadence): Record<string, unknown> {
  if ('every' in cadence) return { every: cadence.every };
  if ('everyMinutes' in cadence) return { everyMinutes: cadence.everyMinutes };
  return { daily: cadence.daily, weekdaysOnly: cadence.weekdaysOnly };
}

function canonicalPlace(place: RoundPlace): Record<string, unknown> {
  return place.kind === 'vault'
    ? { kind: 'vault', paths: place.paths, ownDocumentsOnly: place.ownDocumentsOnly === true }
    : {
        kind: 'service',
        connectorId: place.connectorId,
        connectorName: place.connectorName,
        location: place.location ?? null,
        query: place.query ?? null,
      };
}

export function roundFingerprint(round: RoundRecord): string {
  return JSON.stringify({
    v: 1,
    kind: round.kind,
    cadence: canonicalCadence(round.cadence),
    onStale: round.onStale ?? null,
    places: roundPlaces(round).map(canonicalPlace),
    connectorId: round.connectorId ?? null,
    connectorName: round.connectorName ?? null,
    query: round.query ?? null,
    limit: round.limit ?? null,
  });
}

const isUnderFolder = (path: string, folder: string) => {
  const clean = folder.replace(/\/+$/, '');
  return path === clean || path.startsWith(`${clean}/`);
};

export function roundWidens(before: RoundRecord, after: RoundRecord): boolean {
  if (turnsPerDay(after.cadence) > turnsPerDay(before.cadence)) return true;
  if (before.kind !== 'service' && after.kind === 'service') return true;
  if (before.kind === 'consistency' && after.kind === 'consistency' && before.onStale === 'mark' && after.onStale !== 'mark') return true;
  if (after.kind === 'service' && (after.limit ?? DEFAULT_SERVICE_ROUND_LIMIT) > (before.limit ?? DEFAULT_SERVICE_ROUND_LIMIT)) return true;
  const beforePlaces = roundPlaces(before);
  const afterPlaces = roundPlaces(after);
  const was = vaultPlace(beforePlaces);
  const now = vaultPlace(afterPlaces);
  if (was.paths.length > 0 && (now.paths.length === 0 || now.paths.some((path) => !was.paths.some((folder) => isUnderFolder(path, folder))))) return true;
  if (was.ownDocumentsOnly && !now.ownDocumentsOnly) return true;
  const reach = (place: RoundPlaceService) => `${place.connectorId}\u0000${place.location?.trim() ?? ''}`;
  const allowed = new Set(servicePlaces(beforePlaces).map(reach));
  const anywhere = new Set(servicePlaces(beforePlaces).filter((place) => !place.location?.trim()).map((place) => place.connectorId));
  return servicePlaces(afterPlaces).some((place) => !anywhere.has(place.connectorId) && !allowed.has(reach(place)));
}

/** Labels naming a pass's places. */
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

/** A malformed file is reported, not repaired, so the store never overwrites a hand edit. */
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
