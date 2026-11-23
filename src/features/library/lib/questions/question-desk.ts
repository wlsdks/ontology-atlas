import { recordedInstantMs, type VaultDoc } from '@/entities/docs-vault';
import { MAX_VECTOR_PREFIX_BYTES, MAX_VECTOR_PREFIXES } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import type { SourceUnit } from '@/shared/lib/library/source-units';
import { isRetainedAnswerPath, retainedAnswerHeads, type RetainedAnswerHead } from './answer-revision';
import { deskPages, isHangulStemTerm, type DeskCitation, type DeskClaim, type DeskLead, type DeskSourceHit } from './desk-search';

export function countDeskWikiPages(docs: readonly VaultDoc[]): number {
  return deskPages(docs).length;
}

export function questionDeskListingVersion(docs: readonly VaultDoc[], sources: readonly { path: string; mtime: number; bytes: number }[]): string {
  return JSON.stringify([
    docs.filter((doc) => doc.slug.startsWith('wiki/')).map((doc) => [doc.slug, doc.mtime ?? null]),
    sources.map((source) => [source.path, source.mtime, source.bytes]),
  ]);
}

export function questionDeskReportFileCurrent(reportScope: string, currentScope: string, reportListing: string, currentListing: string): boolean {
  return reportScope === currentScope && reportListing === currentListing;
}

/** `read` holds an entry for each page the Library has read. */
export function countDeskReadablePages(docs: readonly VaultDoc[], read: ReadonlyMap<string, unknown>): number {
  return deskPages(docs).filter((doc) => read.has(doc.slug)).length;
}

/** The longest sentence a lead row shows; a longer one shows a window of it. */
export const DESK_SENTENCE_LIMIT = 320;
/** Code units read past each cut so the grapheme boundaries near it come out right. */
const GRAPHEME_MARGIN = 64;

function firstTermAt(lower: string, terms: readonly string[]): number {
  let first = -1;
  const consider = (at: number) => { if (at >= 0 && (first < 0 || at < first)) first = at; };
  for (const term of terms) {
    if (!term) continue;
    const at = lower.indexOf(term);
    consider(at);
    if (at >= 0 || !isHangulStemTerm(term)) continue;
    for (let index = 0; index < term.length - 1; index += 1) consider(lower.indexOf(term.slice(index, index + 2)));
  }
  return first;
}

/**
 * A sentence a row can show: whole when it fits, otherwise `DESK_SENTENCE_LIMIT` code units around
 * the first matched term, cut between graphemes, with an ellipsis at each cut end. A source unit can
 * be one line of megabytes; the row, its accessible name and its highlight runs only see the window.
 */
export function deskSentenceWindow(text: string, terms: readonly string[], limit = DESK_SENTENCE_LIMIT): string {
  if (text.length <= limit) return text;
  const at = Math.max(0, firstTermAt(text.toLowerCase(), terms));
  const start = Math.max(0, Math.min(at - Math.floor(limit / 3), text.length - limit));
  const end = start + limit;
  const regionStart = Math.max(0, start - GRAPHEME_MARGIN);
  const regionEnd = Math.min(text.length, end + GRAPHEME_MARGIN);
  const boundaries = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    .segment(text.slice(regionStart, regionEnd))].map((segment) => regionStart + segment.index);
  boundaries.push(regionEnd);
  const from = start === 0 ? 0 : boundaries.find((boundary) => boundary >= start) ?? start;
  const to = end >= text.length ? text.length : boundaries.findLast((boundary) => boundary <= end && boundary > from) ?? end;
  const body = text.slice(from, to).trim();
  return `${from > 0 ? '…' : ''}${body}${to < text.length ? '…' : ''}`;
}

/**
 * The sentence cut into runs, `strong` where a question term matched the way `questionScore`
 * counted it: the whole term, or for a Hangul term of three or more syllables any two-syllable
 * piece of it (a particle changes the ending, not the stem).
 */
export function questionTermRuns(text: string, terms: readonly string[]): Array<{ text: string; strong: boolean }> {
  const lower = text.toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  const mark = (needle: string) => {
    if (!needle) return false;
    let found = false;
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + needle.length)) {
      marked.fill(true, at, at + needle.length);
      found = true;
    }
    return found;
  };
  for (const term of terms) {
    if (mark(term) || !isHangulStemTerm(term)) continue;
    for (let index = 0; index < term.length - 1; index += 1) mark(term.slice(index, index + 2));
  }
  const runs: Array<{ text: string; strong: boolean }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const last = runs[runs.length - 1];
    if (last && last.strong === marked[index]) last.text += text[index];
    else runs.push({ text: text[index]!, strong: marked[index]! });
  }
  return runs;
}

/**
 * The path prefixes a search by meaning keeps to: the top folder of every wiki page and listed
 * source the desk searches, with its trailing `/`, in NFC and, where it differs, in NFD, since Rust
 * compares bytes and Finder writes decomposed names. A file at the top of the folder is its own
 * prefix. Past the app's limits (`MAX_VECTOR_PREFIXES` entries, `MAX_VECTOR_PREFIX_BYTES` each) the
 * answer is none, which asks over every file.
 */
