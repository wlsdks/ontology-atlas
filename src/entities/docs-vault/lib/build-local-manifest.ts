import {
  buildExcerpt,
  buildDefinitionPreview,
  extractHeadings,
  extractOutLinksWithContext,
  firstHeading,
  parseFrontmatter,
  type LinkContext,
} from '@/shared/lib/parse-frontmatter';
import { countWhitespaceWords } from '@/shared/lib/count-whitespace-words';
import { meaningFindings } from '@/shared/lib/meaning-findings';
import { extractProjectMeaningEvidencePaths } from '@/shared/lib/project-meaning-evidence';
import {
  nativeVaultFingerprint,
  readTauriVaultTextFile,
  readTauriVaultTextFiles,
  type NativeVaultStamp,
  type NativeVaultTextRead,
} from '@/shared/lib/tauri-vault-fs';
import { walkVault, type WalkEntry } from './walk-vault';
import type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from '../model/types';

/**
 * Frontmatter keys whose refs count as backlinks: the same set as `mcp/src/vault.mjs`
 * NEIGHBOR_KEYS + INLINE_NEIGHBOR_KEYS and `scripts/build-docs-vault.mjs`.
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

/** Resolves a ref by exact slug or unique tail; null for no match or an ambiguous tail. */
function resolveRefToDocSlug(
  ref: string,
  slugSet: ReadonlySet<string>,
  tailToSlug: ReadonlyMap<string, string | null>,
): string | null {
  // NFC on both sides, or identical characters fail to match (the CLI validator's rule).
  const normalized = ref.normalize('NFC').replace(/\.md$/i, '');
  if (slugSet.has(normalized)) return normalized;
  const tail = normalized.split('/').pop() ?? normalized;
  const byTail = tailToSlug.get(tail);
  // `byTail === null` marks an ambiguous tail (2+ docs share it) — don't guess.
  return byTail ?? null;
}

/** `'sources/plan.PDF'` → `'pdf'`; a name with no extension yields `''`. */
function vaultSourceFormat(name: string): string {
  const at = name.lastIndexOf('.');
  return at > 0 ? name.slice(at + 1).toLowerCase() : '';
}

/** One collator for every sort: `localeCompare(x, 'ko')` resolves the locale per comparison. */
const KO_COLLATOR = new Intl.Collator('ko');
const METADATA_STRING_POOL_LIMIT = 1024;

/** `childIndex` finds a child by name; a linear search made a flat folder quadratic. */
function insertIntoTree(
  root: VaultTreeNode,
  slug: string,
  title: string,
  childIndex: Map<VaultTreeNode, Map<string, VaultTreeNode>>,
) {
  const parts = slug.split('/');
  let node = root;
  for (let i = 0; i < parts.length; i += 1) {
    const name = parts[i];
    const isLeaf = i === parts.length - 1;
    if (!node.children) node.children = [];
    let index = childIndex.get(node);
    if (!index) {
      index = new Map();
      childIndex.set(node, index);
    }
    let child = index.get(name);
    if (!child) {
      child = {
        name,
        path: parts.slice(0, i + 1).join('/'),
        type: isLeaf ? 'doc' : 'dir',
      };
      if (isLeaf) {
        child.slug = slug;
        child.title = title;
      }
      node.children.push(child);
      index.set(name, child);
    } else if (isLeaf && !child.slug) {
      child.type = 'doc';
      child.slug = slug;
      child.title = title;
    }
    node = child;
  }
}

function sortTree(node: VaultTreeNode) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return KO_COLLATOR.compare(a.name, b.name);
  });
  for (const c of node.children) sortTree(c);
}

export interface LocalVaultBuild {
  manifest: VaultManifest;
  fileHandles: Map<string, FileSystemFileHandle>;
  /** Asset files such as images, keyed by path relative to the vault root ('img/foo.png'). */
  imageHandles: Map<string, FileSystemFileHandle>;
  /** Raw sources under `sources/`; opened only on a person's explicit request, never by the build. */
  sourceHandles: Map<string, FileSystemFileHandle>;
  /** Sorted `${path}@${mtime}` entries; an equal `computeLocalVaultFingerprint` skips a rebuild. */
  fingerprint: string;
}

