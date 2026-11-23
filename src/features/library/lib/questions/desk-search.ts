import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import type { SourceUnit } from '@/shared/lib/library/source-units';
import type { VaultDoc } from '@/entities/docs-vault';
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
/** Rows each word list hands to fusion: claims, and source passages. */
const WORD_LEADS = 8;
/** Source passages one file may hand to the word list. */
const HITS_PER_FILE = 3;
/** Where the meaning list stands among the lists `fuseDeskLeads` fuses. */
const MEANING_LIST = 2;

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

/** A Hangul term long enough that a particle may change its ending: its two-syllable pieces stand for it. */
export function isHangulStemTerm(term: string): boolean {
  return /^[가-힣]{3,}$/u.test(term);
}

function questionScore(text: string, terms: readonly string[]): number {
  const lower = text.replace(CITATION, ' ').replace(/\]\([^)]*\)/g, ']')
    .normalize('NFKC').toLowerCase();
  return terms.reduce((score, term) => {
    if (lower.includes(term)) return score + 2;
    if (isHangulStemTerm(term) && [...term].some((_, index) => index < term.length - 1 && lower.includes(term.slice(index, index + 2)))) return score + 0.5;
    return score;
  }, 0);
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

export function findDeskClaims(question: string, docs: readonly VaultDoc[], claimsBySlug: ReadonlyMap<string, DeskPageClaims>): {
  claims: DeskClaim[]; readPages: number; totalPages: number; omitted: number;
} {
  const terms = questionTerms(question);
  const pages = deskPages(docs);
  const claims: DeskClaim[] = [];
  let readPages = 0;
  for (const doc of pages) {
    const page = claimsBySlug.get(doc.slug);
    if (page === undefined) continue;
    readPages += 1;
    for (const claim of page.claims) {
      const score = questionScore(claim.text, terms);
      if (score) claims.push(deskClaim(doc, page, claim, score));
    }
  }
  claims.sort((a, b) => b.score - a.score || a.pageSlug.localeCompare(b.pageSlug));
  return { claims: claims.slice(0, WORD_LEADS), readPages, totalPages: pages.length, omitted: Math.max(0, claims.length - WORD_LEADS) };
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
    if (hits.length > HITS_PER_FILE) hits.pop();
  }
  return { hits, matches };
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
      if (claim) leads.push({ kind: 'claim', claim });
      else dropped += 1;
      continue;
    }
    const path = listedSource.get(nfc(hit.path));
    if (path === undefined) continue;
    const units = sourceUnitsByPath.get(path);
    if (!units) { dropped += 1; continue; }
    const worded = sourceHits.find((source) => source.path === path && within(anchorLine(source.anchor), hit));
    if (worded) { leads.push({ kind: 'source', hit: worded }); continue; }
    const unit = units.find((candidate) => LINE_ANCHOR.test(candidate.anchor) && within(anchorLine(candidate.anchor), hit)
      && candidate.kind !== 'heading' && !MARKDOWN_HEADING.test(candidate.text));
    if (unit) leads.push({ kind: 'source', hit: { path, anchor: unit.anchor, text: unit.text, score: 0 } });
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
  const wiki = findDeskClaims(question, docs, claimsBySlug);
  const terms = questionTerms(question);
  const hits: DeskSourceHit[] = [];
  let omittedPerFile = 0;
  for (const path of [...sourceUnitsByPath.keys()].sort((a, b) => a.localeCompare(b))) {
    const found = findDeskSourceHits(path, sourceUnitsByPath.get(path)!, terms);
    hits.push(...found.hits);
    omittedPerFile += found.matches - found.hits.length;
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const sourceHits = hits.slice(0, WORD_LEADS);
  const byMeaning = meaningHits === null ? null : deskMeaningLeads({
    hits: meaningHits, docs, claimsBySlug, searchedSources, sourceUnitsByPath, claims: wiki.claims, sourceHits,
  });
  return {
    leads: fuseDeskLeads(wiki.claims, sourceHits, byMeaning?.leads ?? []),
    terms,
    readPages: wiki.readPages,
    totalPages: wiki.totalPages,
    omittedClaims: wiki.omitted,
    omittedSources: omittedPerFile + Math.max(0, hits.length - WORD_LEADS),
    meaningDropped: byMeaning?.dropped ?? null,
  };
}
