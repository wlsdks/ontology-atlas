import {
  listTauriVaultStamped,
  tauriVaultFileHandleAt,
  type StampedVaultEntry,
} from '@/shared/lib/vault-folder/tauri-vault-fs';
import type { VaultPathChange } from '@/shared/lib/vault-folder/vault-change-batch';
import { pendingSourceCopyPaths } from '../library/source-copy-publication';
import type { WalkEntry } from './walk-vault';
import { nativeRootPath, type LocalVaultBuild } from './build-local-manifest';
import { compareCollated } from './collated-order';
import {
  backlinkTargets,
  buildMdEntry,
  createMetadataStringPool,
  refersToTail,
  slugTail,
  type BuiltVaultEntry,
  type RefResolver,
} from './md-entry';
import { patchSorted } from './path-delta/patch-sorted';
import {
  NeedsRescan,
  planChanges,
  type ChangePlan,
  type ListDir,
  type Upsert,
} from './path-delta/plan-vault-changes';
import { TreeEditor } from './path-delta/tree-editor';
import {
  deltaStates,
  indexEntry,
  mdSlug,
  resolverOf,
  takeState,
  type DeltaState,
} from './path-delta/vault-delta-state';
import { nameOf } from './vault-paths';
import {
  createMarkdownReader,
  mapPooled,
  NATIVE_BATCH_CONCURRENCY,
  NATIVE_READ_BATCH,
} from './read-vault-files';
import { addStamp, fingerprintText, parseFingerprint } from './vault-fingerprint';
import { vaultSourceRow } from './vault-source-row';
import type { VaultDoc, VaultManifest, VaultSourceFile } from '../../model/types';

export interface LocalVaultSnapshot {
  build: LocalVaultBuild;
  entries: BuiltVaultEntry[];
}

export type VaultChangeResult =
  /** `sidecarsTouched`: a path under `.ontology-atlas/` or an agent config changed too. */
  | { kind: 'applied'; snapshot: LocalVaultSnapshot; sidecarsTouched: boolean }
  | { kind: 'unchanged'; sidecarsTouched: boolean }
  | { kind: 'rescan' };

const RESCAN: VaultChangeResult = { kind: 'rescan' };

const compareDocs = (a: VaultDoc, b: VaultDoc) => compareCollated(a.slug, b.slug);
const compareSources = (a: VaultSourceFile, b: VaultSourceFile) => compareCollated(a.path, b.path);
const compareCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type DirLookup = (dir: string) => Promise<FileSystemDirectoryHandle>;

function directoryLookup(root: FileSystemDirectoryHandle): DirLookup {
  const cache = new Map<string, Promise<FileSystemDirectoryHandle>>([['', Promise.resolve(root)]]);
  const lookup: DirLookup = (dir) => {
    const held = cache.get(dir);
    if (held) return held;
    const at = dir.lastIndexOf('/');
    const next = lookup(at < 0 ? '' : dir.slice(0, at)).then((parent) => parent.getDirectoryHandle(nameOf(dir)));
    cache.set(dir, next);
    return next;
  };
  return lookup;
}

async function fileHandle(root: FileSystemDirectoryHandle, lookup: DirLookup, path: string): Promise<FileSystemFileHandle> {
  const native = tauriVaultFileHandleAt(root, path);
  if (native) return native;
  const at = path.lastIndexOf('/');
  const parent = await lookup(at < 0 ? '' : path.slice(0, at));
  return parent.getFileHandle(nameOf(path));
}

/** The app answers natively without reading a byte (`getFile()` would transfer the whole body); the web's `File` is a lazy reference, so its stamp reads nothing either. */
function directoryLister(root: FileSystemDirectoryHandle, lookup: DirLookup): ListDir {
  const rootPath = nativeRootPath(root);
  return async (dir) => {
    const native = rootPath ? await listTauriVaultStamped(rootPath, dir) : null;
    if (native) return native;
    const out: StampedVaultEntry[] = [];
    for await (const [name, handle] of (await lookup(dir)).entries()) {
      if (handle.kind === 'directory') {
        out.push({ name, kind: 'directory' });
      } else {
        const file = await (handle as FileSystemFileHandle).getFile();
        out.push({ name, kind: 'file', lastModified: file.lastModified, size: file.size });
      }
    }
    return out;
  };
}