function fingerprintFromEntries(
  entries: ReadonlyArray<{ relativePath: string; lastModified: number }>,
): string {
  // NFC here too, or native NFD names would report a change on every focus.
  return entries
    .map((e) => `${e.relativePath.normalize('NFC')}@${e.lastModified}`)
    .sort()
    .join('\n');
}

/** Size travels with mtime so a raw source is listed without opening it over IPC. */
export type VaultStampIndex = Map<string, NativeVaultStamp>;

function stampIndex(entries: readonly NativeVaultStamp[]): VaultStampIndex {
  return new Map(
    entries.map((e) => [e.relativePath.normalize('NFC'), { ...e, relativePath: e.relativePath.normalize('NFC') }] as const),
  );
}

/** The desktop shim's absolute root path, or `null` for a web handle. */
function nativeRootPath(root: FileSystemDirectoryHandle): string | null {
  const rootPath = (root as { rootPath?: unknown }).rootPath;
  return typeof rootPath === 'string' && rootPath ? rootPath : null;
}

/** The native stamp index for this handle, or `null` on the web where there is none. */
async function nativeStampIndex(
  root: FileSystemDirectoryHandle,
): Promise<VaultStampIndex | null> {
  const nativeRoot = nativeRootPath(root);
  if (!nativeRoot) return null;
  try {
    const native = await nativeVaultFingerprint(nativeRoot);
    return native ? stampIndex(native.entries) : null;
  } catch {
    return null;
  }
}

export async function computeLocalVaultFingerprintWithStamps(
  root: FileSystemDirectoryHandle,
): Promise<{ fingerprint: string; nativeStamps: VaultStampIndex | null }> {
  const nativeRoot = nativeRootPath(root);
  if (nativeRoot) {
    const native = await nativeVaultFingerprint(nativeRoot);
    if (native) {
      return {
        fingerprint: fingerprintFromEntries(native.entries),
        nativeStamps: stampIndex(native.entries),
      };
    }
  }
  return { fingerprint: await computeLocalVaultFingerprint(root), nativeStamps: null };
}

export async function computeLocalVaultFingerprint(
  root: FileSystemDirectoryHandle,
): Promise<string> {
  /* In the app one native call returns paths and mtimes; per-file `getFile()` under Tauri
   * transfers every body. The web has no batch API and falls through (`.claude/rules/surfaces.md`). */
  const nativeRoot = nativeRootPath(root);
  if (nativeRoot) {
    const native = await nativeVaultFingerprint(nativeRoot);
    if (native) return fingerprintFromEntries(native.entries);
  }

  const files = (await walkVault(root)).entries;
  const stamps = await mapPooled(
    files,
    VAULT_READ_CONCURRENCY,
    async (entry) => {
      const file = await entry.handle.getFile();
      return {
        relativePath: entry.relativePath,
        lastModified: file.lastModified,
      };
    },
  );
  return fingerprintFromEntries(stamps);
}

/** One built file; `handle` and `lastModified` let an incremental rebuild reuse it unchanged. */
export interface BuiltVaultEntry {
  relativePath: string;
  lastModified: number;
  handle: FileSystemFileHandle;
  kind: 'md' | 'image' | 'source';
  /** Raw sources only — byte length, so the list can state a size without a read. */
  bytes?: number;
  /** Markdown only — the aggregated VaultDoc. */
  doc?: VaultDoc;
  /** Markdown only — out-link context, for rebuilding backlinksDetail. */
  linkContexts?: LinkContext[];
}

function createMetadataStringPool() {
  const strings = new Map<string, string>();
  return (value: string) => {
    const held = strings.get(value);
    if (held !== undefined) return held;
    if (strings.size < METADATA_STRING_POOL_LIMIT) strings.set(value, value);
    return value;
  };
}

