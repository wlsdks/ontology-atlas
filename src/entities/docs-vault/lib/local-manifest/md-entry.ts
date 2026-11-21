import {
  buildDefinitionPreview,
  extractOutLinkTargets,
  firstHeading,
  parseFrontmatter,
} from '@/shared/lib/vault-document/parse-frontmatter';
import { citesReadLines } from '@/shared/lib/vault-document/line-cite';
import { meaningFindings } from '@/shared/lib/vault-document/meaning-findings';
import { extractProjectMeaningEvidencePaths } from '@/shared/lib/project-source/project-meaning-evidence';
import type { WalkEntry } from './walk-vault';
import type { VaultDoc } from '../../model/types';

/**
 * Frontmatter keys whose refs count as backlinks: the same set as `mcp/src/vault/`
 * NEIGHBOR_KEYS + INLINE_NEIGHBOR_KEYS and `scripts/docs-vault/build-docs-vault.mjs`.
 */
const RELATION_REF_ARRAY_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
] as const;
const RELATION_REF_STRING_KEYS = ['domain'] as const;

function frontmatterRefStrings(frontmatter: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of RELATION_REF_ARRAY_KEYS) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string' && item.trim()) out.push(item.trim());
    }
    // Arrays only: the graph derivation and the MCP reader ignore a scalar, so counting it
    // would report a referrer the map never draws; the parser diagnoses it instead.
  }
  for (const key of RELATION_REF_STRING_KEYS) {
    const value = frontmatter[key];
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }
  return out;
}

/** `ref` as a slug: NFC on both sides, or identical characters fail to match (the CLI validator's rule). */
function refSlug(ref: string): string {
  return ref.normalize('NFC').replace(/\.md$/i, '');
}

export function slugTail(slug: string): string {
  return slug.split('/').pop() ?? slug;
}

export type RefResolver = (ref: string) => string | null;

/**
 * Whether one of the document's relation refs ends in a tail from `tails`: the documents whose
 * frontmatter backlinks a created or removed slug can re-resolve. One set lookup per ref, so a
 * burst of k moved tails costs O(refs), not O(refs · k).
 */
export function refersToTail(doc: VaultDoc, tails: ReadonlySet<string>): boolean {
  for (const ref of frontmatterRefStrings(doc.frontmatter as Record<string, unknown>)) {
    if (tails.has(slugTail(refSlug(ref)))) return true;
  }
  return false;
}

export function refResolver(
  hasSlug: (slug: string) => boolean,
  slugForTail: (tail: string) => string | null,
): RefResolver {
  return (ref) => {
    const normalized = refSlug(ref);
    return hasSlug(normalized) ? normalized : slugForTail(slugTail(normalized));
  };
}

/**
 * The slugs a document backlinks, O(links + refs): its body link targets, then its resolved
 * frontmatter relation refs, never itself. Full builds and path deltas both aggregate through
 * this, so they cannot disagree.
 */
export function backlinkTargets(doc: VaultDoc, resolve: RefResolver): Set<string> {
  const targets = new Set(doc.linksOut);
  for (const ref of frontmatterRefStrings(doc.frontmatter as Record<string, unknown>)) {
    const target = resolve(ref);
    if (target && target !== doc.slug) targets.add(target);
  }
  return targets;
}

export interface BuiltVaultEntry {
  relativePath: string;
  lastModified: number;
  handle: FileSystemFileHandle;
  kind: 'md' | 'image' | 'source';
  bytes?: number;
  doc?: VaultDoc;
}

const METADATA_STRING_POOL_LIMIT = 1024;

export function createMetadataStringPool() {
  const strings = new Map<string, string>();
  return (value: string) => {
    const held = strings.get(value);
    if (held !== undefined) return held;
    if (strings.size < METADATA_STRING_POOL_LIMIT) strings.set(value, value);
    return value;
  };
}