/**
 * Reads what the plan upserts: Markdown bodies in native batches; for an image or a raw source
 * only the stamp the watcher or a listing supplied, never its bytes.
 */
async function readUpserts(
  root: FileSystemDirectoryHandle,
  state: DeltaState,
  upserts: Iterable<Upsert>,
  lookup: DirLookup,
): Promise<BuiltVaultEntry[]> {
  const internMetadata = createMetadataStringPool();
  const handleOf = (path: string) => {
    const known = state.byPath.get(path);
    return known ? Promise.resolve(known.handle) : fileHandle(root, lookup, path);
  };
  const markdown: Upsert[] = [];
  const out: BuiltVaultEntry[] = [];
  for (const upsert of upserts) {
    if (upsert.kind === 'md') {
      markdown.push(upsert);
      continue;
    }
    const { lastModified, size } = upsert;
    if (lastModified === undefined || (upsert.kind === 'source' && size === undefined)) throw new NeedsRescan();
    out.push({
      relativePath: upsert.path,
      lastModified,
      handle: await handleOf(upsert.path),
      kind: upsert.kind,
      ...(upsert.kind === 'source' ? { bytes: size } : {}),
    });
  }
  const readMarkdown = createMarkdownReader(nativeRootPath(root));
  const batches: Upsert[][] = [];
  for (let at = 0; at < markdown.length; at += NATIVE_READ_BATCH) batches.push(markdown.slice(at, at + NATIVE_READ_BATCH));
  const built = await mapPooled(batches, NATIVE_BATCH_CONCURRENCY, async (batch) => {
    const walked: WalkEntry[] = await Promise.all(
      batch.map(async (upsert) => ({ relativePath: upsert.path, kind: 'md' as const, handle: await handleOf(upsert.path) })),
    );
    const texts = await readMarkdown(walked);
    return walked.map((entry, at) => buildMdEntry(entry, texts[at].text, texts[at].lastModified, internMetadata));
  });
  for (const batch of built) out.push(...batch);
  return out;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, at) => tag === b[at]);
}

/**
 * Applies the watcher's changed paths to the last snapshot without walking the folder: reads only the Markdown files whose stamp moved
 * and patches the manifest, O(changed · log n) plus one O(n) copy of the document list. Equals a full build of the same disk (except `generatedAt`);
 * where it could not, or past `deltaCeiling`, it returns `rescan`. Nothing changed answers `unchanged`. Never writes.
 */
