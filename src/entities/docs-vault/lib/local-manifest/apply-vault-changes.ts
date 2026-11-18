import { tauriVaultFileHandleAt } from '@/shared/lib/vault-folder/tauri-vault-fs';
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
  backlinkContribution,
  buildMdEntry,
  compareCollated,
  compareTreeNodes,
  createMarkdownReader,
  createMetadataStringPool,
  fingerprintText,
  mapPooled,
  NATIVE_BATCH_CONCURRENCY,
  NATIVE_READ_BATCH,
  nativeRootPath,
  parseFingerprint,
  refersToTail,
  refResolver,
  slugTail,
  vaultSourceFormat,
  type BuiltVaultEntry,
  type LocalVaultBuild,
  type RefResolver,
} from './build-local-manifest';
import type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from '../../model/types';

export interface LocalVaultSnapshot {
  build: LocalVaultBuild;
  entries: BuiltVaultEntry[];
}

export type VaultChangeResult =
  /** `sidecarsTouched`: a path under `.ontology-atlas/` or an agent config changed too. */
  | { kind: 'applied'; snapshot: LocalVaultSnapshot; sidecarsTouched: boolean }
  | { kind: 'unchanged'; sidecarsTouched: boolean }
  /** The paths cannot be applied exactly; the caller re-reads the folder. */
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
  tails: Map<string, string | string[]>;
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
  if (sign === 1) {
    if (held === undefined) state.tails.set(tail, slug);
    else if (typeof held === 'string') state.tails.set(tail, [held, slug]);
    else held.push(slug);
  } else if (typeof held === 'string') {
    state.tails.delete(tail);
  } else if (held) {
    const rest = held.filter((other) => other !== slug);
    state.tails.set(tail, rest.length === 1 ? rest[0] : rest);
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
const compareBacklinks = (a: VaultBacklinkEntry, b: VaultBacklinkEntry) => compareCollated(a.fromSlug, b.fromSlug);
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

  /** The editable child `name`, copied on first touch; `undefined` when absent. */
  private child(parent: VaultTreeNode, name: string): VaultTreeNode | undefined {
    const at = this.childIndex(parent, name);
    if (at < 0) return undefined;
    const current = parent.children![at];
    if (this.fresh.has(current)) return current;
    const next = this.copy(current);
    parent.children![at] = next;
    return next;
  }

  /** Re-sorts one child after its `type` changed, which moves it among folders and documents. */
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
  change: VaultPathChange | null;
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

class NeedsRescan extends Error {}

/**
 * Lists a folder the watcher reported as new, by the walk's rules, for what it now holds.
 * O(entries beneath it). Anything that would change the walk's counters needs a full walk.
 */
async function listNewFolder(lookup: DirLookup, dir: string, found: Upsert[]): Promise<void> {
  if (dir.split('/').length > VAULT_WALK_MAX_DEPTH) throw new NeedsRescan();
  const children: Array<[string, FileSystemHandle]> = [];
  for await (const entry of (await lookup(dir)).entries()) children.push(entry);
  if (children.some(([name]) => name === CACHE_DIR_TAG)) throw new NeedsRescan();
  for (const [name, handle] of children) {
    if (name.startsWith('.')) continue;
    const path = `${dir}/${name.normalize('NFC')}`;
    if (handle.kind === 'directory') {
      if (isPrunedDirName(name)) throw new NeedsRescan();
      await listNewFolder(lookup, path, found);
      continue;
    }
    const kind = walkedKind(path, name);
    if (kind === 'code') throw new NeedsRescan();
    if (kind) found.push({ path, kind, change: null });
  }
}

interface ChangePlan {
  upserts: Map<string, Upsert>;
  removals: Set<string>;
  sidecarsTouched: boolean;
}

/** Sorts each reported path into reads, removals and folder listings, or gives up. */
async function planChanges(
  manifest: VaultManifest,
  state: DeltaState,
  changes: readonly VaultPathChange[],
  lookup: DirLookup,
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
    // A case-only rename reports both spellings; on a case-blind disk either one reads.
    const fold = path.toLowerCase();
    if ((byFold.get(fold) ?? path) !== path) return null;
    byFold.set(fold, path);
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    if (parts.some((part) => part.startsWith('.'))) {
      sidecarsTouched = true;
      continue;
    }
    if (parts.slice(0, -1).some(isPrunedDirName) || prunedDirs.some((dir) => path.startsWith(`${dir}/`))) continue;
    if (isPrunedDirName(name) || name === CACHE_DIR_TAG || parts.length > VAULT_WALK_MAX_DEPTH + 1) return null;
    if (change.kind !== 'directory' && prunedDirs.some((dir) => dir === path || dir.startsWith(`${path}/`))) return null;
    byPath.set(path, { ...change, path });
  }

  const upserts = new Map<string, Upsert>();
  const removals = new Set<string>();
  const goneFolders: string[] = [];
  const newFolders: string[] = [];
  for (const [path, change] of byPath) {
    const kind = walkedKind(path, nameOf(path));
    const known = state.byPath.has(path);
    if (change.kind === 'file' && kind === 'code') return null;
    if (change.kind === 'file' && kind && kind !== 'code') upserts.set(path, { path, kind, change });
    else if (known) removals.add(path);
    if (change.kind === 'directory') {
      newFolders.push(path);
    } else if (state.dirCounts.has(path)) {
      goneFolders.push(path);
    } else if (!known && change.kind !== 'file' && codeFiles > 0) {
      // It may have been a source-code file or a folder of them; only a walk recounts those.
      return null;
    }
  }

  if (goneFolders.length > 0) {
    // Its code files were counted, never listed, so a folder that held any needs a walk.
    if (codeFiles > 0) return null;
    for (const path of state.byPath.keys()) {
      if (goneFolders.some((dir) => path.startsWith(`${dir}/`))) removals.add(path);
    }
  }
  for (const dir of newFolders) {
    const held = state.dirCounts.get(dir) ?? 0;
    let leaving = 0;
    for (const path of removals) if (path.startsWith(`${dir}/`)) leaving += 1;
    // A folder that already held files reports its own files; a new one may have arrived whole.
    if (held > leaving) continue;
    const found: Upsert[] = [];
    try {
      await listNewFolder(lookup, dir, found);
    } catch (error) {
      if (error instanceof NeedsRescan || (error as { name?: string })?.name === 'NotFoundError') return null;
      throw error;
    }
    for (const upsert of found) if (!upserts.has(upsert.path)) upserts.set(upsert.path, upsert);
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
  let size = state.byPath.size - removals.size;
  for (const path of upserts.keys()) if (!state.byPath.has(path)) size += 1;
  if (size >= VAULT_WALK_MAX_ENTRIES) return null;
  return { upserts, removals, sidecarsTouched };
}

/** Reads what the plan upserts: Markdown bodies in native batches, stamps from the watcher. */
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
    const handle = await handleOf(upsert.path);
    let lastModified = upsert.change?.lastModified;
    let bytes = upsert.change?.size;
    if (lastModified === undefined || (upsert.kind === 'source' && bytes === undefined)) {
      const file = await handle.getFile();
      lastModified = file.lastModified;
      bytes = file.size;
    }
    out.push({
      relativePath: upsert.path,
      lastModified,
      handle,
      kind: upsert.kind,
      ...(upsert.kind === 'source' ? { bytes } : {}),
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

function sameBacklink(a: VaultBacklinkEntry | undefined, b: VaultBacklinkEntry | undefined): boolean {
  return a === b || (!!a && !!b && a.context === b.context && a.linkText === b.linkText);
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, at) => tag === b[at]);
}

/**
 * Applies the watcher's changed paths to the last snapshot without walking the folder: reads only
 * those files and patches the manifest. O(changed · log n) plus one O(n) copy of the document list;
 * a created or removed document adds one O(n) scan for the frontmatter refs it re-resolves. The
 * result equals a full build of the same disk (except `generatedAt`); where it could not, it
 * returns `rescan` and the caller walks. Never writes.
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
    plan = await planChanges(prior, state, changes, lookup, () => pendingSourceCopyPaths(root));
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
    const out = new Map<string, Map<string, VaultBacklinkEntry>>();
    for (const entry of entries) out.set(entry.doc!.slug, backlinkContribution(entry.doc!, entry.linkContexts, resolve));
    return out;
  };
  const oldLinks = contributions([...oldDocs.values(), ...rereferenced.values()], resolverOf(state));

  for (const entry of before.values()) indexEntry(state, entry, -1);
  for (const entry of read) indexEntry(state, entry, 1);
  const newLinks = contributions([...newDocs.values(), ...rereferenced.values()], resolverOf(state));

  for (const entry of before.values()) addStamp(fingerprint, entry.relativePath, entry.lastModified, -1);
  for (const entry of read) addStamp(fingerprint, entry.relativePath, entry.lastModified, 1);

  // Backlinks: per target, the documents whose entry appeared, changed or went away.
  const linkEdits = new Map<string, Map<string, VaultBacklinkEntry | null>>();
  for (const slug of new Set([...oldLinks.keys(), ...newLinks.keys()])) {
    const was = oldLinks.get(slug) ?? new Map<string, VaultBacklinkEntry>();
    const now = newLinks.get(slug) ?? new Map<string, VaultBacklinkEntry>();
    for (const target of new Set([...was.keys(), ...now.keys()])) {
      if (sameBacklink(was.get(target), now.get(target))) continue;
      if (!linkEdits.has(target)) linkEdits.set(target, new Map());
      linkEdits.get(target)!.set(slug, now.get(target) ?? null);
    }
  }
  let backlinksDetail = prior.backlinksDetail;
  if (linkEdits.size > 0) {
    backlinksDetail = { ...prior.backlinksDetail };
    for (const [target, edits] of linkEdits) {
      const list = patchSorted(
        backlinksDetail[target] ?? [],
        new Set(edits.keys()),
        [...edits.values()].filter((entry): entry is VaultBacklinkEntry => entry !== null),
        (entry) => entry.fromSlug,
        (fromSlug) => ({ fromSlug, context: '', linkText: '' }),
        compareBacklinks,
      );
      if (list.length > 0) backlinksDetail[target] = list;
      else delete backlinksDetail[target];
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
    backlinksDetail,
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
