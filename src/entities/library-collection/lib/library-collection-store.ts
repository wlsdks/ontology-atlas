import { getTauriVaultRootPath, readTauriLibraryCollections, writeTauriLibraryCollections } from '@/shared/lib/tauri-vault-fs';
import { LIBRARY_COLLECTIONS_MAX_BYTES, parseLibraryCollections, serializeLibraryCollections, type LibraryCollections, type LibraryCollectionsParseResult } from '../model/library-collection';

export interface LibraryCollectionsSnapshot {
  parsed: LibraryCollectionsParseResult;
  /** Exact bytes used for compare-before-save; null means the file was absent. */
  expectedContent: string | null;
}

export class LibraryCollectionsConflictError extends Error {
  name = 'LibraryCollectionsConflictError';
  constructor(readonly currentContent: string | null) { super('Library collections changed on disk. Reload before saving again.'); }
}

export class LibraryCollectionsStaleCompletionError extends Error {
  name = 'LibraryCollectionsStaleCompletionError';
  constructor() { super('The selected vault changed while collections were being saved. Discard this completion and reload the saved vault before editing it again.'); }
}

const queues = new WeakMap<FileSystemDirectoryHandle, Promise<void>>();

/**
 * Whether a read failure only means "nothing was saved here yet".
 *
 * The installed app rejects with the native command's **string**, never an `Error`, so a
 * check that only looked at `Error#message` classified every native not-found as a read
 * failure and the map answered a vault that never saved a constellation with "could not
 * read your saved constellations".
 */
export function isMissingLibraryCollectionsError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'NotFoundError';
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : null;
  return message !== null && /not found|no such file|os error 2\b|ENOENT/i.test(message);
}

const missing = isMissingLibraryCollectionsError;

async function readBrowser(handle: FileSystemDirectoryHandle): Promise<string | null> {
  try {
    const sidecar = await handle.getDirectoryHandle('.ontology-atlas');
    const file = await (await sidecar.getFileHandle('library-collections.json')).getFile();
    if (file.size > LIBRARY_COLLECTIONS_MAX_BYTES) throw new Error('The collection file exceeds the 1 MiB limit.');
    return await file.text();
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

async function readRaw(handle: FileSystemDirectoryHandle): Promise<string | null> {
  const rootPath = getTauriVaultRootPath(handle);
  if (!rootPath) return readBrowser(handle);
  try { return await readTauriLibraryCollections(rootPath); }
  catch (error) { if (missing(error)) return null; throw error; }
}

export async function loadLibraryCollections(handle: FileSystemDirectoryHandle): Promise<LibraryCollectionsSnapshot> {
  const raw = await readRaw(handle);
  return { parsed: parseLibraryCollections(raw), expectedContent: raw };
}

async function writeBrowser(handle: FileSystemDirectoryHandle, content: string): Promise<void> {
  const sidecar = await handle.getDirectoryHandle('.ontology-atlas', { create: true });
  const file = await sidecar.getFileHandle('library-collections.json', { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Saves against the handle captured by the caller. `isCurrent` rejects stale work before initiating
 * the write and again before returning, so UI state cannot accept a completion from a vault that is
 * no longer selected. A started filesystem operation cannot be cancelled and may still finish in
 * its captured vault. Browser FSA has no atomic CAS; this serializes Atlas writes for the handle and
 * compares immediately before its best-effort write.
 */
export async function saveLibraryCollections(
  capturedHandle: FileSystemDirectoryHandle,
  snapshot: LibraryCollectionsSnapshot,
  value: LibraryCollections,
  isCurrent: () => boolean,
): Promise<LibraryCollectionsSnapshot> {
  if (snapshot.parsed.status === 'corrupt' || snapshot.parsed.status === 'unsupported') {
    throw new Error('Reload or repair the existing collection file before saving.');
  }
  const previous = queues.get(capturedHandle) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => { release = resolve; });
  queues.set(capturedHandle, previous.then(() => turn));
  await previous;
  try {
    const content = serializeLibraryCollections(value);
    const rootPath = getTauriVaultRootPath(capturedHandle);
    if (rootPath) {
      if (!isCurrent()) throw new Error('The selected vault changed before collections could be saved.');
      const result = await writeTauriLibraryCollections(rootPath, snapshot.expectedContent, content);
      if (!result) throw new Error('The installed app collection writer is unavailable.');
      if (!result.written) throw new LibraryCollectionsConflictError(result.currentContent);
    } else {
      const current = await readRaw(capturedHandle);
      if (current !== snapshot.expectedContent) throw new LibraryCollectionsConflictError(current);
      if (!isCurrent()) throw new Error('The selected vault changed before collections could be saved.');
      await writeBrowser(capturedHandle, content);
    }
    if (!isCurrent()) throw new LibraryCollectionsStaleCompletionError();
    return { parsed: { status: 'ready', value }, expectedContent: content };
  } finally {
    release();
  }
}
