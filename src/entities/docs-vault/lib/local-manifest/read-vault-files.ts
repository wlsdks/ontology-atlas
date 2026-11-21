/** Reads vault files with bounded concurrency, in native batches in the app, and falls back to one read at a time. */

import {
  readTauriVaultTextFile,
  readTauriVaultTextFiles,
  type NativeVaultTextRead,
} from '@/shared/lib/vault-folder/tauri-vault-fs';
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


export async function manifestFile(entry: WalkEntry, nativeRoot: string | null): Promise<Pick<File, 'lastModified' | 'text'>> {
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
