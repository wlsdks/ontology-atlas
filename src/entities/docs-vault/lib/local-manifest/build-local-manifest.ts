import {
  backlinkTargets,
  buildMdEntry,
  createMetadataStringPool,
  mdEntryRowValue,
  refResolver,
  slugTail,
  storedMdEntry,
  type BuiltVaultEntry,
} from './md-entry';
import {
  nativeVaultFingerprint,
  readTauriVaultTextFile,
  readTauriVaultTextFiles,
  type NativeVaultStamp,
  type NativeVaultTextRead,
} from '@/shared/lib/vault-folder/tauri-vault-fs';
import {
  getVaultRows,
  isFramedVaultRowPath,
  putVaultRows,
  vaultRowsAvailable,
  type VaultRowWrite,
} from '@/shared/lib/vault-folder/tauri-vault-index-rows';
import { walkVault, type WalkEntry } from './walk-vault';
import type {
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from '../../model/types';

/** `'sources/plan.PDF'` → `'pdf'`; a name with no extension yields `''`. */
export function vaultSourceFormat(name: string): string {
  const at = name.lastIndexOf('.');
  return at > 0 ? name.slice(at + 1).toLowerCase() : '';
}

/** One collator for every sort: `localeCompare(x, 'ko')` resolves the locale per comparison. */
const KO_COLLATOR = new Intl.Collator('ko');

/**
 * Korean collation, then code units where the collator calls two names equal, so the order is
 * total and does not depend on the order a walk happened to list files in.
 */
export function compareCollated(a: string, b: string): number {
  return KO_COLLATOR.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

export function compareTreeNodes(a: VaultTreeNode, b: VaultTreeNode): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return compareCollated(a.name, b.name);
}

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
  node.children.sort(compareTreeNodes);
  for (const c of node.children) sortTree(c);
}

export interface LocalVaultBuild {
  manifest: VaultManifest;
  fileHandles: Map<string, FileSystemFileHandle>;
  imageHandles: Map<string, FileSystemFileHandle>;
  /** Raw sources under `sources/`; opened only on a person's explicit request, never by the build. */
  sourceHandles: Map<string, FileSystemFileHandle>;
  /** Multiset hash of `${path}@${mtime}` stamps; an equal `computeLocalVaultFingerprint` skips a rebuild. */
  fingerprint: string;
}

export interface FingerprintSum {
  count: number;
  a: number;
  b: number;
}

/** Murmur3's finalizer: spreads every input bit over the word. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function addStamp(sum: FingerprintSum, relativePath: string, lastModified: number, sign: 1 | -1): void {
  // NFC here too, or native NFD names would report a change on every focus.
  const stamp = `${relativePath.normalize('NFC')}@${lastModified}`;
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let at = 0; at < stamp.length; at += 1) {
    const code = stamp.charCodeAt(at);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x5bd1e995);
    b ^= b >>> 15;
  }
  sum.count += sign;
  sum.a = (sum.a + sign * fmix32(a)) >>> 0;
  sum.b = (sum.b + sign * fmix32(b ^ stamp.length)) >>> 0;
}

export function fingerprintText(sum: FingerprintSum): string {
  return sum.count === 0 ? '' : `${sum.count}.${sum.a.toString(16)}.${sum.b.toString(16)}`;
}

export function parseFingerprint(text: string): FingerprintSum | null {
  if (text === '') return { count: 0, a: 0, b: 0 };
  const [count, a, b] = text.split('.');
  const sum = { count: Number(count), a: parseInt(a, 16), b: parseInt(b, 16) };
  return Number.isInteger(sum.count) && Number.isInteger(sum.a) && Number.isInteger(sum.b) ? sum : null;
}

/**
 * Order-free, so neither a build nor a path delta sorts 50,000 stamps: a delta adds and removes
 * only the stamps it touched. Two different stamp sets collide with probability about 2^-64,
 * and the next change or focus check repairs a collision.
 */
function fingerprintFromEntries(
  entries: ReadonlyArray<{ relativePath: string; lastModified: number }>,
): string {
  const sum: FingerprintSum = { count: 0, a: 0, b: 0 };
  for (const entry of entries) addStamp(sum, entry.relativePath, entry.lastModified, 1);
  return fingerprintText(sum);
}

/** Size travels with mtime so a raw source is listed without opening it over IPC. */
export type VaultStampIndex = Map<string, NativeVaultStamp>;

function stampIndex(entries: readonly NativeVaultStamp[]): VaultStampIndex {
  return new Map(
    entries.map((e) => [e.relativePath.normalize('NFC'), { ...e, relativePath: e.relativePath.normalize('NFC') }] as const),
  );
}

