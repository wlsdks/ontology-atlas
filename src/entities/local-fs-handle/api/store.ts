/**
 * IndexedDB-backed store for `LocalFsHandleRecord`.
 *
 * Single-record mode (id = 'current') is the default. The legacy key
 * `docs-vault:current-handle`, which held a raw `FileSystemDirectoryHandle`, is
 * migrated into the new record shape on first read and then dropped.
 */

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
  return record.desktopRootPath ?? record.id;
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

async function rememberRecentLocalFsHandle(record: LocalFsHandleRecord): Promise<void> {
  const storedRecord = toStoredRecord(record);
  const identity = recordIdentity(storedRecord);
  const existing = (await idbGet<LocalFsHandleRecord[]>(RECENT_KEY)) ?? [];
  const next = [
    storedRecord,
    ...existing.filter((item) => recordIdentity(item) !== identity),
  ]
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, MAX_RECENT_HANDLES);
  await idbSet(RECENT_KEY, next);
}

/**
 * Reads the record for an id, or undefined.
 *
 * Only for id 'current': a raw handle left under the legacy key is wrapped into a
 * record and migrated, and the legacy key deleted.
 */
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

/** Removes one record from the recent-vault list. The currently open vault record is untouched. */
export async function forgetRecentLocalFsHandle(
  record: LocalFsHandleRecord,
): Promise<void> {
  const identity = recordIdentity(toStoredRecord(record));
  const existing = (await idbGet<LocalFsHandleRecord[]>(RECENT_KEY)) ?? [];
  await idbSet(
    RECENT_KEY,
    existing.filter((item) => recordIdentity(item) !== identity),
  );
}

/** Updates the last-accessed time only. A no-op when the record does not exist. */
export async function touchLocalFsHandle(
  id: string = CURRENT_LOCAL_FS_HANDLE_ID,
): Promise<void> {
  const existing = await idbGet<LocalFsHandleRecord>(recordKey(id));
  if (!existing) return;
  const next = { ...existing, lastAccessedAt: Date.now() };
  await idbSet(recordKey(id), next);
  await rememberRecentLocalFsHandle(next);
}

/** Recently opened vaults. On Tauri desktop the handle shim is rebuilt from the stored path. */
export async function listRecentLocalFsHandles(): Promise<LocalFsHandleRecord[]> {
  const records = (await idbGet<LocalFsHandleRecord[]>(RECENT_KEY)) ?? [];
  return records
    .map(normalizeStoredRecord)
    .filter((record): record is LocalFsHandleRecord => Boolean(record))
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, MAX_RECENT_HANDLES);
}