/** Pure: one `.md` body to a BuiltVaultEntry. */
function buildMdEntry(
  entry: WalkEntry,
  raw: string,
  lastModified: number,
  internMetadata: (value: string) => string,
): BuiltVaultEntry {
  const slug = entry.relativePath.replace(/\.md$/, '');
  const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
  const headings = extractHeadings(body);
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
  const { slugs: linksOut, contexts: linkContexts } =
    extractOutLinksWithContext(body, slug);
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
    headings,
    excerpt: buildExcerpt(body),
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
    wordCount: countWhitespaceWords(body),
    updatedAt: new Date(lastModified).toISOString(),
    linksOut,
    mtime: lastModified,
  };
  const detachedDoc = structuredClone(doc);
  if (typeof detachedDoc.frontmatter.kind === 'string') detachedDoc.frontmatter.kind = internMetadata(detachedDoc.frontmatter.kind);
  if (typeof detachedDoc.frontmatter.domain === 'string') detachedDoc.frontmatter.domain = internMetadata(detachedDoc.frontmatter.domain);
  if (detachedDoc.frontmatter.slug === detachedDoc.slug) detachedDoc.frontmatter.slug = detachedDoc.slug;
  for (const heading of detachedDoc.headings) {
    heading.text = internMetadata(heading.text);
    heading.slug = internMetadata(heading.slug);
  }
  return {
    relativePath: entry.relativePath,
    lastModified,
    handle: entry.handle,
    kind: 'md',
    /* Fresh copies: a V8 substring of 13+ characters keeps its whole parent alive, so the title,
     * excerpt, display names and link text would pin every file's full text (58 MB at 12k). */
    doc: detachedDoc,
    linkContexts: structuredClone(linkContexts),
  };
}

