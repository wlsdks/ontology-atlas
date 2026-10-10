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
 * (Desktop) Preflight for reopening a recent Tauri vault: does the stored absolute path
 * still resolve to a directory? False when the folder chosen in an earlier session has
 * since moved or been deleted. This desktop-only path reopens by absolute path with no
 * FSA picker, and this classifies the common "folder vanished" failure as a readable
 * 'path-missing'. Non-Tauri runtimes and records without a path are not preflight
 * candidates and short-circuit to true — their handles carry their own permission.
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

/**
 * Applies the project → `atlas/` rule to every desktop ingress, not only the picker.
 *
 * The picker adopted this rule first, but recent-vault reopening and cold restore kept loading
 * their stored project-root handles directly. A project containing `atlas/*.md` could therefore
 * be read as the project plus every frontmatter-bearing Markdown file around it, while a manual
 * picker open read only `atlas/`. One stored project must not mean two vaults depending on ingress.
 */
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
 * Capability is decided by **whether it can be called**, not by `in`. `'showDirectoryPicker'
 * in window` is true whenever the key exists, so in an environment where the value is
 * `undefined` (an extension, a polyfill, a browser stub) `isSupported()` returned true and
 * the picker call then threw a raw JavaScript `is not a function` error — which was
 * rendered in red in the product's single indigo primary CTA slot (entry review E-1).
 * If it cannot be called it is unsupported, and the existing path degrades honestly instead.
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
