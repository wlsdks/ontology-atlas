/**
 * Past-trail records — everything that does not depend on the
 * storage medium. Schema, caps, duplicate detection, and serialization are pure
 * functions here; only `past-trail-store.ts` knows where records land, so the
 * same record can ride any medium unchanged.
 *
 * **What is deliberately not recorded:** per-step timestamps, dwell time, visit
 * counts. There is exactly one timestamp per trail, used only for day grouping
 * and sort order. That line is what separates a browsing trail from behavioural
 * analytics.
 */

/** Ring buffer, oldest trail dropped first. The UI caption states the cap so nobody expects accumulation. */
export const PAST_WALKS_MAX = 10;

/** Steps per trail — the same cap as the live session trail (`FOOTPRINT_TRAIL_MAX`). */
export const PAST_WALK_ENTRIES_MAX = 30;

/** Save threshold, matching the chip's own (2+ visits): only what looked like a trail is stored as one. */
export const PAST_WALK_MIN_ENTRIES = 2;

/** A step snapshot. Title and kind are frozen in so the list still draws after a node is deleted. */
export interface PastWalkEntry {
  /** Graph node id (`<kind>:<slug>`). */
  id: string;
  title: string;
  kind: string;
}

export interface PastWalk {
  id: string;
  /** When the trail ended (epoch ms) — one per trail, for day grouping and sort only. */
  endedAt: number;
  /** Visit order, oldest to newest — same direction as the live trail, so a handoff packet replays as-is. */
  entries: PastWalkEntry[];
}

interface PastTrailDocumentV1 {
  v: 1;
  /** Most recent first. */
  walks: PastWalk[];
}

function isEntry(value: unknown): value is PastWalkEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.title === "string" && typeof e.kind === "string";
}

/**
 * Parses stored text back into the schema. Corrupt, old-version, or hand-edited
 * content is dropped silently — this is convenience state with no source of
 * truth to recover from. Unapproved fields such as per-step timestamps are
 * stripped here too.
 */
export function deserializePastTrails(raw: string | null): PastWalk[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const doc = parsed as Partial<PastTrailDocumentV1>;
  if (doc.v !== 1 || !Array.isArray(doc.walks)) return [];
  const walks: PastWalk[] = [];
  for (const candidate of doc.walks) {
    if (!candidate || typeof candidate !== "object") continue;
    const walk = candidate as unknown as Record<string, unknown>;
    if (typeof walk.id !== "string" || typeof walk.endedAt !== "number") continue;
    if (!Number.isFinite(walk.endedAt) || !Array.isArray(walk.entries)) continue;
    const entries = walk.entries
      .filter(isEntry)
      .slice(0, PAST_WALK_ENTRIES_MAX)
      .map((e) => ({ id: e.id, title: e.title, kind: e.kind }));
    if (entries.length < PAST_WALK_MIN_ENTRIES) continue;
    walks.push({ id: walk.id, endedAt: walk.endedAt, entries });
  }
  return walks.slice(0, PAST_WALKS_MAX);
}

export function serializePastTrails(walks: readonly PastWalk[]): string {
  const doc: PastTrailDocumentV1 = { v: 1, walks: walks.slice(0, PAST_WALKS_MAX) };
  return JSON.stringify(doc);
}

function sameRoute(a: readonly PastWalkEntry[], b: readonly PastWalkEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => entry.id === b[i].id);
}

/** One id per session; every save in that session overwrites under it. */
export function newPastWalkId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UpsertPastWalkOptions {
  /** Timestamp to record; defaults to call time. */
  now?: number;
}

/**
 * Overwrites the walk in progress under the same id. Pure — the input list is
 * not mutated.
 *
 * **Why it overwrites as you walk instead of saving once at the end.** Storage
 * is a file in the vault, so writes are async: starting one at `pagehide` loses
 * the document before it completes — failing at exactly the moment worth
 * recording. Overwriting in place means a force-quit or a browser crash still
 * leaves the last state on disk. The visible contract is unchanged: one session
 * is one row, with one timestamp on it.
 *
 * Skipped when the walk is under the threshold, or when its route equals **any
 * other** stored trail. The comparison is against all trails, not just the first
 * row, because reopening a past trail makes its steps this session's steps: with
 * a first-row-only check the reopened trail would be saved again under today's
 * date and the same route would appear twice. Comparing all of them keeps the
 * original at its own date, and a new row appears only once the route diverges.
 */
export function upsertPastWalk(
  walks: readonly PastWalk[],
  walkId: string,
  entries: readonly PastWalkEntry[],
  options: UpsertPastWalkOptions = {},
): PastWalk[] {
  const trimmed = entries
    .slice(-PAST_WALK_ENTRIES_MAX)
    .map((e) => ({ id: e.id, title: e.title, kind: e.kind }));
  if (trimmed.length < PAST_WALK_MIN_ENTRIES) return [...walks];
  const others = walks.filter((walk) => walk.id !== walkId);
  if (others.some((walk) => sameRoute(walk.entries, trimmed))) return [...walks];
  const walk: PastWalk = {
    id: walkId,
    endedAt: options.now ?? Date.now(),
    entries: trimmed,
  };
  return [walk, ...others].slice(0, PAST_WALKS_MAX);
}

/**
 * Rebases stored steps onto the live map: drops nodes that no longer exist and
 * replaces surviving titles with current ones.
 *
 * Records freeze the title and kind of the moment so the list still draws after
 * a deletion — but the map is the source of truth the moment a trail is
 * reopened, and yesterday's names would point at nothing. The live session trail
 * is already refined by this rule, so a reopened trail must pass through it too
 * for the two to be the same thing.
 */
export function refinePastWalkEntries(
  entries: readonly PastWalkEntry[],
  lookup: (id: string) => { title: string; kind: string } | null | undefined,
): PastWalkEntry[] {
  const refined: PastWalkEntry[] = [];
  for (const entry of entries) {
    const live = lookup(entry.id);
    if (!live) continue;
    refined.push({ id: entry.id, title: live.title, kind: live.kind });
  }
  return refined;
}

/**
 * Reduces the end timestamp to a day bucket. Hours and minutes are never shown:
 * the date is needed to tell trails apart, but a clock time makes the list read
 * as a behavioural timeline.
 */
export type PastTrailDay =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "sameYear"; at: number }
  | { kind: "olderYear"; at: number };

export function describePastTrailDay(endedAt: number, now: number): PastTrailDay {
  const day = new Date(endedAt);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(day)) / 86_400_000);
  if (diffDays <= 0) return { kind: "today" };
  if (diffDays === 1) return { kind: "yesterday" };
  if (day.getFullYear() === today.getFullYear()) return { kind: "sameYear", at: endedAt };
  return { kind: "olderYear", at: endedAt };
}