export function nativeRootPath(root: FileSystemDirectoryHandle): string | null {
  const rootPath = (root as { rootPath?: unknown }).rootPath;
  return typeof rootPath === 'string' && rootPath ? rootPath : null;
}

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
  const backlinkSourcesMap = new Map<string, string[]>();
  const tagsMap = new Map<string, Set<string>>();
  const stamps: FingerprintSum = { count: 0, a: 0, b: 0 };

  for (const entry of entries) {
    addStamp(stamps, entry.relativePath, entry.lastModified, 1);
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
    for (const tag of doc.tags) {
      if (!tagsMap.has(tag)) tagsMap.set(tag, new Set());
      tagsMap.get(tag)!.add(doc.slug);
    }
    docs.push(doc);
  }

  const slugSet = new Set(docs.map((doc) => doc.slug));
  const tailToSlug = new Map<string, string | null>();
  for (const doc of docs) {
    const tail = slugTail(doc.slug);
    tailToSlug.set(tail, tailToSlug.has(tail) ? null : doc.slug);
  }
  const resolve = refResolver((slug) => slugSet.has(slug), (tail) => tailToSlug.get(tail) ?? null);
  for (const entry of entries) {
    if (!entry.doc) continue;
    for (const target of backlinkTargets(entry.doc, resolve)) {
      const list = backlinkSourcesMap.get(target);
      if (list) list.push(entry.doc.slug);
      else backlinkSourcesMap.set(target, [entry.doc.slug]);
    }
  }

  docs.sort((a, b) => compareCollated(a.slug, b.slug));
  sources.sort((a, b) => compareCollated(a.path, b.path));

  const tree: VaultTreeNode = { name: rootName, path: '', type: 'dir' };
  const childIndex = new Map<VaultTreeNode, Map<string, VaultTreeNode>>();
  for (const doc of docs) insertIntoTree(tree, doc.slug, doc.title, childIndex);
  sortTree(tree);

  const backlinkSources: Record<string, string[]> = {};
  for (const [slug, list] of backlinkSourcesMap) backlinkSources[slug] = list.sort(compareCollated);
  const tags: Record<string, string[]> = {};
  for (const [tag, set] of tagsMap) {
    tags[tag] = [...set].sort();
  }

  const manifest: VaultManifest = {
    version: '2026-04-23',
    generatedAt: new Date().toISOString(),
    // Walk fields are emitted only when set, so manifests compare equal across builds.
    ...(walkInfo?.truncated ? { walkTruncated: true } : {}),
    // Sorted, so the list depends on what is pruned, not on the order a folder was listed in.
    ...(walkInfo?.prunedDirs.length ? { prunedDirs: [...walkInfo.prunedDirs].sort() } : {}),
    ...(walkInfo?.sourceFileCount ? { sourceFileCount: walkInfo.sourceFileCount } : {}),
    docs,
    ...(sources.length ? { sources } : {}),
    backlinkSources,
    tags,
    tree,
  };
  return {
    manifest,
    fileHandles,
    imageHandles,
    sourceHandles,
    fingerprint: fingerprintText(stamps),
  };
}

const VAULT_READ_CONCURRENCY = 64;

