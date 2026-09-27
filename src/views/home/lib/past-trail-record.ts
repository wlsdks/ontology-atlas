/**
 * Past-trail format rules independent of the storage medium; only `past-trail-store.ts` knows where
 * records land. One timestamp per trail and no per-step times, dwell or counts: that line separates
 * a trail from analytics.
 */

/** Ring buffer; the UI caption states the cap so nobody expects accumulation. */
export const PAST_WALKS_MAX = 10;

/** Same cap as the live session trail (`FOOTPRINT_TRAIL_MAX`). */
const PAST_WALK_ENTRIES_MAX = 30;

/** Matches the chip's own 2+ visit threshold. */
export const PAST_WALK_MIN_ENTRIES = 2;

/** Title and kind are frozen in so the list still draws after a node is deleted. */
export interface PastWalkEntry {
  id: string;
  title: string;
  kind: string;
}

export interface PastWalk {
  id: string;
  /** Epoch ms, for day grouping and sort only. */
  endedAt: number;
  /** Oldest to newest, like the live trail, so a handoff packet replays as-is. */
  entries: PastWalkEntry[];
}

interface PastTrailDocumentV1 {
  v: 1;
  walks: PastWalk[];
}

function isEntry(value: unknown): value is PastWalkEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.title === "string" && typeof e.kind === "string";
}

/** Corrupt, old or hand-edited content drops silently, including unapproved per-step timestamps. */
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

export function newPastWalkId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `walk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UpsertPastWalkOptions {
  now?: number;
}

/**
 * Overwrites the walk in progress on every step, since an async write started at `pagehide` is
 * lost. Skipped under the threshold or when its route equals any stored trail (not just the first),
 * or a reopened past trail is saved again under today's date.
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
 * Drops nodes gone from the live map and takes current titles, matching the live trail's
 * refinement.
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

/** Day bucket only: a clock time would make the list read as a behavioural timeline. */
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