/** Full and incremental builds share this aggregation so they cannot disagree. */
function aggregateBuild(
  entries: BuiltVaultEntry[],
  rootName: string,
  walkInfo?: { truncated: boolean; prunedDirs: string[]; sourceFileCount?: number },
): LocalVaultBuild {
  const docs: VaultDoc[] = [];
  const sources: VaultSourceFile[] = [];
  const fileHandles = new Map<string, FileSystemFileHandle>();
  const imageHandles = new Map<string, FileSystemFileHandle>();
  const sourceHandles = new Map<string, FileSystemFileHandle>();
  const backlinksDetailMap = new Map<string, VaultBacklinkEntry[]>();
  const tagsMap = new Map<string, Set<string>>();
  const fingerprintStamps: Array<{ relativePath: string; lastModified: number }> = [];

  for (const entry of entries) {
    fingerprintStamps.push({
      relativePath: entry.relativePath,
      lastModified: entry.lastModified,
    });
    if (entry.kind === 'image') {
      imageHandles.set(entry.relativePath, entry.handle);
      continue;
    }
    if (entry.kind === 'source') {
      // A raw source never joins `docs`; its handle only lets a person open the file.
      sourceHandles.set(entry.relativePath, entry.handle);
      sources.push({
        path: entry.relativePath,
        name: entry.relativePath.slice(entry.relativePath.lastIndexOf('/') + 1),
        format: vaultSourceFormat(entry.relativePath),
        bytes: entry.bytes ?? 0,
        mtime: entry.lastModified,
      });
      continue;
    }
    const doc = entry.doc;
    if (!doc) continue;
    fileHandles.set(doc.slug, entry.handle);

    for (const ctx of entry.linkContexts ?? []) {
      if (!backlinksDetailMap.has(ctx.target)) {
        backlinksDetailMap.set(ctx.target, []);
      }
      backlinksDetailMap.get(ctx.target)!.push({
        fromSlug: doc.slug,
        context: ctx.context,
        linkText: ctx.linkText,
      });
    }
    for (const tag of doc.tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, new Set());
      tagsMap.get(tag)!.add(doc.slug);
    }
    docs.push(doc);
  }

  // Frontmatter relation refs add backlinks too, deduped by fromSlug so a body link's richer
  // context wins.
  const slugSet = new Set(docs.map((doc) => doc.slug));
  const tailToSlug = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = doc.slug.split('/').pop() ?? doc.slug;
    // A tail shared by two docs becomes null (ambiguous).
    tailToSlug.set(tail, tailToSlug.has(tail) ? null : doc.slug);
  }
  for (const doc of docs) {
    const seenTargets = new Set<string>();
    for (const ref of frontmatterRefStrings(doc.frontmatter as Record<string, unknown>)) {
      const target = resolveRefToDocSlug(ref, slugSet, tailToSlug);
      // No self-backlinks; dedup repeated refs to the same target within a doc.
      if (!target || target === doc.slug || seenTargets.has(target)) continue;
      seenTargets.add(target);
      if (!backlinksDetailMap.has(target)) backlinksDetailMap.set(target, []);
      backlinksDetailMap.get(target)!.push({
        fromSlug: doc.slug,
        context: `frontmatter · **[${ref}]**`,
        linkText: ref,
      });
    }
  }

  docs.sort((a, b) => KO_COLLATOR.compare(a.slug, b.slug));
  sources.sort((a, b) => KO_COLLATOR.compare(a.path, b.path));

  const tree: VaultTreeNode = { name: rootName, path: '', type: 'dir' };
  const childIndex = new Map<VaultTreeNode, Map<string, VaultTreeNode>>();
  for (const doc of docs) insertIntoTree(tree, doc.slug, doc.title, childIndex);
  sortTree(tree);

  const backlinksDetail: Record<string, VaultBacklinkEntry[]> = {};
  for (const [slug, list] of backlinksDetailMap) {
    const byFrom = new Map<string, VaultBacklinkEntry>();
    for (const entry of list) {
      if (!byFrom.has(entry.fromSlug)) byFrom.set(entry.fromSlug, entry);
    }
    backlinksDetail[slug] = [...byFrom.values()].sort((a, b) =>
      KO_COLLATOR.compare(a.fromSlug, b.fromSlug),
    );
  }
  const tags: Record<string, string[]> = {};
  for (const [tag, set] of tagsMap) {
    tags[tag] = [...set].sort();
  }

  const manifest: VaultManifest = {
    version: '2026-04-23',
    generatedAt: new Date().toISOString(),
    // Walk fields are emitted only when set, so manifests compare equal across builds.
    ...(walkInfo?.truncated ? { walkTruncated: true } : {}),
    ...(walkInfo?.prunedDirs.length ? { prunedDirs: walkInfo.prunedDirs } : {}),
    ...(walkInfo?.sourceFileCount ? { sourceFileCount: walkInfo.sourceFileCount } : {}),
    docs,
    ...(sources.length ? { sources } : {}),
    backlinksDetail,
    tags,
    tree,
  };
  return {
    manifest,
    fileHandles,
    imageHandles,
    sourceHandles,
    fingerprint: fingerprintFromEntries(fingerprintStamps),
  };
}

const VAULT_READ_CONCURRENCY = 64;

/**
 * Maps `items` through `read` with at most `concurrency` in flight, results in input order. The
 * first failure in time rejects the call, and no worker starts another read after it.
 */
async function mapPooled<T, R>(
  items: readonly T[],
  concurrency: number,
  read: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const at = next;
      next += 1;
      try {
        results[at] = await read(items[at]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker),
  );
  return results;
}

const NATIVE_READ_BATCH = 64;
const NATIVE_BATCH_CONCURRENCY = 8;
const PARTIAL_AFTER_MS = 200;
const PARTIAL_INTERVAL_MS = 1000;
const PARTIAL_SPLIT_PUBLISHES = 3;
const PARTIAL_SPLIT_MIN = 400;
const PARTIAL_VAULT_MIN = 400;
const READ_TIER_FOLDERS = ['projects', 'domains', 'capabilities', 'elements'];

interface VaultLoadProgress {
  read: number;
  total: number;
}

export interface VaultBuildObserver {
  onProgress?: (progress: VaultLoadProgress) => void;
  onPartial?: (build: LocalVaultBuild, progress: VaultLoadProgress) => void;
  partialAfterMs?: number;
  partialIntervalMs?: number;
}

interface MarkdownFile {
  text: string;
  lastModified: number;
}

type WalkInfo = { truncated: boolean; prunedDirs: string[]; sourceFileCount?: number };

