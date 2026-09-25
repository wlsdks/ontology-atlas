import {
  type RoundPassEntry,
  type RoundRecord,
  type RoundState,
} from "@/entities/library-round";

/**
 * Pure shaping for the Rounds tab: what the morning card sums, how the ledger groups by day,
 * and the words a cadence turns into. Kept out of the components so the numbers a person
 * reads in the morning are testable without a screen.
 */

/** A "since you left" span counts only when the person was away long enough to miss a tick. */
const AWAY_COUNTS_AFTER_MS = 10 * 60_000;

export interface SinceSpan {
  kind: "away" | "today";
  from: Date;
  to: Date;
}

/**
 * The span the morning card sums. The last completed absence when it was long enough and ended
 * today; otherwise today since local midnight — the card is never empty, it just changes its title.
 */
export function sinceSpan(state: RoundState | null, now: Date): SinceSpan {
  const away = state?.lastAway;
  if (away) {
    const from = new Date(away.from);
    const to = new Date(away.to);
    const sameDay = to.toDateString() === now.toDateString();
    if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && to.getTime() - from.getTime() >= AWAY_COUNTS_AFTER_MS && sameDay) {
      return { kind: "away", from, to };
    }
  }
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return { kind: "today", from: midnight, to: now };
}

export interface SinceSummary {
  passes: number;
  held: number;
  failed: number;
  refused: number;
  /** Page slugs that went stale, in first-seen order. */
  stale: string[];
  /** Pages written by a pass (vault-relative `wiki/…` paths), in first-seen order. */
  redrafted: string[];
}

export function summarizeSince(entries: readonly RoundPassEntry[], span: SinceSpan): SinceSummary {
  const summary: SinceSummary = { passes: 0, held: 0, failed: 0, refused: 0, stale: [], redrafted: [] };
  const seenStale = new Set<string>();
  const seenWritten = new Set<string>();
  for (const entry of entries) {
    const started = new Date(entry.startedAt).getTime();
    /*
     * A gap is not a pass, and the card does not name it: the ledger right below draws the same
     * gap as a hatched band at its time (2026-09-25, round three — the card ended on
     * "asleep 01:12 → 07:28" directly above the ledger row saying the same).
     */
    if (entry.outcome === "asleep") continue;
    if (started < span.from.getTime() || started > span.to.getTime()) continue;
    summary.passes += 1;
    if (entry.outcome === "held") summary.held += 1;
    if (entry.outcome === "failed") summary.failed += 1;
    summary.refused += entry.refused.length;
    for (const slug of entry.stale) {
      if (!seenStale.has(slug)) {
        seenStale.add(slug);
        summary.stale.push(slug);
      }
    }
    for (const path of entry.written) {
      if (!path.startsWith("wiki/")) continue;
      if (!seenWritten.has(path)) {
        seenWritten.add(path);
        summary.redrafted.push(path);
      }
    }
  }
  return summary;
}

export interface LedgerDay {
  /** Local midnight of the day, as a stable key. */
  key: string;
  date: Date;
  /** Newest first. */
  entries: RoundPassEntry[];
}

/** Newest day first, newest entry first within a day. A gap is placed on the day it ended. */
export function groupLedgerByDay(entries: readonly RoundPassEntry[]): LedgerDay[] {
  const byKey = new Map<string, LedgerDay>();
  const sorted = [...entries].sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
  for (const entry of sorted) {
    const day = new Date(entry.endedAt);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString();
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { key, date: day, entries: [] };
      byKey.set(key, bucket);
    }
    bucket.entries.push(entry);
  }
  return [...byKey.values()];
}

/** The word the index shows for a round's last pass, or null when it has not run. */
export function lastOutcome(round: RoundRecord, entries: readonly RoundPassEntry[]): RoundPassEntry | null {
  let latest: RoundPassEntry | null = null;
  for (const entry of entries) {
    if (entry.roundId !== round.id) continue;
    if (!latest || new Date(entry.endedAt) > new Date(latest.endedAt)) latest = entry;
  }
  return latest;
}

/** The enabled round due soonest, for the header. */
export function nextRound(rounds: readonly RoundRecord[]): RoundRecord | null {
  let next: RoundRecord | null = null;
  for (const round of rounds) {
    if (!round.enabled) continue;
    if (!next || new Date(round.nextDueAt) < new Date(next.nextDueAt)) next = round;
  }
  return next;
}

export function passDurationSeconds(entry: RoundPassEntry): number {
  const ms = new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0;
}

export function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * The derived name a new round can carry without colliding with one already in the index:
 * the name itself, then "<name> 2", "<name> 3", and so on. The person may still type any name
 * they like — this only decides what the field offers.
 */
export function unusedRoundName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim()));
  const trimmed = base.trim();
  if (!taken.has(trimmed)) return base;
  let ordinal = 2;
  while (taken.has(`${trimmed} ${ordinal}`)) ordinal += 1;
  return `${trimmed} ${ordinal}`;
}

/**
 * Which example the "what to look for" field offers, by the connector's own name.
 *
 * A Slack row asking for "pages changed in the last day in space ENG" teaches the person the
 * wrong shape of question for the service in front of them: Slack has channels and posts, not
 * spaces and pages. The match is on the name the person attached the connector under, which is
 * the only thing Atlas knows about it; anything it does not recognise gets a neutral example
 * rather than a guess dressed as one.
 */
export type ServiceExample = "Slack" | "Notion" | "Confluence" | "Jira" | "Generic";

export function serviceExample(connectorName: string): ServiceExample {
  const name = connectorName.toLowerCase();
  if (name.includes("slack")) return "Slack";
  if (name.includes("notion")) return "Notion";
  if (name.includes("confluence") || name.includes("atlassian-wiki")) return "Confluence";
  if (name.includes("jira")) return "Jira";
  return "Generic";
}
