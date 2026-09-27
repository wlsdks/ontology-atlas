/** IndexedDB store for `LocalFsHandleRecord`; the legacy raw-handle key migrates on first read. */

import { idbDel, idbGet, idbSet } from '@/shared/lib/idb-kv';
import {
  createTauriVaultHandle,
  getTauriVaultRootPath,
  isTauriVaultRuntime,
} from '@/shared/lib/tauri-vault-fs';
import type { LocalFsHandleRecord } from '../model/types';

export const CURRENT_LOCAL_FS_HANDLE_ID = 'current';

const KEY_PREFIX = 'docs-vault:fs-handle:';
const LEGACY_KEY = 'docs-vault:current-handle';
const RECENT_KEY = 'docs-vault:fs-handle:recent';
const MAX_RECENT_HANDLES = 5;

function recordKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function canUseStoredRecord(record: LocalFsHandleRecord): boolean {
  return !record.desktopRootPath || isTauriVaultRuntime();
}

function normalizeStoredRecord(record: LocalFsHandleRecord): LocalFsHandleRecord | undefined {
  if (!canUseStoredRecord(record)) return undefined;
  if (record.desktopRootPath) {
    return {
      ...record,
      handle: createTauriVaultHandle(record.desktopRootPath),
    };
  }
  return record;
}

function recordIdentity(record: LocalFsHandleRecord): string {
  // Web records all use id 'current', so the folder name is the identity; same-named folders still collapse.
  if (record.desktopRootPath) return record.desktopRootPath;
  const folderName = record.handle?.name;
  return folderName ? `fsa:${folderName}` : record.id;
}

function toStoredRecord(record: LocalFsHandleRecord): LocalFsHandleRecord {
  const desktopRootPath = getTauriVaultRootPath(record.handle) ?? record.desktopRootPath;
  if (desktopRootPath) {
    return {
      ...record,
      desktopRootPath,
      handle: { name: record.handle.name },
    } as unknown as LocalFsHandleRecord;
  }
  return record;
}

/**
 * Serializes recent-list read-modify-writes: a lost entry changes the launch rule. The queue lives
 * here because awaiting at the call sites broke rename and `?edit=` timing.
 */
let recentListWrites: Promise<unknown> = Promise.resolve();

function queueRecentListWrite<T>(operation: () => Promise<T>): Promise<T> {
  // `then(op, op)` so a rejected predecessor does not cancel the next write.
  const run = recentListWrites.then(operation, operation);
  // The chain itself must never hold a rejection, or every later write inherits it.
  recentListWrites = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function rememberRecentLocalFsHandle(record: LocalFsHandleRecord): Promise<void> {
  const storedRecord = toStoredRecord(record);
  const identity = recordIdentity(storedRecord);
  return queueRecentListWrite(async () => {
    const existing = (await idbGet<LocalFsHandleRecord[]>(RECENT_KEY)) ?? [];
    const next = [
      storedRecord,
      ...existing.filter((item) => recordIdentity(item) !== identity),
    ]
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
      .slice(0, MAX_RECENT_HANDLES);
    await idbSet(RECENT_KEY, next);
  });
}

/** For id 'current', a legacy raw handle is migrated and its key deleted. */
export async function getLocalFsHandle(
  id: string = CURRENT_LOCAL_FS_HANDLE_ID,
): Promise<LocalFsHandleRecord | undefined> {
  const stored = await idbGet<LocalFsHandleRecord>(recordKey(id));
  if (stored) return normalizeStoredRecord(stored);

  if (id === CURRENT_LOCAL_FS_HANDLE_ID) {
    const legacy = await idbGet<FileSystemDirectoryHandle>(LEGACY_KEY);
    if (legacy) {
      const now = Date.now();
      const migrated: LocalFsHandleRecord = {
        id: CURRENT_LOCAL_FS_HANDLE_ID,
        handle: legacy,
        name: legacy.name,
        createdAt: now,
        lastAccessedAt: now,
      };
      await idbSet(recordKey(CURRENT_LOCAL_FS_HANDLE_ID), migrated);
      await rememberRecentLocalFsHandle(migrated);
      await idbDel(LEGACY_KEY);
      return migrated;
    }
  }
  return undefined;
}

export async function putLocalFsHandle(record: LocalFsHandleRecord): Promise<void> {
  const storedRecord = toStoredRecord(record);
  await idbSet(recordKey(record.id), storedRecord);
  await rememberRecentLocalFsHandle(storedRecord);
}

export async function deleteLocalFsHandle(
  id: string = CURRENT_LOCAL_FS_HANDLE_ID,
): Promise<void> {
  await idbDel(recordKey(id));
}

/** The open vault's record is untouched. */
export async function forgetRecentLocalFsHandle(
  record: LocalFsHandleRecord,
): Promise<void> {
  const identity = recordIdentity(toStoredRecord(record));
  // Queued too, or a racing load could resurrect the removed folder.
  return queueRecentListWrite(async () => {
    const existing = (await idbGet<LocalFsHandleRecord[]>(RECENT_KEY)) ?? [];
    await idbSet(
      RECENT_KEY,
      existing.filter((item) => recordIdentity(item) !== identity),
    );
  });
}

/** No-op without a record. */
export async function touchLocalFsHandle(
  id: string = CURRENT_LOCAL_FS_HANDLE_ID,
): Promise<void> {
  const existing = await idbGet<LocalFsHandleRecord>(recordKey(id));
  if (!existing) return;
  const next = { ...existing, lastAccessedAt: Date.now() };
  await idbSet(recordKey(id), next);
  await rememberRecentLocalFsHandle(next);
}

/** Writes folder contents to both the record and its recent entry, which different screens read; no-op without a record. */
export async function recordLocalFsHandleContents(
  contents: { docCount: number; conceptCount: number },
  id: string = CURRENT_LOCAL_FS_HANDLE_ID,
): Promise<void> {
  const existing = await idbGet<LocalFsHandleRecord>(recordKey(id));
  if (!existing) return;
  const next: LocalFsHandleRecord = {
    ...existing,
    docCount: contents.docCount,
    conceptCount: contents.conceptCount,
    countedAt: Date.now(),
  };
  await idbSet(recordKey(id), next);
  await rememberRecentLocalFsHandle(next);
}

/** On Tauri the handle shim is rebuilt from the stored path. */
export async function listRecentLocalFsHandles(): Promise<LocalFsHandleRecord[]> {
  const records = (await idbGet<LocalFsHandleRecord[]>(RECENT_KEY)) ?? [];
  return records
    .map(normalizeStoredRecord)
    .filter((record): record is LocalFsHandleRecord => Boolean(record))
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, MAX_RECENT_HANDLES);
}
