export interface WalkEntry {
  handle: FileSystemFileHandle;
  /** Path relative to the top-level handle — e.g. 'specs/hello.md'. */
  relativePath: string;
  kind: 'md' | 'image' | 'source';
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/**
 * The top-level raw-source folder: listed by name, format, size and mtime, never read
 * (`docs/DECISIONS.md` 2026-09-05, "A vault holds three kinds of file and only one is the graph").
 * Mirrored in `src-tauri/src/lib.rs` (`vault-walk-rules.contract.test.ts`); if the walks diverge the
 * fingerprint counts a different file set, so the app rebuilds constantly or misses a new document.
 */
export const VAULT_SOURCES_DIR = 'sources';

export function isVaultSourcePath(relativePath: string): boolean {
  return relativePath.startsWith(`${VAULT_SOURCES_DIR}/`);
}

/**
 * Source-code extensions, counted but never read, so first run can tell a repository from a documents folder
 * (`docs/audits/USER-WALKTHROUGH-FIRST-RUN-2026-08-31.md`, finding 3).
 */
const SOURCE_EXT =
  /\.(m?[jt]sx?|vue|svelte|dart|py|go|rs|java|kt|swift|rb|php|cs|c|cc|cpp|h|hpp|scala|ex|exs|sh)$/i;

/** Only names that never hold documents; `build`, `dist` and `out` can, so do not extend. */
const PRUNE_BY_NAME = new Set(['node_modules']);

/** A directory that declares itself a cache (bford.info/cachedir) is pruned whole. */
const CACHE_DIR_TAG = 'CACHEDIR.TAG';

/** Far above any document folder; past it the walk truncates and the manifest says so. */
export const VAULT_WALK_MAX_ENTRIES = 100000;
/** A realistic ceiling for a document folder. Deeper usually means someone else's tree. */
export const VAULT_WALK_MAX_DEPTH = 12;

export interface WalkResult {
  entries: WalkEntry[];
  /** A limit was hit, so the walk saw only part of the tree. */
  truncated: boolean;
  /** Relative paths of directories skipped whole as cache or dependencies. */
  prunedDirs: string[];
  /** Source files passed over: counted, never read or stored. */
  sourceFileCount: number;
}

type DirectoryListing = Array<[string, FileSystemHandle]>;

const VAULT_LIST_CONCURRENCY = 8;

async function listDirectory(directory: FileSystemDirectoryHandle): Promise<DirectoryListing> {
  const children: DirectoryListing = [];
  for await (const entry of directory.entries()) children.push(entry);
  return children;
}

function walkedKind(relative: string, name: string): WalkEntry['kind'] | 'code' | null {
  if (isVaultSourcePath(relative)) return 'source';
  if (name.endsWith('.md')) return 'md';
  if (IMAGE_EXT.test(name)) return 'image';
  if (SOURCE_EXT.test(name)) return 'code';
  return null;
}

function prefetchListings(
  root: FileSystemDirectoryHandle,
): Promise<Map<FileSystemDirectoryHandle, DirectoryListing>> {
  const listings = new Map<FileSystemDirectoryHandle, DirectoryListing>();
  const queue: Array<{ handle: FileSystemDirectoryHandle; prefix: string; depth: number }> = [
    { handle: root, prefix: '', depth: 0 },
  ];
  let head = 0;
  let active = 0;
  let walked = 0;
  const enqueue = (directory: (typeof queue)[number], children: DirectoryListing) => {
    listings.set(directory.handle, children);
    if (children.some(([name]) => name === CACHE_DIR_TAG)) return;
    for (const [name, handle] of children) {
      if (name.startsWith('.')) continue;
      const relative = directory.prefix ? `${directory.prefix}/${name.normalize('NFC')}` : name.normalize('NFC');
      if (handle.kind !== 'directory') {
        const kind = walkedKind(relative, name);
        if (kind && kind !== 'code') walked += 1;
      } else if (!PRUNE_BY_NAME.has(name) && directory.depth < VAULT_WALK_MAX_DEPTH) {
        queue.push({ handle: handle as FileSystemDirectoryHandle, prefix: relative, depth: directory.depth + 1 });
      }
    }
  };
  return new Promise((resolve) => {
    const pump = () => {
      while (active < VAULT_LIST_CONCURRENCY && head < queue.length && walked < VAULT_WALK_MAX_ENTRIES) {
        const directory = queue[head];
        head += 1;
        active += 1;
        void listDirectory(directory.handle)
          .then((children) => enqueue(directory, children), () => undefined)
          .finally(() => {
            active -= 1;
            pump();
          });
      }
      if (active === 0) resolve(listings);
    };
    pump();
  });
}

async function walkInto(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  acc: WalkResult,
  listings: Map<FileSystemDirectoryHandle, DirectoryListing>,
): Promise<void> {
  if (acc.truncated) return;
  if (depth > VAULT_WALK_MAX_DEPTH) {
    acc.truncated = true;
    return;
  }
  const children = listings.get(directory) ?? (await listDirectory(directory));
  if (children.some(([name]) => name === CACHE_DIR_TAG)) {
    acc.prunedDirs.push(prefix || '.');
    return;
  }
  for (const [name, handle] of children) {
    if (acc.entries.length >= VAULT_WALK_MAX_ENTRIES) {
      acc.truncated = true;
      return;
    }
    if (name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${name.normalize('NFC')}` : name.normalize('NFC');
    if (handle.kind === 'directory') {
      if (PRUNE_BY_NAME.has(name)) {
        acc.prunedDirs.push(relative);
        continue;
      }
      await walkInto(handle as FileSystemDirectoryHandle, relative, depth + 1, acc, listings);
      continue;
    }
    const kind = walkedKind(relative, name);
    if (kind === 'code') acc.sourceFileCount += 1;
    else if (kind) acc.entries.push({ handle: handle as FileSystemFileHandle, relativePath: relative, kind });
  }
}

export async function walkVault(root: FileSystemDirectoryHandle): Promise<WalkResult> {
  const acc: WalkResult = { entries: [], truncated: false, prunedDirs: [], sourceFileCount: 0 };
  await walkInto(root, '', 0, acc, await prefetchListings(root));
  return acc;
}
