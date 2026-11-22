import { createTauriVaultHandle } from './tauri-vault-handle';
import { getTauriInvoke } from './tauri-vault-runtime';

/** Selects one vault file in Finder. Reveal, never open: Atlas launches no program. */
export async function revealTauriVaultFile(
  rootPath: string,
  relativePath: string,
): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  await invoke('reveal_vault_file', { rootPath, relativePath });
  return true;
}

/**
 * `pick_vault_directory` refuses a root with a code (`filesystem-root`, `home-directory`,
 * `system-directory`), not a sentence, so the screen picks its own language.
 */
const VAULT_ROOT_REJECTED_PREFIX = 'vault-root-rejected:';

export function vaultRootRejectionReason(error: unknown): string | null {
  const text =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : null;
  if (!text) return null;
  const at = text.indexOf(VAULT_ROOT_REJECTED_PREFIX);
  if (at < 0) return null;
  return text.slice(at + VAULT_ROOT_REJECTED_PREFIX.length).trim() || null;
}

export async function pickTauriVaultDirectory(
  dialogTitle?: string,
): Promise<FileSystemDirectoryHandle | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const rootPath = await invoke<string | null>(
    'pick_vault_directory',
    dialogTitle ? { dialogTitle } : undefined,
  );
  return rootPath ? createTauriVaultHandle(rootPath) : null;
}

export async function openTauriVaultInFinder(rootPath: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    throw new Error('Tauri vault runtime is not available.');
  }
  await invoke('open_vault_in_finder', { rootPath });
}

/**
 * Creates `~/Documents/Ontology Atlas` if absent and returns it: JS cannot learn the Documents
 * path without an fs plugin. `null` outside Tauri.
 */
export async function ensureDefaultVaultParentDir(): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<string>('ensure_default_vault_parent_dir');
}