/** Shares the strings many documents repeat; a document from a stored row gets the same. */
function internDoc(doc: VaultDoc, internMetadata: (value: string) => string): VaultDoc {
  if (typeof doc.frontmatter.kind === 'string') doc.frontmatter.kind = internMetadata(doc.frontmatter.kind);
  if (typeof doc.frontmatter.domain === 'string') doc.frontmatter.domain = internMetadata(doc.frontmatter.domain);
  if (doc.frontmatter.slug === doc.slug) doc.frontmatter.slug = doc.slug;
  return doc;
}

export function buildMdEntry(
  entry: WalkEntry,
  raw: string,
  lastModified: number,
  internMetadata: (value: string) => string,
): BuiltVaultEntry {
  const slug = entry.relativePath.replace(/\.md$/, '');
  const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
  const title =
    (typeof frontmatter.title === 'string' && frontmatter.title) ||
    firstHeading(body) ||
    slug.split('/').pop() ||
    slug;
  const description =
    typeof frontmatter.description === 'string'
      ? frontmatter.description
      : undefined;
  const tags = Array.isArray(frontmatter.tags)
    ? (frontmatter.tags as unknown[]).filter(
        (t): t is string => typeof t === 'string',
      )
    : typeof frontmatter.tags === 'string'
      ? frontmatter.tags.split(/\s+/).filter(Boolean)
      : [];
  const linksOut = extractOutLinkTargets(body, slug);
  const kind =
    typeof frontmatter.kind === 'string' ? frontmatter.kind.trim() : '';

  const doc: VaultDoc = {
    slug,
    path: entry.relativePath,
    title,
    description,
    tags,
    frontmatter,
    ...(diagnostics && diagnostics.length > 0 ? { diagnostics } : {}),
    definitionPreview: buildDefinitionPreview(body, frontmatter),
    ...(frontmatter.kind === 'project'
      ? { meaningEvidencePaths: extractProjectMeaningEvidencePaths(body) }
      : {}),
    ...(kind
      ? {
          meaningFindings: meaningFindings({ kind, slug, title, body }).map(
            (finding) => finding.code,
          ),
        }
      : {}),
    ...(kind === 'capability' ? { citesReadLines: citesReadLines(body) } : {}),
    updatedAt: new Date(lastModified).toISOString(),
    linksOut,
    mtime: lastModified,
  };
  const detachedDoc = internDoc(structuredClone(doc), internMetadata);
  return {
    relativePath: entry.relativePath,
    lastModified,
    handle: entry.handle,
    kind: 'md',
    /* A fresh copy: a V8 substring of 13+ characters keeps its whole parent alive, so the title,
     * display names and link targets would pin every file's full text (58 MB at 12k). */
    doc: detachedDoc,
  };
}

/** A JSON round trip turns a non-finite number into null and -0 into 0; such a document is not kept. */
function survivesJson(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
  if (Array.isArray(value)) return value.every((item) => item !== undefined && survivesJson(item));
  if (value !== null && typeof value === 'object') return Object.values(value).every(survivesJson);
  return true;
}

/** A detail field or row key only an older producer wrote; such a row is never read. */
const NOT_SPINE_DOC_KEYS = ['headings', 'excerpt', 'wordCount'];

export function storedMdEntry(
  entry: WalkEntry,
  value: unknown,
  internMetadata: (value: string) => string,
): BuiltVaultEntry | undefined {
  if (value === null || typeof value !== 'object' || Object.keys(value).length !== 1) return undefined;
  const doc = (value as { doc?: VaultDoc }).doc;
  if (
    !doc ||
    doc.path !== entry.relativePath ||
    typeof doc.mtime !== 'number' ||
    !Array.isArray(doc.linksOut) ||
    NOT_SPINE_DOC_KEYS.some((key) => key in doc)
  ) {
    return undefined;
  }
  return {
    relativePath: entry.relativePath,
    lastModified: doc.mtime,
    handle: entry.handle,
    kind: 'md',
    doc: internDoc(doc, internMetadata),
  };
}

/** The stored row of a built Markdown entry, `{ doc }`, or null when a JSON round trip would change it. */
export function mdEntryRowValue(entry: BuiltVaultEntry): string | null {
  if (!entry.doc || !survivesJson(entry.doc.frontmatter)) return null;
  return JSON.stringify({ doc: entry.doc });
}
