import { compareCollated } from './collated-order';
import {
  backlinkTargets,
  buildMdEntry,
  createMetadataStringPool,
  refResolver,
  slugTail,
  type BuiltVaultEntry,
} from './md-entry';
import {
  createPartialPublisher,
  PARTIAL_AFTER_MS,
  PARTIAL_INTERVAL_MS,
  PARTIAL_VAULT_MIN,
  readTier,
  readUnits,
} from './partial-publisher';
import {
  createMarkdownReader,
  manifestFile,
  mapPooled,
  NATIVE_BATCH_CONCURRENCY,
  NATIVE_READ_BATCH,
  VAULT_READ_CONCURRENCY,
} from './read-vault-files';
import { APP_ENTRY_ROWS, createRowSource } from './vault-entry-rows';
import {
  addStamp,
  fingerprintFromEntries,
  fingerprintText,
  type FingerprintSum,
} from './vault-fingerprint';
import { vaultSourceRow } from './vault-source-row';
import { insertIntoTree, sortTree } from './vault-tree';
import {
  nativeVaultFingerprint,
  type NativeVaultStamp,
} from '@/shared/lib/vault-folder/tauri-vault-fs';
import { walkVault, type WalkEntry } from './walk-vault';
import type {
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from '../../model/types';

export interface LocalVaultBuild {
  manifest: VaultManifest;
  fileHandles: Map<string, FileSystemFileHandle>;
  imageHandles: Map<string, FileSystemFileHandle>;
  /** Raw sources under `sources/`; opened only on a person's explicit request, never by the build. */
  sourceHandles: Map<string, FileSystemFileHandle>;
  /** Multiset hash of `${path}@${mtime}` stamps; an equal `computeLocalVaultFingerprint` skips a rebuild. */
  fingerprint: string;
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
      sources.push(vaultSourceRow(entry));
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

type WalkInfo = { truncated: boolean; prunedDirs: string[]; sourceFileCount?: number };

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
