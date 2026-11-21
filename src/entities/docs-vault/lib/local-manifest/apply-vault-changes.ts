import { isAtlasTemporaryName } from '@/shared/lib/vault-folder/atlas-temporary-names';
import {
  listTauriVaultStamped,
  type StampedVaultEntry,
} from '@/shared/lib/vault-folder/native-vault/tauri-vault-files';
import { tauriVaultFileHandleAt } from '@/shared/lib/vault-folder/native-vault/tauri-vault-handle';
import type { VaultPathChange } from '@/shared/lib/vault-folder/vault-change-batch';
import { pendingSourceCopyPaths } from '../library/source-copy-publication';
import {
  CACHE_DIR_TAG,
  isPrunedDirName,
  VAULT_WALK_MAX_DEPTH,
  VAULT_WALK_MAX_ENTRIES,
  walkedKind,
  type WalkEntry,
} from './walk-vault';
import {
  addStamp,
  compareCollated,
  compareTreeNodes,
  createMarkdownReader,
  fingerprintText,
  mapPooled,
  NATIVE_BATCH_CONCURRENCY,
  NATIVE_READ_BATCH,
  nativeRootPath,
  parseFingerprint,
  vaultSourceFormat,
  type LocalVaultBuild,
} from './build-local-manifest';
import {
  backlinkTargets,
  buildMdEntry,
  createMetadataStringPool,
  refersToTail,
  refResolver,
  slugTail,
  type BuiltVaultEntry,
  type RefResolver,
} from './md-entry';
import type {
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from '../../model/vault-manifest';

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

/**
 * Indexes over the last snapshot's entries, kept between deltas so a change never re-derives them.
 * Owned by exactly one entries array at a time (`deltaStates`); a delta moves it to the next one.
 */
interface DeltaState {
  byPath: Map<string, BuiltVaultEntry>;
  /** Folder → walked files beneath it: whether a reported folder held anything. */
  dirCounts: Map<string, number>;
  /** Slug tail → its slug, or every slug sharing it (then ambiguous, as the full build reads it). */
  tails: Map<string, string | Set<string>>;
}

const deltaStates = new WeakMap<readonly BuiltVaultEntry[], DeltaState>();

function eachAncestor(path: string, visit: (dir: string) => void): void {
  for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1)) visit(path.slice(0, at));
}

function mdSlug(entry: BuiltVaultEntry): string | null {
  return entry.kind === 'md' && entry.doc ? entry.doc.slug : null;
}

function indexEntry(state: DeltaState, entry: BuiltVaultEntry, sign: 1 | -1): void {
  if (sign === 1) state.byPath.set(entry.relativePath, entry);
  else state.byPath.delete(entry.relativePath);
  eachAncestor(entry.relativePath, (dir) => {
    const count = (state.dirCounts.get(dir) ?? 0) + sign;
    if (count > 0) state.dirCounts.set(dir, count);
    else state.dirCounts.delete(dir);
  });
  const slug = mdSlug(entry);
  if (slug === null) return;
  const tail = slugTail(slug);
  const held = state.tails.get(tail);
  // A set, so removing one of many documents sharing a tail is O(1), not O(sharers).
  if (sign === 1) {
    if (held === undefined) state.tails.set(tail, slug);
    else if (typeof held === 'string') state.tails.set(tail, new Set([held, slug]));
    else held.add(slug);
  } else if (typeof held === 'string') {
    state.tails.delete(tail);
  } else if (held) {
    held.delete(slug);
    if (held.size === 1) state.tails.set(tail, held.values().next().value!);
  }
}

/** O(entries × depth) once per snapshot that was not itself produced by a delta. */
function takeState(entries: readonly BuiltVaultEntry[]): DeltaState {
  const held = deltaStates.get(entries);
  if (held) return held;
  const state: DeltaState = { byPath: new Map(), dirCounts: new Map(), tails: new Map() };
  for (const entry of entries) indexEntry(state, entry, 1);
  deltaStates.set(entries, state);
  return state;
}

function resolverOf(state: DeltaState): RefResolver {
  return refResolver(
    (slug) => state.byPath.get(`${slug}.md`)?.kind === 'md',
    (tail) => {
      const held = state.tails.get(tail);
      return typeof held === 'string' ? held : null;
    },
  );
}

