import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import type { SourceUnit } from '@/shared/lib/library/source-passage';
import type { VaultDoc } from '@/entities/docs-vault';
import { isRetainedAnswerPath, retainedAnswerHeads, type RetainedAnswerHead } from './answer-revision';
import { fuseRankedLists } from './lead-fusion';

export interface DeskCitation { path: string; anchor: string }
export interface DeskClaim {
  pageSlug: string;
  pageTitle: string;
  text: string;
  citations: DeskCitation[];
  /** 1-based line of the claim in the page body; orders equal leads, never shown. */
  line: number;
  score: number;
  recordedHashes: Record<string, string>;
}
export interface DeskSourceHit { path: string; anchor: string; text: string; score: number }

const STOP = new Set('a an and are as at be by can did do does for from how in is it of on or the this to was were what when where which who why with about'.split(' '));
const CITATION = /\[\[src:(sources\/[^\]#]+)#([^\]]+)\]\]/g;
const MAX_FILES = 200;
const MAX_BYTES = 20 * 1024 * 1024;
/** Where the meaning list stands among the lists `fuseDeskLeads` fuses. */
const MEANING_LIST = 2;

function deskPages(docs: readonly VaultDoc[]): VaultDoc[] {
  return docs.filter((doc) => doc.slug.startsWith('wiki/') && !doc.slug.split('/').some((part) => part.startsWith('_')) && !doc.frontmatter.kind);
}

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

export function countDeskReadablePages(docs: readonly VaultDoc[], rawBySlug: ReadonlyMap<string, string>): number {
  return deskPages(docs).filter((doc) => rawBySlug.has(doc.slug)).length;
}

export function planDeskSourceReads<T extends { path: string; bytes: number }>(sources: readonly T[]): T[] {
  const planned: T[] = [];
  let bytes = 0;
  for (const source of [...sources].sort((a, b) => a.path.localeCompare(b.path))) {
    if (planned.length >= MAX_FILES) break;
    if (bytes + source.bytes > MAX_BYTES) continue;
    planned.push(source);
    bytes += source.bytes;
  }
  return planned;
}

export function questionTerms(question: string): string[] {
  return [...new Set((question.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((term) => term.length > 1 && !STOP.has(term)))];
}

function questionScore(text: string, terms: readonly string[]): number {
  const lower = text.replace(CITATION, ' ').replace(/\]\([^)]*\)/g, ']')
    .normalize('NFKC').toLowerCase();
  return terms.reduce((score, term) => {
    if (lower.includes(term)) return score + 2;
    if (/^[가-힣]{3,}$/u.test(term) && [...term].some((_, index) => index < term.length - 1 && lower.includes(term.slice(index, index + 2)))) return score + 0.5;
    return score;
  }, 0);
}

function recordedHashes(frontmatter: Record<string, unknown>): Record<string, string> {
  const value = frontmatter.source_hash;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/**
 * Every claim on a page, in page order, before any question scores it: a list item under Facts or
 * Decisions that is not a question. `bodyOffset` counts the lines above the body, so a claim's
 * line in the file is `line + bodyOffset`.
 */
function pageClaims(doc: VaultDoc, raw: string): { claims: DeskClaim[]; bodyOffset: number } {
  const parsed = parseFrontmatter(raw);
  const hashes = recordedHashes(parsed.frontmatter);
  const whole = raw.replace(/^﻿/u, '').replace(/\r\n/gu, '\n');
  const bodyOffset = whole.endsWith(parsed.body) ? whole.slice(0, whole.length - parsed.body.length).split('\n').length - 1 : 0;
  const claims: DeskClaim[] = [];
  let section = '';
  for (const [index, line] of parsed.body.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) section = trimmed.slice(3).toLowerCase();
    if (section !== 'facts' && section !== 'decisions') continue;
    if (!/^[-*] /.test(trimmed)) continue;
    const text = trimmed.slice(2).trim();
    if (text.endsWith('?')) continue;
    const citations = [...text.matchAll(CITATION)].map((match) => ({ path: match[1]!, anchor: match[2]! }));
    claims.push({ pageSlug: doc.slug, pageTitle: doc.title, text, citations, line: index + 1, score: 0, recordedHashes: hashes });
  }
  return { claims, bodyOffset };
}

export function findDeskClaims(question: string, docs: readonly VaultDoc[], rawBySlug: ReadonlyMap<string, string>): {
  claims: DeskClaim[]; readPages: number; totalPages: number; omitted: number;
} {
  const terms = questionTerms(question);
  const pages = deskPages(docs);
  const claims: DeskClaim[] = [];
  let readPages = 0;
  for (const doc of pages) {
    const raw = rawBySlug.get(doc.slug);
    if (raw === undefined) continue;
    readPages += 1;
    for (const claim of pageClaims(doc, raw).claims) {
      const score = questionScore(claim.text, terms);
      if (score) claims.push({ ...claim, score });
    }
  }
  claims.sort((a, b) => b.score - a.score || a.pageSlug.localeCompare(b.pageSlug));
  return { claims: claims.slice(0, 8), readPages, totalPages: pages.length, omitted: Math.max(0, claims.length - 8) };
}

export function findDeskSourceHits(path: string, units: readonly SourceUnit[], terms: readonly string[]): { hits: DeskSourceHit[]; matches: number } {
  const hits: DeskSourceHit[] = [];
  let matches = 0;
  for (const unit of units) {
    const score = questionScore(unit.text, terms);
    if (!score) continue;
    matches += 1;
    hits.push({ path, anchor: unit.anchor, text: unit.text, score });
    hits.sort((a, b) => b.score - a.score || a.anchor.localeCompare(b.anchor));
    if (hits.length > 3) hits.pop();
  }
  return { hits, matches };
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
    if (mark(term) || !/^[가-힣]{3,}$/u.test(term)) continue;
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

/** Which searches held a lead: the word lists, the meaning list, or both. */
export type DeskLeadReason = 'words' | 'meaning' | 'both';

export type DeskLead =
  | { kind: 'claim'; key: string; claim: DeskClaim; reason: DeskLeadReason }
  | { kind: 'source'; key: string; hit: DeskSourceHit; reason: DeskLeadReason };

/** A row search by meaning found, before fusion: a claim or a source passage. */
export type DeskMeaningLead = { kind: 'claim'; claim: DeskClaim } | { kind: 'source'; hit: DeskSourceHit };

/** A passage search by meaning returned: a file and a 1-based, inclusive line range in it. */
export interface DeskPassageHit { path: string; lineStart: number; lineEnd: number }

function anchorLine(anchor: string): number {
  const digits = /\d+/.exec(anchor);
  return digits ? Number(digits[0]) : 0;
}

const LINE_ANCHOR = /^l\d+$/u;
const MARKDOWN_HEADING = /^#{1,6}(?:\s|$)/u;

/**
 * The rows the passages found by meaning stand for, in the order returned. A passage in a file the
 * desk does not search (a listed wiki page, or a source in this search's plan) is dropped
 * uncounted. A passage holding a lead found by words is that lead, the best-ranked one in range,
 * so fusion merges the two. Otherwise its row is the passage's first sentence: for a source the
 * first unit in range that is not a heading, from the units this search read; for a wiki page the
 * first claim in range. A passage whose file was not read, or whose range holds no such sentence,
 * is dropped and counted in `dropped`.
 */
export function deskMeaningLeads({ hits, docs, rawBySlug, searchedSources, sourceUnitsByPath, claims, sourceHits }: {
  hits: readonly DeskPassageHit[];
  docs: readonly VaultDoc[];
  rawBySlug: ReadonlyMap<string, string>;
  /** The source paths this search planned to read. */
  searchedSources: ReadonlySet<string>;
  /** The units of each planned source this search read; a path absent here could not be read. */
  sourceUnitsByPath: ReadonlyMap<string, readonly SourceUnit[]>;
  /** The word leads, each list best first. */
  claims: readonly DeskClaim[];
  sourceHits: readonly DeskSourceHit[];
}): { leads: DeskMeaningLead[]; dropped: number } {
  const pageByPath = new Map(deskPages(docs).map((doc) => [`${doc.slug}.md`, doc]));
  const parsedPages = new Map<string, ReturnType<typeof pageClaims>>();
  const leads: DeskMeaningLead[] = [];
  let dropped = 0;
  const within = (line: number, hit: DeskPassageHit) => line >= hit.lineStart && line <= hit.lineEnd;
  for (const hit of hits) {
    const doc = pageByPath.get(hit.path);
    if (doc) {
      const raw = rawBySlug.get(doc.slug);
      if (raw === undefined) { dropped += 1; continue; }
      let page = parsedPages.get(doc.slug);
      if (!page) { page = pageClaims(doc, raw); parsedPages.set(doc.slug, page); }
      const { bodyOffset } = page;
      const claim = claims.find((worded) => worded.pageSlug === doc.slug && within(worded.line + bodyOffset, hit))
        ?? page.claims.find((candidate) => within(candidate.line + bodyOffset, hit));
      if (claim) leads.push({ kind: 'claim', claim });
      else dropped += 1;
      continue;
    }
    if (!searchedSources.has(hit.path)) continue;
    const units = sourceUnitsByPath.get(hit.path);
    if (!units) { dropped += 1; continue; }
    const worded = sourceHits.find((source) => source.path === hit.path && within(anchorLine(source.anchor), hit));
    if (worded) { leads.push({ kind: 'source', hit: worded }); continue; }
    const unit = units.find((candidate) => LINE_ANCHOR.test(candidate.anchor) && within(anchorLine(candidate.anchor), hit)
      && candidate.kind !== 'heading' && !MARKDOWN_HEADING.test(candidate.text));
    if (unit) leads.push({ kind: 'source', hit: { path: hit.path, anchor: unit.anchor, text: unit.text, score: 0 } });
    else dropped += 1;
  }
  return { leads, dropped };
}

/** The sentence's runs for its row: a lead only meaning found matched no word, so none is strong. */
export function deskLeadTermRuns(lead: Pick<DeskLead, 'reason'>, sentence: string, terms: readonly string[]): Array<{ text: string; strong: boolean }> {
  return lead.reason === 'meaning' ? [{ text: sentence, strong: false }] : questionTermRuns(sentence, terms);
}

function leadPlace(lead: DeskLead): [string, number] {
  return lead.kind === 'claim' ? [lead.claim.pageSlug, lead.claim.line] : [lead.hit.path, anchorLine(lead.hit.anchor)];
}

/**
 * A sentence as compared, not as shown: citations and leading list, quote or heading markers
 * dropped, then NFC, lower case, single spaces and no trailing punctuation.
 */
function comparableSentence(text: string): string {
  return text.replace(/\[\[src:[^\]]+\]\]/gu, ' ')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)+/u, '')
    .normalize('NFC').toLocaleLowerCase('und')
    .replace(/\s+/gu, ' ').trim()
    .replace(/[\s.,!?;:。．、！？…]+$/u, '');
}

