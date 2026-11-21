import { recordedInstantMs, type LibraryWikiPage, type LibraryWriteUpLink } from "@/entities/docs-vault";
import type { LintFinding } from "@/features/library";
import { wikiFindingCode } from "@/shared/lib/library/wiki-report.mjs";

/**
 * The Wiki column's index: groups by what a page is, "Needs a look" first
 * (`docs/specs/2026-11-21-library-index-column.md`, flow 2-6). Placing a page is O(1) map lookups plus
 * its problem codes; each group keeps its five newest by insertion and sorts in full only when read whole.
 */

/** At or under this many pages every group is listed whole; above it each shows its newest five. */
export const WIKI_INDEX_FULL_LIMIT = 200;
export const WIKI_INDEX_PREVIEW_ROWS = 5;
/** A `compiled_at` this far past the clock still counts as written now, not as a future date. */
const CLOCK_SKEW_MS = 60_000;
const ANSWERS_FOLDER = "answers";
const WIKI_PREFIX = "wiki/";
/** Saved answers record `unmeasured` hashes and are reviewed through their own flow, never as stale. */
const ANSWERS_PREFIX = `${WIKI_PREFIX}${ANSWERS_FOLDER}/`;

export type WikiIndexGroupKey = "attention" | "answers" | "several" | "one" | "none" | `folder:${string}`;

/** `rule` codes are `report.rule.*` keys; the others are `wikiIndex.reason.*` keys. */
export type WikiIndexReason =
  | { kind: "disagreement" | "superseded" | "stale" | "unhashed" | "missingLink" }
  | { kind: "rule"; code: string };

export interface WikiIndexEntry {
  readonly page: LibraryWikiPage;
  /** The title in NFC, which is what the row shows and the order compares. */
  readonly title: string;
  /** `compiled_at` in epoch ms; NaN when absent, unparsable or in the future. */
  readonly writtenAtMs: number;
  /** The page's own group; a page that needs a look is listed there too. */
  readonly home: WikiIndexGroupKey;
  /** Most serious first; empty when the page needs nobody. */
  readonly reasons: readonly WikiIndexReason[];
}

export interface WikiIndexFacts {
  verdicts: ReadonlyMap<string, { problems: ReadonlyArray<{ code: string }> }>;
  writeUpsBySource: ReadonlyMap<string, readonly LibraryWriteUpLink[]>;
  /** The latest Check wiki's findings. */
  findings: readonly LintFinding[];
  nowMs: number;
}

export interface WikiIndexGroupView {
  key: WikiIndexGroupKey;
  count: number;
  /** Newest first; the whole group, or its newest five when the index is capped. */
  entries: readonly WikiIndexEntry[];
}

/** App-check codes in the order a row names them: the unbacked claim, then format, citations, links. */
const RULE_ORDER: readonly string[] = [
  "uncited-fact",
  "kind-present",
  "missing-field",
  "describes-target-missing",
  "bad-describes",
  "section-order",
  "bad-truncation-record",
  "bad-citation",
  "citation-target-missing",
  "dangling-wikilink",
];
const RULE_RANK = new Map(RULE_ORDER.map((code, rank) => [code, rank]));

type AgentReason = "disagreement" | "superseded" | "missingLink";
const AGENT_REASON: Readonly<Record<LintFinding["code"], AgentReason>> = {
  disagreement: "disagreement",
  superseded: "superseded",
  "missing-link": "missingLink",
};

const NON_ASCII = /[^\u0000-\u007f]/;
const nfc = (text: string) => (NON_ASCII.test(text) ? text.normalize("NFC") : text);

/** Read by the Sources table's rules, so the column and the table agree on every `compiled_at`. */
function parseCompiledAt(compiledAt: string): number {
  return recordedInstantMs(compiledAt) ?? Number.NaN;
}

function notInFuture(ms: number, nowMs: number): number {
  return Number.isFinite(ms) && ms <= nowMs + CLOCK_SKEW_MS ? ms : Number.NaN;
}

