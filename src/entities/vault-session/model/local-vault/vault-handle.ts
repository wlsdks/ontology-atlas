import { verifyHandlePermission, type LocalFsHandleRecord } from '@/entities/local-fs-handle';
import {
  createTauriVaultHandle,
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  listTauriDirectoryNames,
  tauriVaultPathExists,
} from '@/shared/lib/tauri-vault-fs';
import { resolvePickedVaultFolder } from './resolve-picked-vault-folder';

/**
 * (Desktop) Does the stored absolute path still resolve to a directory? False means the folder
 * moved or was deleted; non-Tauri runtimes and records without a path short-circuit to true.
 */
type VaultRecordResolution = 'ok' | 'missing' | 'grant-needed';

export async function tauriVaultRecordResolves(
  record: LocalFsHandleRecord,
): Promise<VaultRecordResolution> {
  if (!isTauriVaultRuntime()) return 'ok';
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
  /** The project root the person chose or previously stored, when its `atlas/` child won. */
  redirectedFrom: string | null;
}

/** Applies the project → `atlas/` rule to every desktop ingress, not only the picker. */
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

/**
 * Capability is decided by whether `showDirectoryPicker` can be called, not by `in`: a stubbed
 * key must read as unsupported, not throw `is not a function`.
 */
export function isSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const picker = (window as unknown as { showDirectoryPicker?: unknown })
    .showDirectoryPicker;
  return typeof picker === 'function' || isTauriVaultRuntime();
}

export function verifyRead(
  handle: FileSystemDirectoryHandle,
  ask = false,
): Promise<'granted' | 'prompt' | 'denied'> {
  return verifyHandlePermission(handle, 'read', { ask });
}