/**
 * Wiki claims and source passages in one list, best first: rank fusion, then claim, path and line.
 * A passage at the place a listed claim cites that says the same sentence is that claim's
 * evidence, which the claim's cited-file press already opens: it folds into the claim and adds its
 * rank to the claim's. A cited passage that says something else keeps its own row, so a claim and
 * the line that contradicts it stand in the list together.
 *
 * `meaning` is the third list, the rows search by meaning found in the order returned. Each lead's
 * reason names the lists that held it; a folded passage's lists count for its claim.
 */
export function fuseDeskLeads(claims: readonly DeskClaim[], hits: readonly DeskSourceHit[], meaning: readonly DeskMeaningLead[] = []): DeskLead[] {
  const claimLead = (claim: DeskClaim): DeskLead => ({ kind: 'claim', key: `claim:${claim.pageSlug}:${claim.line}`, claim, reason: 'words' });
  const sourceLead = (hit: DeskSourceHit): DeskLead => ({ kind: 'source', key: `source:${hit.path}#${hit.anchor}`, hit, reason: 'words' });
  const meaningLeads = meaning.map((lead) => lead.kind === 'claim' ? claimLead(lead.claim) : sourceLead(lead.hit));
  const citedBy = new Map<string, Set<string>>();
  for (const claim of [...claims, ...meaning.flatMap((lead) => lead.kind === 'claim' ? [lead.claim] : [])]) {
    const sentence = comparableSentence(claim.text);
    for (const citation of claim.citations) {
      const place = `source:${citation.path}#${citation.anchor}\n${sentence}`;
      citedBy.set(place, (citedBy.get(place) ?? new Set()).add(`claim:${claim.pageSlug}:${claim.line}`));
    }
  }
  return fuseRankedLists([claims.map(claimLead), hits.map(sourceLead), meaningLeads], (lead) => lead.key, (a, b) => {
    if (a.kind !== b.kind) return a.kind === 'claim' ? -1 : 1;
    const [pathA, lineA] = leadPlace(a);
    const [pathB, lineB] = leadPlace(b);
    return pathA.localeCompare(pathB) || lineA - lineB;
  }, (lead) => lead.kind === 'source' ? [...citedBy.get(`${lead.key}\n${comparableSentence(lead.hit.text)}`) ?? []] : [])
    .map(({ item, lists }): DeskLead => {
      const byMeaning = lists.includes(MEANING_LIST);
      return { ...item, reason: !byMeaning ? 'words' : lists.length === 1 ? 'meaning' : 'both' };
    });
}