export function parseWrittenAt(compiledAt: string | null, nowMs: number): number {
  return compiledAt ? notInFuture(parseCompiledAt(compiledAt), nowMs) : Number.NaN;
}

/** The first folder under `wiki/`, or null for a page at its top. */
function firstFolder(slug: string): string | null {
  if (!slug.startsWith(WIKI_PREFIX)) return null;
  const slash = slug.indexOf("/", WIKI_PREFIX.length);
  return slash < 0 ? null : slug.slice(WIKI_PREFIX.length, slash);
}

export function wikiIndexHome(page: Pick<LibraryWikiPage, "slug" | "sourcePaths">): WikiIndexGroupKey {
  const folder = firstFolder(page.slug);
  if (folder === ANSWERS_FOLDER) return "answers";
  if (folder !== null) return `folder:${folder}`;
  const sources = page.sourcePaths.length;
  return sources >= 2 ? "several" : sources === 1 ? "one" : "none";
}

function findingSlug(page: string): string {
  const slug = nfc(page);
  return slug.startsWith(WIKI_PREFIX) ? slug : `${WIKI_PREFIX}${slug}`;
}

const AGENT_BIT: Readonly<Record<AgentReason, number>> = { disagreement: 1, superseded: 2, missingLink: 4 };

/** Agent findings by page slug as a bit set, built once per Check: O(total pages named). */
function agentReasonsBySlug(findings: readonly LintFinding[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const finding of findings) {
    const bit = AGENT_BIT[AGENT_REASON[finding.code]];
    for (const page of finding.pages) {
      const slug = findingSlug(page);
      out.set(slug, (out.get(slug) ?? 0) | bit);
    }
  }
  return out;
}

/** `stale`: a recorded hash differs from the file. `unhashed`: no hash was recorded, so no cause is known. */
type SourceDoubt = "stale" | "unhashed";

/** Each page's doubt about its sources, one pass over every citation: O(total links). */
function sourceDoubtBySlug(writeUpsBySource: ReadonlyMap<string, readonly LibraryWriteUpLink[]>): Map<string, SourceDoubt> {
  const out = new Map<string, SourceDoubt>();
  for (const links of writeUpsBySource.values()) {
    for (const link of links) {
      if (link.freshness !== "behind" || link.slug.startsWith(ANSWERS_PREFIX)) continue;
      if (!link.unhashed) out.set(link.slug, "stale");
      else if (!out.has(link.slug)) out.set(link.slug, "unhashed");
    }
  }
  return out;
}

const NO_REASONS: readonly WikiIndexReason[] = Object.freeze([]);
const NO_CODES: readonly string[] = Object.freeze([]);
const NO_PROBLEMS: ReadonlyArray<{ code: string }> = Object.freeze([]);
const DOUBT_REASON: Readonly<Record<SourceDoubt, WikiIndexReason>> = {
  stale: Object.freeze({ kind: "stale" }),
  unhashed: Object.freeze({ kind: "unhashed" }),
};

function ruleReasons(problems: ReadonlyArray<{ code: string }>): WikiIndexReason[] {
  const codes = new Set<string>();
  for (const problem of problems) {
    const code = wikiFindingCode(problem.code);
    // Advisory codes (`orphan-page`, `shared-source-unlinked`) are unranked: they stay in Check results.
    if (RULE_RANK.has(code)) codes.add(code);
  }
  return [...codes].sort((a, b) => RULE_RANK.get(a)! - RULE_RANK.get(b)!).map((code) => ({ kind: "rule", code }));
}

function pageReasons(agent: number, doubt: SourceDoubt | undefined, problems: ReadonlyArray<{ code: string }>): readonly WikiIndexReason[] {
  if (!agent && !doubt && problems.length === 0) return NO_REASONS;
  const reasons: WikiIndexReason[] = [];
  if (agent & AGENT_BIT.disagreement) reasons.push({ kind: "disagreement" });
  if (agent & AGENT_BIT.superseded) reasons.push({ kind: "superseded" });
  if (doubt) reasons.push(DOUBT_REASON[doubt]);
  if (problems.length > 0) reasons.push(...ruleReasons(problems));
  if (agent & AGENT_BIT.missingLink) reasons.push({ kind: "missingLink" });
  return reasons;
}