/** Relative, `/`-separated and inside the vault; the watcher's word is not trusted further. */
function isConfinedRelativePath(path: string): boolean {
  if (!path || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Upper bound: the first index whose item sorts after `item`. O(log n) comparisons. */
function insertionIndex<T>(list: readonly T[], item: T, compare: (a: T, b: T) => number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compare(list[mid], item) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the item with `key`, or -1; `probe` builds a comparable stand-in. O(log n). */
function findSorted<T>(list: readonly T[], probe: T, compare: (a: T, b: T) => number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const order = compare(list[mid], probe);
    if (order === 0) return mid;
    if (order < 0) lo = mid + 1;
    else hi = mid;
  }
  return -1;
}

/** Few edits splice in O(k log n + k·n) moves; many filter and merge in O(n + k log n). */
const SPLICE_MAX = 32;

/**
 * A new sorted list without the items whose key is in `remove`, plus `add`. Keys are unique and
 * `compare` orders by key, so a removal is found by binary search. The old list is not touched.
 */
function patchSorted<T>(
  list: readonly T[],
  remove: ReadonlySet<string>,
  add: readonly T[],
  keyOf: (item: T) => string,
  probeOf: (key: string) => T,
  compare: (a: T, b: T) => number,
): T[] {
  let kept: T[];
  if (remove.size <= SPLICE_MAX) {
    kept = list.slice();
    for (const key of remove) {
      const at = findSorted(kept, probeOf(key), compare);
      if (at >= 0) kept.splice(at, 1);
    }
  } else {
    kept = list.filter((item) => !remove.has(keyOf(item)));
  }
  if (add.length === 0) return kept;
  const sorted = [...add].sort(compare);
  if (sorted.length <= SPLICE_MAX) {
    for (const item of sorted) kept.splice(insertionIndex(kept, item, compare), 0, item);
    return kept;
  }
  const out: T[] = [];
  let from = 0;
  for (const item of sorted) {
    const at = insertionIndex(kept, item, compare);
    while (from < at) out.push(kept[from++]);
    out.push(item);
  }
  while (from < kept.length) out.push(kept[from++]);
  return out;
}

const compareDocs = (a: VaultDoc, b: VaultDoc) => compareCollated(a.slug, b.slug);
const compareSources = (a: VaultSourceFile, b: VaultSourceFile) => compareCollated(a.path, b.path);
const compareCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sourceRow(entry: BuiltVaultEntry): VaultSourceFile {
  return {
    path: entry.relativePath,
    name: nameOf(entry.relativePath),
    format: vaultSourceFormat(entry.relativePath),
    bytes: entry.bytes ?? 0,
    mtime: entry.lastModified,
  };
}

/**
 * Edits a tree by copying only the nodes on each changed path; every other node is shared with
 * the previous manifest, which stays intact. O(depth · log siblings) per document.
 */
class TreeEditor {
  readonly root: VaultTreeNode;
  private readonly fresh = new Set<VaultTreeNode>();

  constructor(root: VaultTreeNode) {
    this.root = this.copy(root);
  }

  private copy(node: VaultTreeNode): VaultTreeNode {
    const next = { ...node };
    if (node.children) next.children = node.children.slice();
    this.fresh.add(next);
    return next;
  }

  private childIndex(parent: VaultTreeNode, name: string): number {
    const children = parent.children ?? [];
    for (const type of ['dir', 'doc'] as const) {
      const at = findSorted(children, { name, path: '', type }, compareTreeNodes);
      if (at >= 0) return at;
    }
    return -1;
  }

  private child(parent: VaultTreeNode, name: string): VaultTreeNode | undefined {
    const at = this.childIndex(parent, name);
    if (at < 0) return undefined;
    const current = parent.children![at];
    if (this.fresh.has(current)) return current;
    const next = this.copy(current);
    parent.children![at] = next;
    return next;
  }

  private reposition(parent: VaultTreeNode, node: VaultTreeNode): void {
    const children = parent.children!;
    children.splice(children.indexOf(node), 1);
    children.splice(insertionIndex(children, node, compareTreeNodes), 0, node);
  }

  insert(slug: string, title: string): void {
    const parts = slug.split('/');
    let node = this.root;
    parts.forEach((name, at) => {
      const isLeaf = at === parts.length - 1;
      node.children ??= [];
      let child = this.child(node, name);
      if (!child) {
        child = { name, path: parts.slice(0, at + 1).join('/'), type: isLeaf ? 'doc' : 'dir' };
        if (isLeaf) {
          child.slug = slug;
          child.title = title;
        }
        this.fresh.add(child);
        node.children.splice(insertionIndex(node.children, child, compareTreeNodes), 0, child);
      } else if (isLeaf && !child.slug) {
        child.type = 'doc';
        child.slug = slug;
        child.title = title;
        this.reposition(node, child);
      }
      node = child;
    });
  }

  retitle(slug: string, title: string): void {
    let node: VaultTreeNode | undefined = this.root;
    for (const name of slug.split('/')) node = node && this.child(node, name);
    if (node) node.title = title;
  }

  remove(slug: string): void {
    const parts = slug.split('/');
    const path: VaultTreeNode[] = [this.root];
    for (const name of parts) {
      const next = this.child(path[path.length - 1], name);
      if (!next) return;
      path.push(next);
    }
    const leaf = path[path.length - 1];
    if (leaf.children?.length) {
      // A document that is also a folder stays as the folder.
      leaf.type = 'dir';
      delete leaf.slug;
      delete leaf.title;
      this.reposition(path[path.length - 2], leaf);
      return;
    }
    // Drop the leaf, then every folder it leaves empty; a document keeps no empty `children`.
    for (let at = path.length - 1; at > 0; at -= 1) {
      const node = path[at];
      const parent = path[at - 1];
      if (node.children?.length) break;
      if (node.type === 'doc' && at !== path.length - 1) {
        delete node.children;
        break;
      }
      parent.children!.splice(parent.children!.indexOf(node), 1);
    }
    if (this.root.children?.length === 0) delete this.root.children;
  }
}

interface Upsert {
  path: string;
  kind: WalkEntry['kind'];
  lastModified?: number;
  size?: number;
}

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

type ListDir = (dir: string) => Promise<StampedVaultEntry[]>;

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

class NeedsRescan extends Error {}

interface Listed {
  kind: WalkEntry['kind'];
  lastModified: number;
  size: number;
}

/**
 * What the walk would find under `dir` now, by its rules, with stamps and no reads. O(entries
 * beneath it). The folders it prunes are collected so the caller can compare them with the last
 * walk's; source code throws, because only a walk keeps that count.
 */
async function listSubtree(list: ListDir, dir: string, out: Map<string, Listed>, pruned: string[]): Promise<void> {
  if (dir.split('/').length > VAULT_WALK_MAX_DEPTH) throw new NeedsRescan();
  const children = await list(dir);
  if (children.some((child) => child.name === CACHE_DIR_TAG)) {
    pruned.push(dir);
    return;
  }
  for (const child of children) {
    if (child.name.startsWith('.')) continue;
    const path = `${dir}/${child.name.normalize('NFC')}`;
    if (child.kind === 'directory') {
      if (isPrunedDirName(child.name)) pruned.push(path);
      else await listSubtree(list, path, out, pruned);
      continue;
    }
    const kind = walkedKind(path, child.name);
    if (kind === 'code') throw new NeedsRescan();
    if (!kind) continue;
    if (child.lastModified === undefined || child.size === undefined) throw new NeedsRescan();
    out.set(path, { kind, lastModified: child.lastModified, size: child.size });
  }
}

/** Whether the stamp is the one the last build read: an echo, or a file a listing found unchanged. */
function sameStamp(known: BuiltVaultEntry, lastModified: number | undefined, size: number | undefined): boolean {
  return lastModified !== undefined && known.lastModified === lastModified && (known.kind !== 'source' || known.bytes === size);
}

/** The nearest of `dir`'s ancestors (or `dir` itself) in `dirs`, else null. O(depth). */
function withinAny(path: string, dirs: ReadonlySet<string>, inclusive: boolean): string | null {
  if (inclusive && dirs.has(path)) return path;
  let found: string | null = null;
  eachAncestor(path, (dir) => {
    if (found === null && dirs.has(dir)) found = dir;
  });
  return found;
}

/** Past this many changed files the walk is cheaper: a fifth of the vault, never below 1,000. At 50,000 files removals cross over near a quarter (10,000: 231 vs 294 ms; 17,945: 320 vs 251 ms), so a fifth keeps margin. */
function deltaCeiling(knownFiles: number): number {
  return Math.max(1_000, Math.floor(knownFiles / 5));
}

interface ChangePlan {
  upserts: Map<string, Upsert>;
  removals: Set<string>;
  sidecarsTouched: boolean;
}

/**
 * Sorts each reported path into reads and removals, or gives up. A reported folder is listed
 * again whole, as the walk would list it, so a folder moved in, replaced or emptied converges.
 * O(paths + listed entries), plus one O(known files · depth) pass when a folder was reported.
 */
async function planChanges(
  manifest: VaultManifest,
  state: DeltaState,
  changes: readonly VaultPathChange[],
  list: ListDir,
  pendingSources: () => Promise<ReadonlySet<string>>,
): Promise<ChangePlan | null> {
  const prunedDirs = manifest.prunedDirs ?? [];
  const codeFiles = manifest.sourceFileCount ?? 0;
  const byPath = new Map<string, VaultPathChange>();
  const byFold = new Map<string, string>();
  let sidecarsTouched = false;
  for (const change of changes) {
    const path = change.path.normalize('NFC');
    if (!isConfinedRelativePath(path)) return null;
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    // A writer's temporary is renamed over its target, whose own path the batch reports.
    if (isAtlasTemporaryName(name)) continue;
    // A case-only rename reports both spellings; on a case-blind disk either one reads.
    const fold = path.toLowerCase();
    if ((byFold.get(fold) ?? path) !== path) return null;
    byFold.set(fold, path);
    if (parts.some((part) => part.startsWith('.'))) {
      sidecarsTouched = true;
      continue;
    }
    if (parts.slice(0, -1).some(isPrunedDirName)) continue;
    // A cache tag prunes or un-prunes its folder, inside a pruned one or not.
    if (name === CACHE_DIR_TAG) return null;
    if (prunedDirs.some((dir) => path.startsWith(`${dir}/`))) continue;
    if (isPrunedDirName(name) || parts.length > VAULT_WALK_MAX_DEPTH + 1) return null;
    if (change.kind !== 'directory' && prunedDirs.some((dir) => dir === path || dir.startsWith(`${path}/`))) return null;
    byPath.set(path, { ...change, path });
  }

  const upserts = new Map<string, Upsert>();
  const removals = new Set<string>();
  const gone = new Set<string>();
  const relisted = new Set<string>();
  for (const [path, change] of byPath) {
    const known = state.byPath.get(path);
    if (change.kind === 'file') {
      const kind = walkedKind(path, nameOf(path));
      if (kind === 'code') return null;
      if (kind && !(known && sameStamp(known, change.lastModified, change.size))) {
        upserts.set(path, { path, kind, lastModified: change.lastModified, size: change.size });
      }
      continue;
    }
    if (known) removals.add(path);
    if (change.kind === 'directory') relisted.add(path);
    else if (state.dirCounts.has(path)) gone.add(path);
    // It may have been a source-code file or a folder of them; only a walk recounts those.
    else if (!known && codeFiles > 0) return null;
  }

  if (gone.size > 0 || relisted.size > 0) {
    // A gone folder's code files were counted, never listed.
    if (gone.size > 0 && codeFiles > 0) return null;
    const roots = new Set([...relisted].filter((dir) => withinAny(dir, relisted, false) === null));
    const listed = new Map<string, Listed>();
    const pruned: string[] = [];
    try {
      for (const dir of roots) await listSubtree(list, dir, listed, pruned);
    } catch (error) {
      if (error instanceof NeedsRescan || (error as { name?: string })?.name === 'NotFoundError') return null;
      throw error;
    }
    // The folders the walk prunes under a listed one must be the ones it pruned last time.
    const prunedBefore = prunedDirs.filter((dir) => withinAny(dir, roots, true) !== null);
    if (prunedBefore.length !== pruned.length || !prunedBefore.every((dir) => pruned.includes(dir))) return null;
    // Under a gone folder every known file leaves; under a listed one, every file it did not list.
    for (const path of state.byPath.keys()) {
      if (withinAny(path, gone, false) !== null || (!listed.has(path) && withinAny(path, roots, false) !== null)) {
        removals.add(path);
      }
    }
    // The listing is newer than the watcher's stamps for what lies under it.
    for (const path of upserts.keys()) {
      if (!listed.has(path) && withinAny(path, roots, false) !== null) {
        upserts.delete(path);
        if (state.byPath.has(path)) removals.add(path);
      }
    }
    for (const [path, found] of listed) {
      const known = state.byPath.get(path);
      if (known && sameStamp(known, found.lastModified, found.size)) {
        upserts.delete(path);
        removals.delete(path);
      } else {
        upserts.set(path, { path, kind: found.kind, lastModified: found.lastModified, size: found.size });
      }
    }
  }

  if ([...upserts.values()].some((upsert) => upsert.kind === 'source')) {
    const pending = await pendingSources();
    for (const [path, upsert] of upserts) {
      if (upsert.kind !== 'source' || !pending.has(path)) continue;
      upserts.delete(path);
      if (state.byPath.has(path)) removals.add(path);
    }
  }
  for (const path of upserts.keys()) removals.delete(path);
  if (upserts.size + removals.size > deltaCeiling(state.byPath.size)) return null;
  let size = state.byPath.size - removals.size;
  for (const path of upserts.keys()) if (!state.byPath.has(path)) size += 1;
  if (size >= VAULT_WALK_MAX_ENTRIES) return null;
  return { upserts, removals, sidecarsTouched };
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
      newSources.map(sourceRow),
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