function dayValue(value: unknown): number {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

export interface DeskRecentPage { slug: string; title: string; updatedAt: string; sources: number }

/**
 * The newest wiki pages by the day the folder lists for them (`updatedAt`), saved questions
 * excluded. One pass keeping the best `limit`, so a large wiki is never sorted: O(N * limit).
 */
export function recentDeskPages(docs: readonly VaultDoc[], limit: number): DeskRecentPage[] {
  const newest: VaultDoc[] = [];
  const before = (a: VaultDoc, b: VaultDoc) => dayValue(a.updatedAt) - dayValue(b.updatedAt) || b.slug.localeCompare(a.slug);
  for (const doc of deskPages(docs)) {
    if (isRetainedAnswerPath(doc.slug)) continue;
    if (newest.length === limit && before(doc, newest[limit - 1]!) <= 0) continue;
    let at = newest.length;
    while (at > 0 && before(doc, newest[at - 1]!) > 0) at -= 1;
    newest.splice(at, 0, doc);
    if (newest.length > limit) newest.pop();
  }
  return newest.map((doc) => ({
    slug: doc.slug, title: doc.title, updatedAt: doc.updatedAt,
    sources: Array.isArray(doc.frontmatter.sources) ? doc.frontmatter.sources.filter((path) => typeof path === 'string').length : 0,
  }));
}

export interface DeskSavedQuestion { head: RetainedAnswerHead; savedAt: string }

/** Saved questions, newest first by the `compiled_at` their page records, else the listed day. */
export function newestDeskQuestions(docs: readonly VaultDoc[], limit: number): DeskSavedQuestion[] {
  const listed = new Map(docs.map((doc) => [doc.slug, doc.updatedAt]));
  return retainedAnswerHeads(docs)
    .map((head) => {
      const recorded = head.frontmatter.compiled_at;
      const savedAt = dayValue(recorded) ? String(recorded) : listed.get(head.slug) ?? '';
      return { head, savedAt };
    })
    .sort((a, b) => dayValue(b.savedAt) - dayValue(a.savedAt) || a.head.slug.localeCompare(b.head.slug))
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