/** At most `concurrency` reads in flight, results in input order; the first failure in time rejects and no worker starts another read after it. */
export async function mapPooled<T, R>(
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

export const NATIVE_READ_BATCH = 64;
export const NATIVE_BATCH_CONCURRENCY = 8;
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

export function createMarkdownReader(nativeRoot: string | null) {
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

/**
 * The derived index's name for what `buildMdEntry` computes: a hash of `md-entry.ts` and everything
 * it loads, made at build time (scripts/lib/row-producer.mjs), so a build whose derive code changed
 * never reads an older build's rows. A build without one (the dev server) keeps no rows.
 */
const ROW_PRODUCER = process.env.NEXT_PUBLIC_ROW_PRODUCER;
export const APP_ENTRY_ROWS = ROW_PRODUCER ? `app-entry/${ROW_PRODUCER}` : null;
/** Paths per lookup: the node folders come back first, so the first partial paint stays early. */
const ROWS_LOOKUP_CHUNK = 2048;
const ROWS_LOOKUP_AHEAD = 2;
const ROWS_WRITE_BATCH = 500;

let rowWrites: Promise<void> = Promise.resolve();

export function vaultRowWritesSettled(): Promise<void> {
  return rowWrites;
}

interface RowSource {
  /** Entries from stored rows, aligned with `indices`; `undefined` where the file must be read. */
  take(indices: readonly number[]): Promise<Array<BuiltVaultEntry | undefined>>;
  keep(index: number, entry: BuiltVaultEntry): void;
  finish(walkComplete: boolean): void;
}

/**
 * Looks up stored rows in read order, a chunk at a time and a little ahead of the reads, and
 * writes new rows behind the build in batches. Any failure only means more files are read.
 */
function createRowSource(
  namespace: string,
  rootPath: string,
  files: readonly WalkEntry[],
  tiers: readonly number[],
  internMetadata: (value: string) => string,
): RowSource | null {
  if (!vaultRowsAvailable()) return null;
  const order = files
    .map((_, index) => index)
    .filter((index) => files[index].kind === 'md' && isFramedVaultRowPath(files[index].relativePath))
    .sort((a, b) => tiers[a] - tiers[b] || a - b);
  const chunks: number[][] = [];
  for (let at = 0; at < order.length; at += ROWS_LOOKUP_CHUNK) chunks.push(order.slice(at, at + ROWS_LOOKUP_CHUNK));
  const chunkOf = new Int32Array(files.length).fill(-1);
  chunks.forEach((chunk, number) => {
    for (const index of chunk) chunkOf[index] = number;
  });
  const lookups: Array<Promise<void> | undefined> = new Array(chunks.length);
  const fromRows: Array<BuiltVaultEntry | undefined> = new Array(files.length);
  const tokens = new Map<number, string>();
  let stored = 0;
  let found = 0;
  let otherVersions = 0;
  let answeredAll = true;
  const lookUp = (number: number): Promise<void> => {
    const pending = lookups[number];
    if (pending) return pending;
    const chunk = chunks[number];
    const started = getVaultRows(rootPath, namespace, chunk.map((index) => files[index].relativePath)).then(
      (answer) => {
        if (!answer) {
          answeredAll = false;
          return;
        }
        for (const [at, value] of answer.hits) {
          const index = chunk[at];
          if (index !== undefined) fromRows[index] = storedMdEntry(files[index], value, internMetadata);
        }
        for (const [at, token] of answer.misses) {
          const index = chunk[at];
          if (index !== undefined && token) tokens.set(index, token);
        }
        stored = Math.max(stored, answer.stored);
        found += answer.found;
        otherVersions = Math.max(otherVersions, answer.otherVersions);
      },
      () => {
        answeredAll = false;
      },
    );
    lookups[number] = started;
    return started;
  };
  let batch: VaultRowWrite[] = [];
  const write = (rows: VaultRowWrite[], retain: readonly string[] | null) => {
    rowWrites = rowWrites.then(() => putVaultRows(rootPath, namespace, rows, retain)).catch(() => undefined);
  };
  return {
    async take(indices) {
      const numbers = new Set<number>();
      for (const index of indices) if (chunkOf[index] >= 0) numbers.add(chunkOf[index]);
      for (const number of numbers) {
        for (let ahead = 1; ahead <= ROWS_LOOKUP_AHEAD && number + ahead < chunks.length; ahead += 1) {
          void lookUp(number + ahead);
        }
      }
      await Promise.all([...numbers].map(lookUp));
      return indices.map((index) => {
        const entry = fromRows[index];
        fromRows[index] = undefined;
        return entry;
      });
    },
    keep(index, entry) {
      const token = tokens.get(index);
      const value = token ? mdEntryRowValue(entry) : null;
      if (!token || value === null) return;
      tokens.delete(index);
      batch.push({ path: entry.relativePath, token, lastModified: entry.lastModified, value });
      if (batch.length >= ROWS_WRITE_BATCH) {
        write(batch, null);
        batch = [];
      }
    },
    finish(walkComplete) {
      const prune = walkComplete && answeredAll && (otherVersions > 0 || stored > found);
      if (batch.length > 0 || prune) write(batch, prune ? order.map((index) => files[index].relativePath) : null);
      batch = [];
    },
  };
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
  const rows = nativeRoot && APP_ENTRY_ROWS ? createRowSource(APP_ENTRY_ROWS, nativeRoot, files, tiers, internMetadata) : null;
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
        const stored = rows && markdown.length > 0 ? await rows.take(markdown) : [];
        const unread = markdown.filter((index, at) => {
          results[index] = stored[at];
          return stored[at] === undefined;
        });
        const texts = unread.length > 0 ? await readMarkdown(unread.map((index) => files[index])) : [];
        unread.forEach((index, at) => {
          const built = buildMdEntry(files[index], texts[at].text, texts[at].lastModified, internMetadata);
          results[index] = built;
          rows?.keep(index, built);
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
  rows?.finish(!walked.truncated);
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