export function deskSearchPrefixes(paths: Iterable<string>): string[] {
  const prefixes = new Set<string>();
  for (const path of paths) {
    const slash = path.indexOf('/');
    const top = slash < 0 ? path : path.slice(0, slash + 1);
    prefixes.add(top.normalize('NFC'));
    prefixes.add(top.normalize('NFD'));
  }
  const tooLong = [...prefixes].some((prefix) => new TextEncoder().encode(prefix).length > MAX_VECTOR_PREFIX_BYTES);
  return prefixes.size > MAX_VECTOR_PREFIXES || tooLong ? [] : [...prefixes];
}

/** The sentence's runs for its row: a lead only meaning found matched no word, so none is strong. */
export function deskLeadTermRuns(lead: Pick<DeskLead, 'reason'>, sentence: string, terms: readonly string[]): Array<{ text: string; strong: boolean }> {
  return lead.reason === 'meaning' ? [{ text: sentence, strong: false }] : questionTermRuns(sentence, terms);
}

/**
 * What a report's brief hands the agent: the rows of the list the person sees, in its order and
 * whatever their reason, split into the brief's wiki and original sections.
 */
export function deskBriefEvidence(leads: readonly DeskLead[]): { claims: DeskClaim[]; sourceHits: DeskSourceHit[] } {
  const claims: DeskClaim[] = [];
  const sourceHits: DeskSourceHit[] = [];
  for (const lead of leads) {
    if (lead.kind === 'claim') claims.push(lead.claim);
    else sourceHits.push(lead.hit);
  }
  return { claims, sourceHits };
}

/**
 * When a page was written: its recorded `compiled_at`, else the day the folder lists for the file.
 * The Wiki index and the Sources home read the same `compiled_at`, so every list names one date.
 */
function pageWrittenAtMs(doc: VaultDoc): number {
  const recorded = doc.frontmatter.compiled_at;
  const recordedMs = typeof recorded === 'string' ? recordedInstantMs(recorded) : null;
  if (recordedMs !== null) return recordedMs;
  const listedMs = Date.parse(doc.updatedAt);
  return Number.isFinite(listedMs) ? listedMs : Number.NaN;
}

/** Undated pages sort last. */
const sortableMs = (ms: number) => (Number.isNaN(ms) ? 0 : ms);

export interface DeskRecentPage { slug: string; title: string; writtenAtMs: number; sources: number }

/**
 * The newest wiki pages by when they were written (`pageWrittenAtMs`), saved questions excluded.
 * One pass keeping the best `limit`, so a large wiki is never sorted: O(N * limit).
 */
export function recentDeskPages(docs: readonly VaultDoc[], limit: number): DeskRecentPage[] {
  const newest: { doc: VaultDoc; ms: number }[] = [];
  const before = (a: { doc: VaultDoc; ms: number }, b: { doc: VaultDoc; ms: number }) =>
    sortableMs(a.ms) - sortableMs(b.ms) || b.doc.slug.localeCompare(a.doc.slug);
  for (const doc of deskPages(docs)) {
    if (isRetainedAnswerPath(doc.slug)) continue;
    const row = { doc, ms: pageWrittenAtMs(doc) };
    if (newest.length === limit && before(row, newest[limit - 1]!) <= 0) continue;
    let at = newest.length;
    while (at > 0 && before(row, newest[at - 1]!) > 0) at -= 1;
    newest.splice(at, 0, row);
    if (newest.length > limit) newest.pop();
  }
  return newest.map(({ doc, ms }) => ({
    slug: doc.slug, title: doc.title, writtenAtMs: ms,
    sources: Array.isArray(doc.frontmatter.sources) ? doc.frontmatter.sources.filter((path) => typeof path === 'string').length : 0,
  }));
}

export interface DeskSavedQuestion { head: RetainedAnswerHead; savedAtMs: number }

/** Saved questions, newest first by when their page was written (`pageWrittenAtMs`). */
export function newestDeskQuestions(docs: readonly VaultDoc[], limit: number): DeskSavedQuestion[] {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  return retainedAnswerHeads(docs)
    .map((head) => {
      const doc = bySlug.get(head.slug);
      return { head, savedAtMs: doc ? pageWrittenAtMs(doc) : Number.NaN };
    })
    .sort((a, b) => sortableMs(b.savedAtMs) - sortableMs(a.savedAtMs) || a.head.slug.localeCompare(b.head.slug))
    .slice(0, limit);
}

export function jevClaimEligibility(claim: DeskClaim, citation: DeskCitation, passage: { state: string; cited: readonly SourceUnit[] }, measuredHash: string | null, fileChanged: boolean): 'ready' | 'missing' | 'stale' | 'unmeasured' {
  if (passage.state !== 'resolved' || passage.cited.length === 0) return 'missing';
  if (fileChanged) return 'stale';
  const recorded = claim.recordedHashes[citation.path];
  if (!recorded || !measuredHash) return 'unmeasured';
  return recorded.toLowerCase() === measuredHash.toLowerCase() ? 'ready' : 'stale';
}

export function jevPayloadEligibility(claim: string, evidence: string, payload: string): 'ready' | 'missing' | 'too-long' {
  if (!claim.trim() || !evidence.trim()) return 'missing';
  if (Array.from(claim).length > 2_000 || Array.from(evidence).length > 8_000 || new TextEncoder().encode(payload).length > 16_384) return 'too-long';
  return 'ready';
}
