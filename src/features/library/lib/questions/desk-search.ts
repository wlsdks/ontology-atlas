import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import type { SourceUnit } from '@/shared/lib/library/source-units';
import type { VaultDoc } from '@/entities/docs-vault';
import { fuseScoredLists } from './lead-fusion';

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

/** Function words and question words, English and Korean: they ask, they do not say what about. */
const STOP = new Set([
  ...'a an and are as at be by can did do does for from how in is it of on or the this to was were what when where which who why with about'.split(' '),
  ...'어떻게 얼마 얼마나 언제 언제까지 어디 어디서 어느 무엇 무슨 뭐 왜 누가 누구'.split(' '),
]);
const CITATION = /\[\[src:(sources\/[^\]#]+)#([^\]]+)\]\]/g;
const MAX_FILES = 200;
const MAX_BYTES = 20 * 1024 * 1024;
/** Rows each word list hands to fusion: claims, and source passages. */
const WORD_LEADS = 8;
/** Source passages one file may hand to the word list. */
const HITS_PER_FILE = 3;
/** Where the meaning list stands among the lists `fuseDeskLeads` fuses, after the word list. */
const MEANING_LIST = 1;
/**
 * How much each list's evidence weighs in the fused order: a word lead scores the share of the
 * question it covers, a meaning lead its nearness among the passages returned. On the labelled
 * fixture any word weight from 0.5 to 1.5 gives the same first rows (`pnpm perf:meaning-quality`).
 */
const WORD_WEIGHT = 1;
const MEANING_WEIGHT = 1;

export function deskPages(docs: readonly VaultDoc[]): VaultDoc[] {
  return docs.filter((doc) => doc.slug.startsWith('wiki/') && !doc.slug.split('/').some((part) => part.startsWith('_')) && !doc.frontmatter.kind);
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

/** A Hangul term long enough that a particle may change its ending: its leading syllables stand for it. */
function isHangulStemTerm(term: string): boolean {
  return /^[가-힣]{3,}$/u.test(term);
}

/**
 * What of `term` the lowered text holds: the whole term, or for a Hangul stem term its longest
 * leading piece of two syllables or more, since a particle or ending changes only the end. A piece
 * from inside or the end of the term is often an ending unrelated words share, and never counts.
 * `null` when nothing matched. O(term × text).
 */
export function matchedTermPiece(lower: string, term: string): string | null {
  if (lower.includes(term)) return term;
  if (!isHangulStemTerm(term)) return null;
  for (let length = term.length - 1; length >= 2; length -= 1) {
    const stem = term.slice(0, length);
    if (lower.includes(stem)) return stem;
  }
  return null;
}

/**
 * For each question term, how much of it the passage holds (`matchedTermPiece`), in characters
 * from its start, 0 for none. Citations and link targets are not the passage's words.
 */
function termMatches(text: string, terms: readonly string[]): number[] {
  const lower = text.replace(CITATION, ' ').replace(/\]\([^)]*\)/g, ']')
    .normalize('NFKC').toLowerCase();
  return terms.map((term) => matchedTermPiece(lower, term)?.length ?? 0);
}

/**
 * How much each piece of each term says among the `scanned` passages this search read, from the
 * `matches` of those that hold any term: BM25's inverse document frequency of the term's first
 * `length` characters, at `[term][length]`. A passage holding a longer piece holds every shorter
 * one, so a bare stem weighs no more than the whole term, a piece in a quarter of the passages
 * weighs little, and a term found nowhere weighs most. O(M × T + T × K) for M matching passages,
 * T terms and K characters a term has.
 */
function termWeights(matches: readonly (readonly number[])[], terms: readonly string[], scanned: number): number[][] {
  return terms.map((term, index) => {
    const holding = new Array<number>(term.length + 1).fill(0);
    for (const passage of matches) holding[passage[index]!]! += 1;
    for (let length = term.length - 1; length >= 0; length -= 1) holding[length]! += holding[length + 1]!;
    return holding.map((count) => Math.log(1 + (scanned - count + 0.5) / (count + 0.5)));
  });
}

/** The share of the question's weight the matched pieces carry, against every term matched whole: 0 to 1. O(T). */
function questionCoverage(matched: readonly number[], weights: readonly (readonly number[])[], terms: readonly string[]): number {
  const whole = terms.reduce((sum, term, index) => sum + weights[index]![term.length]!, 0);
  if (!whole) return 0;
  return matched.reduce((sum, length, index) => sum + (length ? weights[index]![length]! : 0), 0) / whole;
}

function recordedHashes(frontmatter: Record<string, unknown>): Record<string, string> {
  const value = frontmatter.source_hash;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/**
 * What the desk keeps of one page read: each claim's sentence and body line, in page order, and the
 * hashes the page records. `bodyOffset` counts the lines above the body, so a claim's line in the
 * file is `line + bodyOffset`.
 */
export interface DeskPageClaims {
  readonly bodyOffset: number;
  readonly recordedHashes: Readonly<Record<string, string>>;
  readonly claims: ReadonlyArray<{ readonly text: string; readonly line: number }>;
}

/**
 * The claims of a page before any question scores them: list items under Facts or Decisions that
 * are not questions. Copied out by `JSON`, so what is kept holds none of the page text. O(page bytes).
 */
export function deskPageClaims(raw: string): DeskPageClaims {
  const parsed = parseFrontmatter(raw);
  const whole = raw.replace(/^﻿/u, '').replace(/\r\n/gu, '\n');
  const bodyOffset = whole.endsWith(parsed.body) ? whole.slice(0, whole.length - parsed.body.length).split('\n').length - 1 : 0;
  const claims: Array<{ text: string; line: number }> = [];
  let section = '';
  for (const [index, line] of parsed.body.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) section = trimmed.slice(3).toLowerCase();
    if (section !== 'facts' && section !== 'decisions') continue;
    if (!/^[-*] /.test(trimmed)) continue;
    const text = trimmed.slice(2).trim();
    if (text.endsWith('?')) continue;
    claims.push({ text, line: index + 1 });
  }
  const hashes = recordedHashes(parsed.frontmatter);
  return JSON.parse(JSON.stringify({ bodyOffset, recordedHashes: hashes, claims })) as DeskPageClaims;
}

function deskClaim(doc: VaultDoc, page: DeskPageClaims, claim: DeskPageClaims['claims'][number], score: number): DeskClaim {
  const citations = [...claim.text.matchAll(CITATION)].map((match) => ({ path: match[1]!, anchor: match[2]! }));
  return { pageSlug: doc.slug, pageTitle: doc.title, text: claim.text, citations, line: claim.line, score, recordedHashes: page.recordedHashes as Record<string, string> };
}

/** The word lists before fusion, each best first, and what each left out. */
export interface DeskWordLeads {
  claims: DeskClaim[];
  sourceHits: DeskSourceHit[];
  /** Claims and source passages that matched a term but stayed out of the lists. */
  omittedClaims: number;
  omittedSources: number;
  readPages: number;
  totalPages: number;
}

const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;

/**
 * The claims of the pages read and the units of the sources read that hold a question term, each
 * scored by the share of the question it covers (`questionCoverage`), with every term weighed by
 * how rare it is among all of those passages (`termWeights`). The best `WORD_LEADS` claims; the
 * best `HITS_PER_FILE` passages of each source, then the best `WORD_LEADS` of those. Ties go to
 * path and line, so the order does not depend on the order of the inputs.
 *
 * One pass matches every passage against the terms and counts them, a second scores the matches:
 * O(P × T × L) for P passages of length L and T terms, then O(M log M) for the M that matched.
 */
export function deskWordLeads({ terms, docs, claimsBySlug, sourceUnitsByPath }: {
  terms: readonly string[];
  docs: readonly VaultDoc[];
  claimsBySlug: ReadonlyMap<string, DeskPageClaims>;
  sourceUnitsByPath: ReadonlyMap<string, readonly SourceUnit[]>;
}): DeskWordLeads {
  const pages = deskPages(docs);
  let scanned = 0;
  const matching: number[][] = [];
  const count = (matches: number[]) => {
    scanned += 1;
    if (!matches.some(Boolean)) return false;
    matching.push(matches);
    return true;
  };
  const matchedClaims: Array<{ doc: VaultDoc; page: DeskPageClaims; claim: DeskPageClaims['claims'][number]; matches: number[] }> = [];
  let readPages = 0;
  for (const doc of pages) {
    const page = claimsBySlug.get(doc.slug);
    if (page === undefined) continue;
    readPages += 1;
    for (const claim of page.claims) {
      const matches = termMatches(claim.text, terms);
      if (count(matches)) matchedClaims.push({ doc, page, claim, matches });
    }
  }
  const matchedUnits = new Map<string, Array<{ unit: SourceUnit; matches: number[] }>>();
  for (const [path, units] of sourceUnitsByPath) {
    const found: Array<{ unit: SourceUnit; matches: number[] }> = [];
    for (const unit of units) {
      const matches = termMatches(unit.text, terms);
      if (count(matches)) found.push({ unit, matches });
    }
    if (found.length) matchedUnits.set(path, found);
  }
  const weights = termWeights(matching, terms, scanned);
  const claims = matchedClaims.map(({ doc, page, claim, matches }) => deskClaim(doc, page, claim, questionCoverage(matches, weights, terms)))
    .sort((a, b) => byScore(a, b) || a.pageSlug.localeCompare(b.pageSlug) || a.line - b.line);
  const hits: DeskSourceHit[] = [];
  let omittedPerFile = 0;
  for (const [path, found] of matchedUnits) {
    const scored = found.map(({ unit, matches }) => ({ path, anchor: unit.anchor, text: unit.text, score: questionCoverage(matches, weights, terms) }))
      .sort((a, b) => byScore(a, b) || anchorLine(a.anchor) - anchorLine(b.anchor) || a.anchor.localeCompare(b.anchor));
    hits.push(...scored.slice(0, HITS_PER_FILE));
    omittedPerFile += Math.max(0, scored.length - HITS_PER_FILE);
  }
  hits.sort((a, b) => byScore(a, b) || a.path.localeCompare(b.path) || anchorLine(a.anchor) - anchorLine(b.anchor) || a.anchor.localeCompare(b.anchor));
  return {
    claims: claims.slice(0, WORD_LEADS),
    sourceHits: hits.slice(0, WORD_LEADS),
    omittedClaims: Math.max(0, claims.length - WORD_LEADS),
    omittedSources: omittedPerFile + Math.max(0, hits.length - WORD_LEADS),
    readPages,
    totalPages: pages.length,
  };
}

/** The word list of claims alone, weighing terms among the claims of the pages read. */
export function findDeskClaims(question: string, docs: readonly VaultDoc[], claimsBySlug: ReadonlyMap<string, DeskPageClaims>): {
  claims: DeskClaim[]; readPages: number; totalPages: number; omitted: number;
} {
  const words = deskWordLeads({ terms: questionTerms(question), docs, claimsBySlug, sourceUnitsByPath: new Map() });
  return { claims: words.claims, readPages: words.readPages, totalPages: words.totalPages, omitted: words.omittedClaims };
}

/** Which searches held a lead: the word lists, the meaning list, or both. */
export type DeskLeadReason = 'words' | 'meaning' | 'both';

export type DeskLead =
  | { kind: 'claim'; key: string; claim: DeskClaim; reason: DeskLeadReason }
  | { kind: 'source'; key: string; hit: DeskSourceHit; reason: DeskLeadReason };

/** A row search by meaning found, before fusion: a claim or a source passage, and how near its passage was. */
export type DeskMeaningLead = ({ kind: 'claim'; claim: DeskClaim } | { kind: 'source'; hit: DeskSourceHit }) & { similarity: number };

/**
 * A passage search by meaning returned: a file, a 1-based, inclusive line range in it, and its
 * cosine similarity to the question, higher nearer.
 */
export interface DeskPassageHit { path: string; lineStart: number; lineEnd: number; score: number }

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
export function deskMeaningLeads({ hits, docs, claimsBySlug, searchedSources, sourceUnitsByPath, claims, sourceHits }: {
  hits: readonly DeskPassageHit[];
  docs: readonly VaultDoc[];
  claimsBySlug: ReadonlyMap<string, DeskPageClaims>;
  /** The source paths this search planned to read. */
  searchedSources: ReadonlySet<string>;
  /** The units of each planned source this search read; a path absent here could not be read. */
  sourceUnitsByPath: ReadonlyMap<string, readonly SourceUnit[]>;
  /** The word leads, each list best first. */
  claims: readonly DeskClaim[];
  sourceHits: readonly DeskSourceHit[];
}): { leads: DeskMeaningLead[]; dropped: number } {
  // Finder writes decomposed names and slugs are composed: both sides are joined in NFC, and a row
  // keeps the path as the desk lists it, so it opens the file it names.
  const nfc = (path: string) => path.normalize('NFC');
  const pageByPath = new Map(deskPages(docs).map((doc) => [nfc(`${doc.slug}.md`), doc]));
  const listedSource = new Map([...searchedSources].map((path) => [nfc(path), path]));
  const leads: DeskMeaningLead[] = [];
  let dropped = 0;
  const within = (line: number, hit: DeskPassageHit) => line >= hit.lineStart && line <= hit.lineEnd;
  for (const hit of hits) {
    const doc = pageByPath.get(nfc(hit.path));
    if (doc) {
      const page = claimsBySlug.get(doc.slug);
      if (page === undefined) { dropped += 1; continue; }
      const { bodyOffset } = page;
      const inRange = page.claims.find((candidate) => within(candidate.line + bodyOffset, hit));
      const claim = claims.find((worded) => worded.pageSlug === doc.slug && within(worded.line + bodyOffset, hit))
        ?? (inRange ? deskClaim(doc, page, inRange, 0) : undefined);
      if (claim) leads.push({ kind: 'claim', claim, similarity: hit.score });
      else dropped += 1;
      continue;
    }
    const path = listedSource.get(nfc(hit.path));
    if (path === undefined) continue;
    const units = sourceUnitsByPath.get(path);
    if (!units) { dropped += 1; continue; }
    const worded = sourceHits.find((source) => source.path === path && within(anchorLine(source.anchor), hit));
    if (worded) { leads.push({ kind: 'source', hit: worded, similarity: hit.score }); continue; }
    const unit = units.find((candidate) => LINE_ANCHOR.test(candidate.anchor) && within(anchorLine(candidate.anchor), hit)
      && candidate.kind !== 'heading' && !MARKDOWN_HEADING.test(candidate.text));
    if (unit) leads.push({ kind: 'source', hit: { path, anchor: unit.anchor, text: unit.text, score: 0 }, similarity: hit.score });
    else dropped += 1;
  }
  return { leads, dropped };
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
 * Where each meaning lead stands among those returned, 0 for the farthest and 1 for the nearest,
 * so the fused order reads similarity relative to this question, not a model's absolute scale.
 * All 1 when they are equally near. O(N).
 */
function meaningNearness(meaning: readonly DeskMeaningLead[]): number[] {
  const similarities = meaning.map((lead) => lead.similarity);
  const nearest = Math.max(...similarities);
  const farthest = Math.min(...similarities);
  return similarities.map((similarity) => nearest > farthest ? (similarity - farthest) / (nearest - farthest) : 1);
}

/**
 * Wiki claims and source passages in one list, best first, by score fusion
 * (`fuseScoredLists`): a word lead brings the share of the question it covers, weighed by rarity,
 * and a meaning lead its nearness among those returned (`meaningNearness`), so one common word
 * cannot lift a passage above the nearest passage found by meaning. Ties go to claim, path and line.
 * A passage at the place a listed claim cites that says the same sentence is that claim's
 * evidence, which the claim's cited-file press already opens: it folds into the claim, which keeps
 * the better of each score. A cited passage that says something else keeps its own row, so a claim
 * and the line that contradicts it stand in the list together.
 *
 * `meaning` is the second list, the rows search by meaning found. Each lead's reason names the
 * lists that held it; a folded passage's lists count for its claim. O(N log N) for N leads.
 */
export function fuseDeskLeads(claims: readonly DeskClaim[], hits: readonly DeskSourceHit[], meaning: readonly DeskMeaningLead[] = []): DeskLead[] {
  const claimLead = (claim: DeskClaim): DeskLead => ({ kind: 'claim', key: `claim:${claim.pageSlug}:${claim.line}`, claim, reason: 'words' });
  const sourceLead = (hit: DeskSourceHit): DeskLead => ({ kind: 'source', key: `source:${hit.path}#${hit.anchor}`, hit, reason: 'words' });
  const words = [
    ...claims.map((claim) => ({ item: claimLead(claim), score: claim.score })),
    ...hits.map((hit) => ({ item: sourceLead(hit), score: hit.score })),
  ];
  const nearness = meaningNearness(meaning);
  const meaningLeads = meaning.map((lead, index) => ({
    item: lead.kind === 'claim' ? claimLead(lead.claim) : sourceLead(lead.hit), score: nearness[index]!,
  }));
  const citedBy = new Map<string, Set<string>>();
  for (const claim of [...claims, ...meaning.flatMap((lead) => lead.kind === 'claim' ? [lead.claim] : [])]) {
    const sentence = comparableSentence(claim.text);
    for (const citation of claim.citations) {
      const place = `source:${citation.path}#${citation.anchor}\n${sentence}`;
      citedBy.set(place, (citedBy.get(place) ?? new Set()).add(`claim:${claim.pageSlug}:${claim.line}`));
    }
  }
  return fuseScoredLists([words, meaningLeads], [WORD_WEIGHT, MEANING_WEIGHT], (lead) => lead.key, (a, b) => {
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

/** What one question found: the desk's one list and the counts its coverage line names. */
interface DeskSearchResult {
  leads: DeskLead[];
  terms: string[];
  readPages: number;
  totalPages: number;
  /** Claims and source passages that matched a word but stayed out of the word lists. */
  omittedClaims: number;
  omittedSources: number;
  /** Passages search by meaning returned that stand for no row; `null` when meaning took no part. */
  meaningDropped: number | null;
}

/**
 * The desk's search after its reads, as the person sees it: the word lists over the claims of the
 * pages read and the units of the sources read, the passages search by meaning returned (`null`
 * when it did not answer) resolved into rows, and all of it fused into one list.
 */
export function searchDesk({ question, docs, claimsBySlug, searchedSources, sourceUnitsByPath, meaningHits }: {
  question: string;
  docs: readonly VaultDoc[];
  claimsBySlug: ReadonlyMap<string, DeskPageClaims>;
  /** The source paths this search planned to read. */
  searchedSources: ReadonlySet<string>;
  /** The units of each planned source this search read; a path absent here could not be read. */
  sourceUnitsByPath: ReadonlyMap<string, readonly SourceUnit[]>;
  meaningHits: readonly DeskPassageHit[] | null;
}): DeskSearchResult {
  const terms = questionTerms(question);
  const words = deskWordLeads({ terms, docs, claimsBySlug, sourceUnitsByPath });
  const byMeaning = meaningHits === null ? null : deskMeaningLeads({
    hits: meaningHits, docs, claimsBySlug, searchedSources, sourceUnitsByPath, claims: words.claims, sourceHits: words.sourceHits,
  });
  return {
    leads: fuseDeskLeads(words.claims, words.sourceHits, byMeaning?.leads ?? []),
    terms,
    readPages: words.readPages,
    totalPages: words.totalPages,
    omittedClaims: words.omittedClaims,
    omittedSources: words.omittedSources,
    meaningDropped: byMeaning?.dropped ?? null,
  };
}