export async function applyVaultChanges(
  root: FileSystemDirectoryHandle,
  previous: LocalVaultSnapshot,
  changes: readonly VaultPathChange[],
): Promise<VaultChangeResult> {
  const prior = previous.build.manifest;
  if (prior.walkTruncated || prior.prunedDirs?.includes('.')) return RESCAN;
  const fingerprint = parseFingerprint(previous.build.fingerprint);
  if (!fingerprint) return RESCAN;
  const state = takeState(previous.entries);
  const lookup = directoryLookup(root);
  let plan: ChangePlan | null;
  let read: BuiltVaultEntry[];
  try {
    plan = await planChanges(prior, state, changes, directoryLister(root, lookup), () => pendingSourceCopyPaths(root));
    if (!plan) return RESCAN;
    read = await readUpserts(root, state, plan.upserts.values(), lookup);
  } catch {
    // A file gone between the event and the read, or a folder that cannot be listed.
    return RESCAN;
  }
  const { removals, sidecarsTouched } = plan;
  if (read.length === 0 && removals.size === 0) return { kind: 'unchanged', sidecarsTouched };

  // From here on nothing awaits or fails: the state moves to the new entries in one step.
  deltaStates.delete(previous.entries);

  const before = new Map<string, BuiltVaultEntry>();
  for (const path of removals) before.set(path, state.byPath.get(path)!);
  for (const entry of read) {
    const old = state.byPath.get(entry.relativePath);
    if (old) before.set(entry.relativePath, old);
  }
  const oldDocs = new Map<string, BuiltVaultEntry>();
  const newDocs = new Map<string, BuiltVaultEntry>();
  for (const entry of before.values()) if (entry.doc) oldDocs.set(entry.doc.slug, entry);
  for (const entry of read) if (entry.doc) newDocs.set(entry.doc.slug, entry);
  const created = [...newDocs.keys()].filter((slug) => !oldDocs.has(slug));
  const deleted = [...oldDocs.keys()].filter((slug) => !newDocs.has(slug));

  // A created or deleted slug can change what another document's frontmatter ref resolves to.
  const movedTails = new Set([...created, ...deleted].map(slugTail));
  const rereferenced = new Map<string, BuiltVaultEntry>();
  if (movedTails.size > 0) {
    for (const entry of state.byPath.values()) {
      const slug = mdSlug(entry);
      if (slug === null || oldDocs.has(slug) || newDocs.has(slug)) continue;
      if (refersToTail(entry.doc!, movedTails)) rereferenced.set(slug, entry);
    }
  }
  const contributions = (entries: Iterable<BuiltVaultEntry>, resolve: RefResolver) => {
    const out = new Map<string, Set<string>>();
    for (const entry of entries) out.set(entry.doc!.slug, backlinkTargets(entry.doc!, resolve));
    return out;
  };
  const oldLinks = contributions([...oldDocs.values(), ...rereferenced.values()], resolverOf(state));

  for (const entry of before.values()) indexEntry(state, entry, -1);
  for (const entry of read) indexEntry(state, entry, 1);
  const newLinks = contributions([...newDocs.values(), ...rereferenced.values()], resolverOf(state));

  for (const entry of before.values()) addStamp(fingerprint, entry.relativePath, entry.lastModified, -1);
  for (const entry of read) addStamp(fingerprint, entry.relativePath, entry.lastModified, 1);

  // Backlinks: per target, the referring documents that appeared or went away.
  const linkEdits = new Map<string, { remove: Set<string>; add: string[] }>();
  const linkEdit = (target: string) => linkEdits.get(target) ?? linkEdits.set(target, { remove: new Set(), add: [] }).get(target)!;
  for (const slug of new Set([...oldLinks.keys(), ...newLinks.keys()])) {
    const was = oldLinks.get(slug) ?? new Set<string>();
    const now = newLinks.get(slug) ?? new Set<string>();
    for (const target of was) if (!now.has(target)) linkEdit(target).remove.add(slug);
    for (const target of now) if (!was.has(target)) linkEdit(target).add.push(slug);
  }
  let backlinkSources = prior.backlinkSources;
  if (linkEdits.size > 0) {
    backlinkSources = { ...prior.backlinkSources };
    for (const [target, { remove, add }] of linkEdits) {
      const list = patchSorted(backlinkSources[target] ?? [], remove, add, (slug) => slug, (slug) => slug, compareCollated);
      if (list.length > 0) backlinkSources[target] = list;
      else delete backlinkSources[target];
    }
  }

  // Tags: sorted slugs per tag, by code unit as the full build sorts them.
  const tagEdits = new Map<string, { remove: Set<string>; add: string[] }>();
  for (const slug of new Set([...oldDocs.keys(), ...newDocs.keys()])) {
    const was = [...new Set(oldDocs.get(slug)?.doc!.tags ?? [])].sort();
    const now = [...new Set(newDocs.get(slug)?.doc!.tags ?? [])].sort();
    if (sameTags(was, now)) continue;
    for (const tag of was) if (!now.includes(tag)) (tagEdits.get(tag) ?? tagEdits.set(tag, { remove: new Set(), add: [] }).get(tag)!).remove.add(slug);
    for (const tag of now) if (!was.includes(tag)) (tagEdits.get(tag) ?? tagEdits.set(tag, { remove: new Set(), add: [] }).get(tag)!).add.push(slug);
  }
  let tags = prior.tags;
  if (tagEdits.size > 0) {
    tags = { ...prior.tags };
    for (const [tag, { remove, add }] of tagEdits) {
      const list = patchSorted(tags[tag] ?? [], remove, add, (slug) => slug, (slug) => slug, compareCodeUnits);
      if (list.length > 0) tags[tag] = list;
      else delete tags[tag];
    }
  }

  let docs = prior.docs;
  if (oldDocs.size > 0 || newDocs.size > 0) {
    docs = patchSorted(
      prior.docs,
      new Set(oldDocs.keys()),
      [...newDocs.values()].map((entry) => entry.doc!),
      (doc) => doc.slug,
      (slug) => ({ slug }) as VaultDoc,
      compareDocs,
    );
  }

  let tree = prior.tree;
  const retitled = [...newDocs].filter(([slug, entry]) => oldDocs.has(slug) && oldDocs.get(slug)!.doc!.title !== entry.doc!.title);
  if (created.length > 0 || deleted.length > 0 || retitled.length > 0) {
    const editor = new TreeEditor(prior.tree);
    for (const slug of deleted) editor.remove(slug);
    for (const slug of created) editor.insert(slug, newDocs.get(slug)!.doc!.title);
    for (const [slug, entry] of retitled) editor.retitle(slug, entry.doc!.title);
    tree = editor.root;
  }

  const oldSources = [...before.values()].filter((entry) => entry.kind === 'source');
  const newSources = read.filter((entry) => entry.kind === 'source');
  let sources = prior.sources ?? [];
  if (oldSources.length > 0 || newSources.length > 0) {
    sources = patchSorted(
      sources,
      new Set(oldSources.map((entry) => entry.relativePath)),
      newSources.map(vaultSourceRow),
      (row) => row.path,
      (path) => ({ path }) as VaultSourceFile,
      compareSources,
    );
  }

  /** The previous map while no key appears, leaves or changes handle; else one O(n) copy. */
  const handles = (kind: BuiltVaultEntry['kind'], current: Map<string, FileSystemFileHandle>, keyOf: (entry: BuiltVaultEntry) => string) => {
    const come = read.filter((entry) => entry.kind === kind);
    const stays = new Set(come.map(keyOf));
    const gone = [...before.values()].filter((entry) => entry.kind === kind && !stays.has(keyOf(entry)));
    if (gone.length === 0 && come.every((entry) => current.get(keyOf(entry)) === entry.handle)) return current;
    const next = new Map(current);
    for (const entry of gone) next.delete(keyOf(entry));
    for (const entry of come) next.set(keyOf(entry), entry.handle);
    return next;
  };

  const manifest: VaultManifest = {
    version: prior.version,
    generatedAt: new Date().toISOString(),
    ...(prior.walkTruncated ? { walkTruncated: true } : {}),
    ...(prior.prunedDirs ? { prunedDirs: prior.prunedDirs } : {}),
    ...(prior.sourceFileCount ? { sourceFileCount: prior.sourceFileCount } : {}),
    docs,
    ...(sources.length ? { sources } : {}),
    backlinkSources,
    tags,
    tree,
  };
  const entries = Array.from(state.byPath.values());
  deltaStates.set(entries, state);
  return {
    kind: 'applied',
    sidecarsTouched,
    snapshot: {
      entries,
      build: {
        manifest,
        fileHandles: handles('md', previous.build.fileHandles, (entry) => entry.doc!.slug),
        imageHandles: handles('image', previous.build.imageHandles, (entry) => entry.relativePath),
        sourceHandles: handles('source', previous.build.sourceHandles, (entry) => entry.relativePath),
        fingerprint: fingerprintText(fingerprint),
      },
    },
  };
}