async function manifestFile(entry: WalkEntry, nativeRoot: string | null): Promise<Pick<File, 'lastModified' | 'text'>> {
  if (entry.kind === 'md' && nativeRoot) {
    const native = await readTauriVaultTextFile(nativeRoot, entry.relativePath);
    if (native) return { lastModified: native.lastModified, text: async () => native.text };
  }
  return entry.handle.getFile();
}

async function readMarkdownFile(entry: WalkEntry, nativeRoot: string | null): Promise<MarkdownFile> {
  const file = await manifestFile(entry, nativeRoot);
  return { text: await file.text(), lastModified: file.lastModified };
}

function createMarkdownReader(nativeRoot: string | null) {
  let batchUnavailable = false;
  const one = (entry: WalkEntry) => readMarkdownFile(entry, nativeRoot);
  const fallbackConcurrency = VAULT_READ_CONCURRENCY / NATIVE_BATCH_CONCURRENCY;
  return async (entries: readonly WalkEntry[]): Promise<MarkdownFile[]> => {
    if (!nativeRoot || batchUnavailable) {
      return mapPooled(entries, fallbackConcurrency, one);
    }
    let answered: NativeVaultTextRead[] | null = null;
    try {
      answered = await readTauriVaultTextFiles(nativeRoot, entries.map((entry) => entry.relativePath));
    } catch {
      batchUnavailable = true;
    }
    const reads = entries.map((entry, at) => ({ entry, read: answered?.[at] }));
    return mapPooled(reads, fallbackConcurrency, async ({ entry, read }) =>
      read && read.relativePath === entry.relativePath && read.text !== null && read.lastModified !== null
        ? { text: read.text, lastModified: read.lastModified }
        : one(entry),
    );
  };
}

function readTier(entry: WalkEntry): number {
  if (entry.kind !== 'md') return READ_TIER_FOLDERS.length + 2;
  const slash = entry.relativePath.indexOf('/');
  if (slash < 0) return 0;
  const folder = READ_TIER_FOLDERS.indexOf(entry.relativePath.slice(0, slash));
  return folder < 0 ? READ_TIER_FOLDERS.length + 1 : folder + 1;
}

function readUnits(files: readonly WalkEntry[], tiers: readonly number[], batched: boolean): number[][] {
  const order = files.map((_, index) => index).sort((a, b) => tiers[a] - tiers[b] || a - b);
  if (!batched) return order.map((index) => [index]);
  const units: number[][] = [];
  let batch: number[] = [];
  for (const index of order) {
    if (batch.length > 0 && (batch.length === NATIVE_READ_BATCH || tiers[batch[0]] !== tiers[index])) {
      units.push(batch);
      batch = [];
    }
    if (files[index].kind === 'md') batch.push(index);
    else units.push([index]);
  }
  if (batch.length > 0) units.push(batch);
  return units;
}

