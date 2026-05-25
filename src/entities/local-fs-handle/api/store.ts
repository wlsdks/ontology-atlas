/**
 * IndexedDB-backed store for `LocalFsHandleRecord`.
 *
 * 단일 record 모드 (id = 'current') 가 default. 과거 docs-vault-local 이
 * 직접 raw `FileSystemDirectoryHandle` 만 저장하던 키 (`docs-vault:current-handle`)
 * 는 첫 read 시 자동으로 새 record 형태로 마이그레이션 후 폐기.
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

function normalizeStoredRecord(record: LocalFsHandleRecord): LocalFsHandleRecord {
  if (record.desktopRootPath && isTauriVaultRuntime()) {
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
 * id 에 해당하는 record 를 읽는다. 없으면 undefined.
 *
 * id 가 'current' 일 때만, legacy 키에 raw 핸들이 남아있으면 record 로
 * 감싸서 마이그레이션 (legacy 키는 삭제).
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

/** 최근 vault 목록에서 특정 record 를 제거한다. 현재 열린 vault record 는 건드리지 않는다. */
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

/** 마지막 접근 시각만 갱신. record 자체가 없으면 no-op. */
export async function touchLocalFsHandle(
  id: string = CURRENT_LOCAL_FS_HANDLE_ID,
): Promise<void> {
  const existing = await idbGet<LocalFsHandleRecord>(recordKey(id));
  if (!existing) return;
  const next = { ...existing, lastAccessedAt: Date.now() };
  await idbSet(recordKey(id), next);
  await rememberRecentLocalFsHandle(next);
}

/** 최근에 열었던 vault 목록. Tauri desktop 은 저장된 경로로 handle shim 을 복원한다. */
export async function listRecentLocalFsHandles(): Promise<LocalFsHandleRecord[]> {
  const records = (await idbGet<LocalFsHandleRecord[]>(RECENT_KEY)) ?? [];
  return records
    .map(normalizeStoredRecord)
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, MAX_RECENT_HANDLES);
}