/** The model rebuilds verdict objects on every batch, so a verdict is compared by its codes. */
function sameCodes(held: readonly string[], problems: ReadonlyArray<{ code: string }>): boolean {
  if (held.length !== problems.length) return false;
  for (let i = 0; i < held.length; i += 1) if (held[i] !== problems[i]!.code) return false;
  return true;
}

function codesOf(problems: ReadonlyArray<{ code: string }>): readonly string[] {
  return problems.length === 0 ? NO_CODES : problems.map((problem) => problem.code);
}

function sameReasons(a: readonly WikiIndexReason[], b: readonly WikiIndexReason[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.kind !== right.kind) return false;
    if (left.kind === "rule" && right.kind === "rule" && left.code !== right.code) return false;
  }
  return true;
}

function samePage(a: LibraryWikiPage, b: LibraryWikiPage): boolean {
  if (a === b) return true;
  if (a.title !== b.title || a.compiledAt !== b.compiledAt || a.summary !== b.summary) return false;
  if (a.sourcePaths.length !== b.sourcePaths.length) return false;
  for (let i = 0; i < a.sourcePaths.length; i += 1) if (a.sourcePaths[i] !== b.sourcePaths[i]) return false;
  return true;
}

interface Placed extends WikiIndexEntry {
  /** The sweep that last confirmed this page is still in the folder. */
  seen: number;
  /** The facts the reasons were read from, held by value so rebuilt objects still compare equal. */
  codes: readonly string[];
  agent: number;
  doubt: SourceDoubt | undefined;
}

/** One group's members, its five newest kept on insert, and a full order built only on demand. */
class GroupBucket {
  readonly members = new Set<Placed>();
  private preview: Placed[] = [];
  private previewStale = false;
  private sorted: Placed[] | null = null;

  private readonly compare: (a: WikiIndexEntry, b: WikiIndexEntry) => number;

  constructor(compare: (a: WikiIndexEntry, b: WikiIndexEntry) => number) {
    this.compare = compare;
  }

  add(entry: Placed): void {
    this.members.add(entry);
    this.sorted = null;
    if (!this.previewStale) this.offerPreview(entry);
  }

  private offerPreview(entry: Placed): void {
    const preview = this.preview;
    if (preview.length === WIKI_INDEX_PREVIEW_ROWS && this.compare(entry, preview[preview.length - 1]!) >= 0) return;
    let at = preview.length;
    while (at > 0 && this.compare(entry, preview[at - 1]!) < 0) at -= 1;
    preview.splice(at, 0, entry);
    if (preview.length > WIKI_INDEX_PREVIEW_ROWS) preview.pop();
  }

  remove(entry: Placed): void {
    if (!this.members.delete(entry)) return;
    this.sorted = null;
    if (this.preview.includes(entry)) this.previewStale = true;
  }

  /** O(members) once after a removal from the five, O(1) otherwise. */
  newest(): readonly Placed[] {
    if (this.previewStale) {
      this.previewStale = false;
      this.preview = [];
      for (const entry of this.members) this.offerPreview(entry);
    }
    return this.preview;
  }

  /** O(m log m), cached until the group changes. */
  all(): readonly Placed[] {
    this.sorted ??= [...this.members].sort(this.compare);
    return this.sorted;
  }
}

export interface WikiIndexSweep {
  /** Pages visited this sweep, out of `pages.length`. */
  cursor: number;
  done: boolean;
}

/**
 * The index for one folder. `retarget` points it at the latest pages and facts; `advance` then
 * visits pages in order until its deadline, re-reading only a page whose inputs changed, and drops
 * pages the folder no longer has once a sweep completes. Revisiting an unchanged page is three map
 * lookups and a compare of its fields and problem codes, allocating nothing, so a batch costs
 * O(batch) real work, an O(n) compare pass, and O(total links) to re-read source doubt.
 */