function createPartialPublisher(
  tiers: readonly number[],
  files: readonly WalkEntry[],
  results: ReadonlyArray<BuiltVaultEntry | undefined>,
  publish: (entries: BuiltVaultEntry[]) => void,
  pacing: { afterMs: number; intervalMs: number },
) {
  const tierCount = READ_TIER_FOLDERS.length + 3;
  const size = new Array<number>(tierCount).fill(0);
  const done = new Array<number>(tierCount).fill(0);
  let lastMarkdownTier = -1;
  tiers.forEach((tier, index) => {
    size[tier] += 1;
    if (files[index].kind === 'md') lastMarkdownTier = Math.max(lastMarkdownTier, tier);
  });
  const startedAt = performance.now();
  let lastPublishedAt = Number.NEGATIVE_INFINITY;
  let publishes = 0;
  let published = -1;
  let quarter = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const attempt = () => {
    const now = performance.now();
    const wait = Math.max(startedAt + pacing.afterMs, lastPublishedAt + pacing.intervalMs) - now;
    if (wait > 0) {
      timer ??= setTimeout(() => {
        timer = null;
        attempt();
      }, wait);
      return;
    }
    let complete = published;
    while (complete + 1 < tierCount && done[complete + 1] === size[complete + 1]) complete += 1;
    if (complete >= lastMarkdownTier) return;
    let through = -1;
    if (complete > published) {
      published = complete;
      quarter = 0;
      through = complete;
    }
    const current = published + 1;
    if (publishes < PARTIAL_SPLIT_PUBLISHES && size[current] >= PARTIAL_SPLIT_MIN) {
      const reached = Math.floor((done[current] * 4) / size[current]);
      if (reached > quarter) {
        quarter = reached;
        through = current;
      }
    }
    if (through < 0) return;
    lastPublishedAt = now;
    publishes += 1;
    publish(results.filter((entry, index): entry is BuiltVaultEntry => entry !== undefined && tiers[index] <= through));
  };
  return {
    read(unit: readonly number[]) {
      for (const index of unit) done[tiers[index]] += 1;
      attempt();
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

async function stampedEntry(entry: WalkEntry, stamps: VaultStampIndex | null): Promise<BuiltVaultEntry> {
  const stamp = stamps?.get(entry.relativePath);
  if (entry.kind === 'source') {
    const { lastModified, bytes } = stamp
      ? { lastModified: stamp.lastModified, bytes: stamp.size }
      : await sourceStampFromHandle(entry.handle);
    return { relativePath: entry.relativePath, lastModified, bytes, handle: entry.handle, kind: 'source' };
  }
  const lastModified = stamp ? stamp.lastModified : (await entry.handle.getFile()).lastModified;
  return { relativePath: entry.relativePath, lastModified, handle: entry.handle, kind: 'image' };
}

async function collectEntries(
  root: FileSystemDirectoryHandle,
  walkInfo: WalkInfo,
  concurrency = VAULT_READ_CONCURRENCY,
  observer: VaultBuildObserver = {},
): Promise<BuiltVaultEntry[]> {
  const walked = await walkVault(root);
  walkInfo.truncated = walked.truncated;
  walkInfo.prunedDirs = walked.prunedDirs;
  walkInfo.sourceFileCount = walked.sourceFileCount;
  const files = walked.entries;
  const nativeRoot = nativeRootPath(root);
  const internMetadata = createMetadataStringPool();
  const stamps = files.some((entry) => entry.kind !== 'md')
    ? await nativeStampIndex(root)
    : null;
  const readMarkdown = createMarkdownReader(nativeRoot);
  const tiers = files.map(readTier);
  const results: Array<BuiltVaultEntry | undefined> = new Array(files.length);
  const total = files.filter((entry) => entry.kind === 'md').length;
  let read = 0;
  const { onPartial, onProgress } = observer;
  const publishPartial = onPartial && total >= PARTIAL_VAULT_MIN
    ? createPartialPublisher(
        tiers,
        files,
        results,
        (entries) => onPartial(aggregateBuild(entries, root.name, walkInfo), { read, total }),
        {
          afterMs: observer.partialAfterMs ?? PARTIAL_AFTER_MS,
          intervalMs: observer.partialIntervalMs ?? PARTIAL_INTERVAL_MS,
        },
      )
    : null;
  const batched = nativeRoot !== null && concurrency > 1;
  try {
    await mapPooled(
      readUnits(files, tiers, batched),
      batched ? NATIVE_BATCH_CONCURRENCY : concurrency,
      async (unit) => {
        const markdown = unit.filter((index) => files[index].kind === 'md');
        const texts = markdown.length > 0 ? await readMarkdown(markdown.map((index) => files[index])) : [];
        markdown.forEach((index, at) => {
          results[index] = buildMdEntry(files[index], texts[at].text, texts[at].lastModified, internMetadata);
        });
        for (const index of unit) {
          if (files[index].kind !== 'md') results[index] = await stampedEntry(files[index], stamps);
        }
        read += markdown.length;
        onProgress?.({ read, total });
        publishPartial?.read(unit);
      },
    );
  } finally {
    publishPartial?.stop();
  }
  return results as BuiltVaultEntry[];
}

async function sourceStampFromHandle(
  handle: FileSystemFileHandle,
): Promise<{ lastModified: number; bytes: number }> {
  const file = await handle.getFile();
  return { lastModified: file.lastModified, bytes: file.size };
}

export async function buildLocalManifestWithEntries(
  root: FileSystemDirectoryHandle,
  observer?: VaultBuildObserver,
): Promise<{ build: LocalVaultBuild; entries: BuiltVaultEntry[] }> {
  const walkInfo: WalkInfo = { truncated: false, prunedDirs: [], sourceFileCount: 0 };
  const entries = await collectEntries(root, walkInfo, VAULT_READ_CONCURRENCY, observer);
  return { build: aggregateBuild(entries, root.name, walkInfo), entries };
}

export async function buildLocalManifest(
  root: FileSystemDirectoryHandle,
  readConcurrency = VAULT_READ_CONCURRENCY,
): Promise<LocalVaultBuild> {
  const walkInfo: WalkInfo = { truncated: false, prunedDirs: [], sourceFileCount: 0 };
  const entries = await collectEntries(root, walkInfo, readConcurrency);
  return aggregateBuild(entries, root.name, walkInfo);
}

export async function rebuildLocalManifestIncremental(
  root: FileSystemDirectoryHandle,
  previous: BuiltVaultEntry[],
  providedStamps?: VaultStampIndex | null,
  readConcurrency = VAULT_READ_CONCURRENCY,
): Promise<{ build: LocalVaultBuild; entries: BuiltVaultEntry[] }> {
  const walked = await walkVault(root);
  const files = walked.entries;
  const internMetadata = createMetadataStringPool();
  const walkInfo = {
    truncated: walked.truncated,
    prunedDirs: walked.prunedDirs,
    sourceFileCount: walked.sourceFileCount,
  };
  const nativeRoot = nativeRootPath(root);
  const prevByPath = new Map(previous.map((e) => [e.relativePath, e] as const));
  const nativeStamps: VaultStampIndex | null = providedStamps ?? (await nativeStampIndex(root));
  const reused = (entry: WalkEntry, lastModified: number): BuiltVaultEntry | null => {
    const prev = prevByPath.get(entry.relativePath);
    return prev && prev.kind === entry.kind && prev.lastModified === lastModified
      ? { ...prev, handle: entry.handle }
      : null;
  };
  const known: Array<BuiltVaultEntry | null> = files.map((entry) => {
    const nativeStamp = nativeStamps?.get(entry.relativePath);
    return nativeStamp === undefined ? null : reused(entry, nativeStamp.lastModified);
  });
  const readMarkdown = createMarkdownReader(nativeRoot);
  const pending = nativeRoot
    ? files.flatMap((entry, index) => (known[index] === null && entry.kind === 'md' ? [index] : []))
    : [];
  const batches: number[][] = [];
  for (let at = 0; at < pending.length; at += NATIVE_READ_BATCH) {
    batches.push(pending.slice(at, at + NATIVE_READ_BATCH));
  }
  await mapPooled(batches, NATIVE_BATCH_CONCURRENCY, async (batch) => {
    const texts = await readMarkdown(batch.map((index) => files[index]));
    batch.forEach((index, at) => {
      const { text, lastModified } = texts[at];
      known[index] = reused(files[index], lastModified) ?? buildMdEntry(files[index], text, lastModified, internMetadata);
    });
  });
  const readOne = async (index: number): Promise<BuiltVaultEntry> => {
    const entry = files[index];
    const settled = known[index];
    if (settled) return settled;
    if (entry.kind === 'source' || (entry.kind === 'image' && nativeStamps?.has(entry.relativePath))) {
      return stampedEntry(entry, nativeStamps);
    }
    const file = await manifestFile(entry, nativeRoot);
    const unchanged = reused(entry, file.lastModified);
    if (unchanged) return unchanged;
    if (entry.kind === 'image') {
      return { relativePath: entry.relativePath, lastModified: file.lastModified, handle: entry.handle, kind: 'image' };
    }
    return buildMdEntry(entry, await file.text(), file.lastModified, internMetadata);
  };
  const entries = await mapPooled(files.map((_, index) => index), readConcurrency, readOne);
  return { build: aggregateBuild(entries, root.name, walkInfo), entries };
}
