/** Reads vault files with bounded concurrency, in native batches in the app, and falls back to one read at a time. */

import { failureCodeOf } from '@/shared/lib/failures/failure-code';
import {
  readTauriVaultBytes,
  readTauriVaultTextFile,
  readTauriVaultTextFiles,
} from '@/shared/lib/vault-folder/native-vault/tauri-vault-files';
import { type NativeVaultTextRead } from '@/shared/lib/vault-folder/vault-text-frames';
import type { WalkEntry } from './walk-vault';

export const VAULT_READ_CONCURRENCY = 64;

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

interface MarkdownFile {
  text: string;
  lastModified: number;
}

type ManifestFile = Pick<File, 'lastModified' | 'text'>;

/**
 * A document the app's text read refused as not UTF-8, read once more as bytes and decoded as a
 * browser does, so one such document never stops the folder from opening.
 */
async function bytesAsText(nativeRoot: string, entry: WalkEntry): Promise<ManifestFile> {
  const read = await readTauriVaultBytes(nativeRoot, entry.relativePath);
  if (!read) return entry.handle.getFile();
  return { lastModified: read.lastModified, text: async () => new TextDecoder().decode(read.bytes) };
}

export async function manifestFile(entry: WalkEntry, nativeRoot: string | null): Promise<ManifestFile> {
  if (entry.kind === 'md' && nativeRoot) {
    try {
      const native = await readTauriVaultTextFile(nativeRoot, entry.relativePath);
      if (native) return { lastModified: native.lastModified, text: async () => native.text };
    } catch (error) {
      if (failureCodeOf(error) !== 'not-utf8') throw error;
      return bytesAsText(nativeRoot, entry);
    }
  }
  return entry.handle.getFile();
}

async function readMarkdownFile(entry: WalkEntry, nativeRoot: string | null, refusedAsNotUtf8 = false): Promise<MarkdownFile> {
  const file = refusedAsNotUtf8 && nativeRoot ? await bytesAsText(nativeRoot, entry) : await manifestFile(entry, nativeRoot);
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
    return mapPooled(reads, fallbackConcurrency, async ({ entry, read }) => {
      if (!read || read.relativePath !== entry.relativePath) return one(entry);
      if (read.text !== null && read.lastModified !== null) return { text: read.text, lastModified: read.lastModified };
      // The frame already says why: a refusal as not UTF-8 goes straight to the bytes.
      return readMarkdownFile(entry, nativeRoot, failureCodeOf(read.error) === 'not-utf8');
    });
  };
}
