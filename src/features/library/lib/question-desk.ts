import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import type { SourceUnit } from '@/shared/lib/source-passage';
import type { VaultDoc } from '@/entities/docs-vault';

export interface DeskCitation { path: string; anchor: string }
export interface DeskClaim {
  pageSlug: string;
  pageTitle: string;
  text: string;
  citations: DeskCitation[];
  score: number;
  recordedHashes: Record<string, string>;
}
export interface DeskSourceHit { path: string; anchor: string; text: string; score: number }

const STOP = new Set('a an and are as at be by can did do does for from how in is it of on or the this to was were what when where which who why with about'.split(' '));
const CITATION = /\[\[src:(sources\/[^\]#]+)#([^\]]+)\]\]/g;
const MAX_FILES = 200;
const MAX_BYTES = 20 * 1024 * 1024;

function deskPages(docs: readonly VaultDoc[]): VaultDoc[] {
  return docs.filter((doc) => doc.slug.startsWith('wiki/') && !doc.slug.split('/').some((part) => part.startsWith('_')) && !doc.frontmatter.kind);
}

export function countDeskReadablePages(docs: readonly VaultDoc[], rawBySlug: ReadonlyMap<string, string>): number {
  return deskPages(docs).filter((doc) => rawBySlug.has(doc.slug)).length;
}

/** A large early file cannot hide later small originals from this bounded local search. */
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

/** Lexical matches are discovery leads, never an answer or a truth judgment. */
export function questionTerms(question: string): string[] {
  return [...new Set((question.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((term) => term.length > 1 && !STOP.has(term)))];
}

function questionScore(text: string, terms: readonly string[]): number {
  // Addresses identify evidence; their file names are not words asserted by the passage.
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
    const parsed = parseFrontmatter(raw);
    const hashes = recordedHashes(parsed.frontmatter);
    let section = '';
    for (const line of parsed.body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) section = trimmed.slice(3).toLowerCase();
      if (section !== 'facts' && section !== 'decisions') continue;
      if (!/^[-*] /.test(trimmed)) continue;
      const text = trimmed.slice(2).trim();
      if (text.endsWith('?')) continue;
      const score = questionScore(text, terms);
      if (!score) continue;
      const citations = [...text.matchAll(CITATION)].map((match) => ({ path: match[1]!, anchor: match[2]! }));
      claims.push({ pageSlug: doc.slug, pageTitle: doc.title, text, citations, score, recordedHashes: hashes });
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

export function jevClaimEligibility(claim: DeskClaim, citation: DeskCitation, passage: { state: string; cited: readonly SourceUnit[] }, measuredHash: string | null, fileChanged: boolean): 'ready' | 'missing' | 'stale' | 'unmeasured' {
  if (passage.state !== 'resolved' || passage.cited.length === 0) return 'missing';
  if (fileChanged) return 'stale';
  const recorded = claim.recordedHashes[citation.path];
  if (!recorded || !measuredHash) return 'unmeasured';
  return recorded.toLowerCase() === measuredHash.toLowerCase() ? 'ready' : 'stale';
}
