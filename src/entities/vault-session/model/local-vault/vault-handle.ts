import { verifyHandlePermission, type LocalFsHandleRecord } from '@/entities/local-fs-handle';
import {
  listTauriDirectoryNames,
  tauriVaultPathExists,
} from '@/shared/lib/vault-folder/native-vault/tauri-vault-files';
import { createTauriVaultHandle } from '@/shared/lib/vault-folder/native-vault/tauri-vault-handle';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { resolvePickedVaultFolder } from './resolve-picked-vault-folder';

/**
 * Does the stored absolute path still resolve to a directory? `missing` means the folder moved or
 * was deleted; a record without a path has nothing to check and resolves.
 */
type VaultRecordResolution = 'ok' | 'missing' | 'grant-needed';

export async function tauriVaultRecordResolves(
  record: LocalFsHandleRecord,
): Promise<VaultRecordResolution> {
  const rootPath = record.desktopRootPath ?? getTauriVaultRootPath(record.handle);
  if (!rootPath) return 'ok';
  try {
    return (await tauriVaultPathExists(rootPath, 'directory')) ? 'ok' : 'missing';
  } catch (error) {
    // A real folder the user has not re-granted since the access-scope update refuses
    // with this code: the folder is present, so it is access to re-confirm, not a loss.
    // Any other failure (a canonicalize error, say) is treated as gone.
    const text = error instanceof Error ? error.message : String(error);
    return text.includes('not-granted') ? 'grant-needed' : 'missing';
  }
}

interface ResolvedVaultHandle {
  handle: FileSystemDirectoryHandle;
  redirectedFrom: string | null;
}

export async function resolveVaultHandle(handle: FileSystemDirectoryHandle): Promise<ResolvedVaultHandle> {
  const pickedPath = getTauriVaultRootPath(handle);
  if (!pickedPath) return { handle, redirectedFrom: null };

  const resolved = await resolvePickedVaultFolder(pickedPath, async (candidate) => {
    try {
      return await listTauriDirectoryNames(candidate);
    } catch {
      return null;
    }
  });
  if (!resolved.redirected) return { handle, redirectedFrom: null };
  return {
    handle: createTauriVaultHandle(resolved.rootPath),
    redirectedFrom: pickedPath,
  };
}

export function verifyRead(
  handle: FileSystemDirectoryHandle,
  ask = false,
): Promise<'granted' | 'prompt' | 'denied'> {
  return verifyHandlePermission(handle, 'read', { ask });
}