export class WikiIndexBuilder {
  private readonly entries = new Map<string, Placed>();
  private readonly buckets = new Map<WikiIndexGroupKey, GroupBucket>();
  private readonly collator: Intl.Collator;
  private pages: readonly LibraryWikiPage[] = [];
  private facts: WikiIndexFacts | null = null;
  private agent = new Map<string, number>();
  private agentSource: readonly LintFinding[] | null = null;
  private doubt = new Map<string, SourceDoubt>();
  private doubtSource: WikiIndexFacts["writeUpsBySource"] | null = null;
  private readonly parsed = new Map<string, number>();
  private sweep = 0;
  private cursor = 0;
  /** Bumped whenever what `groups()` returns would differ. */
  version = 0;

  constructor(locale: string) {
    this.collator = new Intl.Collator(locale);
  }

  readonly compare = (a: WikiIndexEntry, b: WikiIndexEntry): number => {
    const aDated = !Number.isNaN(a.writtenAtMs);
    const bDated = !Number.isNaN(b.writtenAtMs);
    if (aDated !== bDated) return aDated ? -1 : 1;
    if (aDated && a.writtenAtMs !== b.writtenAtMs) return b.writtenAtMs - a.writtenAtMs;
    return this.collator.compare(a.title, b.title) || (a.page.slug < b.page.slug ? -1 : a.page.slug > b.page.slug ? 1 : 0);
  };

  get size(): number {
    return this.entries.size;
  }

  retarget(pages: readonly LibraryWikiPage[], facts: WikiIndexFacts): void {
    this.pages = pages;
    this.facts = facts;
    if (facts.findings !== this.agentSource) {
      this.agentSource = facts.findings;
      this.agent = agentReasonsBySlug(facts.findings);
    }
    if (facts.writeUpsBySource !== this.doubtSource) {
      this.doubtSource = facts.writeUpsBySource;
      this.doubt = sourceDoubtBySlug(facts.writeUpsBySource);
    }
    this.sweep += 1;
    this.cursor = 0;
  }

  /** Visits pages until `outOfTime()` says stop, checked every few pages. */
  advance(outOfTime: () => boolean = () => false): WikiIndexSweep {
    const facts = this.facts;
    if (!facts) return { cursor: 0, done: true };
    const pages = this.pages;
    while (this.cursor < pages.length) {
      this.visit(pages[this.cursor]!, facts);
      this.cursor += 1;
      if ((this.cursor & 127) === 0 && outOfTime()) return { cursor: this.cursor, done: false };
    }
    this.dropUnseen();
    return { cursor: this.cursor, done: true };
  }

  /** Pages written in one run share one `compiled_at`, so each distinct string is parsed once. */
  private writtenAt(compiledAt: string | null, nowMs: number): number {
    if (!compiledAt) return Number.NaN;
    let ms = this.parsed.get(compiledAt);
    if (ms === undefined) {
      ms = parseCompiledAt(compiledAt);
      this.parsed.set(compiledAt, ms);
    }
    return notInFuture(ms, nowMs);
  }

  private bucket(key: WikiIndexGroupKey): GroupBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new GroupBucket(this.compare);
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private visit(page: LibraryWikiPage, facts: WikiIndexFacts): void {
    const held = this.entries.get(page.slug);
    // A slug listed twice is placed once, as its first listing.
    if (held?.seen === this.sweep) return;
    const problems = facts.verdicts.get(page.slug)?.problems ?? NO_PROBLEMS;
    const agent = this.agent.get(page.slug) ?? 0;
    const doubt = this.doubt.get(page.slug);
    if (held && held.agent === agent && held.doubt === doubt && sameCodes(held.codes, problems) && samePage(held.page, page)) {
      held.seen = this.sweep;
      return;
    }
    const entry: Placed = {
      page,
      title: nfc(page.title),
      writtenAtMs: this.writtenAt(page.compiledAt, facts.nowMs),
      home: wikiIndexHome(page),
      reasons: pageReasons(agent, doubt, problems),
      seen: this.sweep,
      codes: codesOf(problems),
      agent,
      doubt,
    };
    if (held && samePage(held.page, page) && Object.is(held.writtenAtMs, entry.writtenAtMs)
      && held.home === entry.home && sameReasons(held.reasons, entry.reasons)) {
      // Only the fact objects moved; the row and its place are unchanged.
      Object.assign(held, { seen: entry.seen, codes: entry.codes, agent, doubt });
      return;
    }
    if (held) this.unplace(held);
    this.entries.set(page.slug, entry);
    this.bucket(entry.home).add(entry);
    if (entry.reasons.length > 0) this.bucket("attention").add(entry);
    this.version += 1;
  }

