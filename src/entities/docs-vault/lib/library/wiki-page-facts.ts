import { isWikiFurnitureSlug } from '@/shared/lib/library/wiki-page-schema';

import type { VaultDoc } from '../../model/vault-manifest';
import { recordedLocalDay } from '@/shared/lib/library/recorded-date';

const VAULT_WIKI_DIR = 'wiki';

export interface WikiCitation {
  wikiSlug: string;
  sourcePath: string;
  sourceHash: string | null;
  truncated: boolean;
  /** Local day index of the citing page's `compiled_at`, or -1 when it has no believable one. */
  compiledDay: number;
  /** The citing page's index in `LibraryModel.wikiPages`, or -1 when it is not listed there. */
  page: number;
}

export interface LibraryWikiPage {
  slug: string;
  title: string;
  sourcePaths: string[];
  createdBy: string | null;
  compiledAt: string | null;
  summary?: string;
  tags?: string[];
  /** The concept slugs the page says it is about, trimmed NFC as written: null with no `describes:` list, empty when a writer checked and found none; resolved in `map-reach.ts`. Absent reads as null. */
  describes?: readonly string[] | null;
}

export function isWikiPage(doc: VaultDoc): boolean {
  if (!doc.slug.startsWith(`${VAULT_WIKI_DIR}/`)) return false;
  const kind = doc.frontmatter.kind;
  // A `kind:` under `wiki/` is a misfiled ontology node, which must stay visible as a concept.
  return typeof kind !== 'string' || kind.trim() === '';
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim());
  }
  // A scalar citation is the commonest hand-edit; read it as one entry.
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

/** Citation paths in NFC, as the folder walk names files (`walk-vault.ts`): a page written on macOS may hold decomposed Hangul that would never match its file. */
export function readPathArray(value: unknown): string[] {
  return readStringArray(value).map(toNfc);
}

const NON_ASCII = /[^\u0000-\u007f]/;

/** ASCII is already NFC, and nearly every path is ASCII, so most paths skip the ICU call. */
function toNfc(path: string): string {
  return NON_ASCII.test(path) ? path.normalize('NFC') : path;
}

const NO_CONCEPT: readonly string[] = Object.freeze([]);

/** Nearly every list is already trimmed NFC strings, so the frontmatter's own array is kept rather than copied (50,000 pages add no array); a scalar is not a list. */
function readDescribes(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return NO_CONCEPT;
  for (const entry of value) {
    if (typeof entry !== 'string' || entry !== entry.trim() || toNfc(entry) !== entry) {
      // Non-strings are dropped and empty strings kept, as `validateWikiPage` reads the list.
      return value.filter((item): item is string => typeof item === 'string').map((item) => toNfc(item.trim()));
    }
  }
  return value as string[];
}

function readHashMap(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, hash] of Object.entries(value as Record<string, unknown>)) {
    if (typeof hash === 'string' && hash.trim()) {
      out.set(toNfc(key.trim()), hash.trim().toLowerCase());
    }
  }
  return out;
}

export function readCompiledAt(doc: VaultDoc): string | null {
  const value = doc.frontmatter.compiled_at;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isListedWikiPage(doc: VaultDoc): boolean {
  return isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug);
}

export function countWikiPages(docs: readonly VaultDoc[]): number {
  let count = 0;
  for (const doc of docs) if (isListedWikiPage(doc)) count += 1;
  return count;
}

export function selectWikiPages(docs: readonly VaultDoc[]): LibraryWikiPage[] {
  return docs.filter(isListedWikiPage).map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    sourcePaths: readPathArray(doc.frontmatter.sources),
    createdBy:
      typeof doc.frontmatter.created_by === 'string' && doc.frontmatter.created_by.trim()
        ? doc.frontmatter.created_by.trim()
        : null,
    compiledAt: readCompiledAt(doc),
    summary: doc.description || doc.definitionPreview || '',
    tags: doc.tags,
    describes: readDescribes(doc.frontmatter.describes),
  }));
}

export function collectWikiCitations(
  docs: readonly VaultDoc[],
  offsetMinutes: ((epochMs: number) => number) | undefined,
): Map<string, WikiCitation[]> {
  const out = new Map<string, WikiCitation[]>();
  // Pages written in one run share one `compiled_at`, so each distinct string is parsed once.
  const days = new Map<string, number>();
  const dayOf = (value: string | null): number => {
    if (value === null) return -1;
    let day = days.get(value);
    if (day === undefined) {
      day = recordedLocalDay(value, offsetMinutes) ?? -1;
      days.set(value, day);
    }
    return day;
  };
  // Counts listed pages in `selectWikiPages`'s order, so a citation can name its page by index.
  let listed = 0;
  for (const doc of docs) {
    if (!isWikiPage(doc)) continue;
    const page = isWikiFurnitureSlug(doc.slug) ? -1 : listed++;
    const hashes = readHashMap(doc.frontmatter.source_hash);
    const truncated = new Set(readPathArray(doc.frontmatter.sources_truncated));
    const compiledDay = dayOf(readCompiledAt(doc));
    for (const sourcePath of readPathArray(doc.frontmatter.sources)) {
      const citation: WikiCitation = {
        wikiSlug: doc.slug,
        sourcePath,
        sourceHash: hashes.get(sourcePath) ?? null,
        truncated: truncated.has(sourcePath),
        compiledDay,
        page,
      };
      const list = out.get(sourcePath);
      if (list) list.push(citation);
      else out.set(sourcePath, [citation]);
    }
  }
  return out;
}

/** Newest `compiled_at` first, then slug, so hand-written folders still get a stable answer. */
export function newestWikiPage(
  pages: readonly LibraryWikiPage[],
): LibraryWikiPage | null {
  let best: LibraryWikiPage | null = null;
  for (const page of pages) {
    if (best === null) {
      best = page;
      continue;
    }
    const left = page.compiledAt ?? '';
    const right = best.compiledAt ?? '';
    if (left > right || (left === right && page.slug.localeCompare(best.slug) < 0)) best = page;
  }
  return best;
}
