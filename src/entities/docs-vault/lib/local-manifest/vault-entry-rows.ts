import {
  getVaultRows,
  isFramedVaultRowPath,
  putVaultRows,
  vaultRowsAvailable,
  type VaultRowWrite,
} from '@/shared/lib/vault-folder/tauri-vault-index-rows';
import { mdEntryRowValue, storedMdEntry, type BuiltVaultEntry } from './md-entry';
import type { WalkEntry } from './walk-vault';

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

export interface RowSource {
  /** Entries from stored rows, aligned with `indices`; `undefined` where the file must be read. */
  take(indices: readonly number[]): Promise<Array<BuiltVaultEntry | undefined>>;
  keep(index: number, entry: BuiltVaultEntry): void;
  finish(walkComplete: boolean): void;
}

/**
 * Looks up stored rows in read order, a chunk at a time and a little ahead of the reads, and
 * writes new rows behind the build in batches. Any failure only means more files are read.
 */
export function createRowSource(
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
