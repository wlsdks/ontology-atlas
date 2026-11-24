import type { LandedChange } from '@/shared/lib/work-status/tauri-work-status';

/** The kinds a conventional commit prefix names; anything else reads as plain work. */
export const CHANGE_KINDS = ['feat', 'fix', 'perf', 'design', 'refactor', 'docs', 'test', 'chore'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

const KIND_ALIASES: Record<string, ChangeKind> = { style: 'design', build: 'chore', ci: 'chore', revert: 'fix' };

export interface ReadSubject {
  kind: ChangeKind | null;
  /** The subject without its prefix, scope and trailing pull request number. */
  title: string;
  scope: string | null;
  pullRequest: number | null;
}

const PREFIX = /^(\w+)(?:\(([^)]{1,40})\))?!?:\s+/;
const TRAILING_PR = /\s*\(#(\d{1,7})\)\s*$/;
const LEADING_MERGE_PR = /^Merge (?:pull request )?#(\d{1,7})(?: from \S+)?:?\s*/;

/** `feat(map): draw it (#12)` as kind `feat`, scope `map`, title `draw it` and pull request 12. */
export function readSubject(subject: string): ReadSubject {
  let rest = subject.trim();
  let pullRequest: number | null = null;
  const merged = LEADING_MERGE_PR.exec(rest);
  if (merged) {
    pullRequest = Number(merged[1]);
    rest = rest.slice(merged[0].length);
  }
  const trailing = TRAILING_PR.exec(rest);
  if (trailing) {
    pullRequest ??= Number(trailing[1]);
    rest = rest.slice(0, trailing.index);
  }
  const prefix = PREFIX.exec(rest);
  const word = prefix?.[1]?.toLowerCase() ?? null;
  const kind = word === null ? null : (CHANGE_KINDS as readonly string[]).includes(word) ? (word as ChangeKind) : KIND_ALIASES[word] ?? null;
  if (prefix && kind !== null) rest = rest.slice(prefix[0].length);
  return { kind, title: rest.trim() || subject.trim(), scope: kind !== null ? prefix?.[2] ?? null : null, pullRequest };
}

export interface LandedDay {
  /** `YYYY-MM-DD` in the reader's own zone. */
  key: string;
  /** Days before today: 0 today, 1 yesterday. */
  daysAgo: number;
  /** Noon of that day, for formatting its date. */
  atMs: number;
  changes: LandedChange[];
}

const DAY_MS = 86_400_000;

function dayStart(ms: number): Date {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Newest first, grouped by the reader's calendar day; a change without a time joins the day above it. O(n). */
export function landedDays(changes: readonly LandedChange[], nowMs: number): LandedDay[] {
  const today = dayStart(nowMs).getTime();
  const days: LandedDay[] = [];
  for (const change of changes) {
    const start = change.at === null ? null : dayStart(change.at * 1000);
    const key = start ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}` : days.at(-1)?.key ?? 'unknown';
    const last = days.at(-1);
    if (last && last.key === key) {
      last.changes.push(change);
      continue;
    }
    const startMs = start?.getTime() ?? today;
    days.push({ key, daysAgo: Math.max(0, Math.round((today - startMs) / DAY_MS)), atMs: startMs + DAY_MS / 2, changes: [change] });
  }
  return days;
}

/** How many changes landed in the last `days` calendar days, today included. */
export function landedWithin(changes: readonly LandedChange[], nowMs: number, days: number): number {
  const from = dayStart(nowMs).getTime() - (days - 1) * DAY_MS;
  return changes.filter(change => change.at !== null && change.at * 1000 >= from).length;
}