  private unplace(entry: Placed): void {
    this.buckets.get(entry.home)?.remove(entry);
    if (entry.reasons.length > 0) this.buckets.get("attention")?.remove(entry);
  }

  private dropUnseen(): void {
    for (const [slug, entry] of this.entries) {
      if (entry.seen === this.sweep) continue;
      this.unplace(entry);
      this.entries.delete(slug);
      this.version += 1;
    }
  }

  private orderedKeys(): WikiIndexGroupKey[] {
    const folders: string[] = [];
    for (const [key, bucket] of this.buckets) {
      if (key.startsWith("folder:") && bucket.members.size > 0) folders.push(key.slice("folder:".length));
    }
    folders.sort((a, b) => this.collator.compare(a, b));
    const keys: WikiIndexGroupKey[] = ["attention", "answers", ...folders.map((f) => `folder:${f}` as const), "several", "one", "none"];
    return keys.filter((key) => (this.buckets.get(key)?.members.size ?? 0) > 0);
  }

  /** Every non-empty group in flow order: whole at or under the limit, newest five above it. */
  groups(): WikiIndexGroupView[] {
    const whole = this.entries.size <= WIKI_INDEX_FULL_LIMIT;
    return this.orderedKeys().map((key) => {
      const bucket = this.buckets.get(key)!;
      return { key, count: bucket.members.size, entries: whole ? bucket.all() : bucket.newest() };
    });
  }

  /** One group whole, for "Show all"; null once it has emptied. */
  group(key: WikiIndexGroupKey): WikiIndexGroupView | null {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.members.size === 0) return null;
    return { key, count: bucket.members.size, entries: bucket.all() };
  }
}

export type WikiIndexItem =
  | { type: "heading"; group: WikiIndexGroupKey; count: number }
  | { type: "row"; group: WikiIndexGroupKey; entry: WikiIndexEntry }
  | { type: "more"; group: WikiIndexGroupKey; count: number };

/** The column as one list to window: each group's heading, its rows, and a line when it is cut. */
export function wikiIndexItems(groups: readonly WikiIndexGroupView[]): WikiIndexItem[] {
  const items: WikiIndexItem[] = [];
  for (const { key, count, entries } of groups) {
    items.push({ type: "heading", group: key, count });
    for (const entry of entries) items.push({ type: "row", group: key, entry });
    if (count > entries.length) items.push({ type: "more", group: key, count });
  }
  return items;
}

export type WikiIndexDay =
  | { kind: "now" | "today" | "yesterday" }
  | { kind: "ago"; days: number }
  | { kind: "date"; ms: number; otherYear: boolean };

const NOW_WINDOW_MS = 5 * 60_000;
const AGO_DAYS_UNDER = 7;

function localDayIndex(ms: number): number {
  const date = new Date(ms);
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** The row's date, by local calendar days; null when the page has none to show. */
export function wikiIndexDay(writtenAtMs: number, nowMs: number): WikiIndexDay | null {
  if (Number.isNaN(writtenAtMs)) return null;
  if (nowMs - writtenAtMs < NOW_WINDOW_MS) return { kind: "now" };
  const days = localDayIndex(nowMs) - localDayIndex(writtenAtMs);
  if (days <= 0) return { kind: "today" };
  if (days === 1) return { kind: "yesterday" };
  if (days < AGO_DAYS_UNDER) return { kind: "ago", days };
  return { kind: "date", ms: writtenAtMs, otherYear: new Date(writtenAtMs).getFullYear() !== new Date(nowMs).getFullYear() };
}
