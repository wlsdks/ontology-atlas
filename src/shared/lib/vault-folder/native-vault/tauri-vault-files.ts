import { decodeVaultTextFrames, type NativeVaultTextRead } from '../vault-text-frames';
import { getTauriInvoke } from './tauri-vault-runtime';

export interface TauriVaultEntry {
  name: string;
  kind: 'file' | 'directory';
}

export interface TauriTextFile {
  text: string;
  lastModified: number;
}

export async function tauriVaultPathExists(
  rootPath: string,
  kind: 'file' | 'directory' = 'directory',
): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  return invoke<boolean>('vault_path_exists', {
    rootPath,
    relativePath: '',
    kind,
  });
}

/** Complete native publication that never replaces an existing destination. */
export async function createTauriVaultTextFile(rootPath: string, relativePath: string, content: string): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error('Exclusive file creation requires the installed app.');
  const result = await invoke<unknown>('create_vault_text_file', { rootPath, relativePath, content });
  if (typeof result !== 'boolean') throw new Error('The app did not confirm exclusive file creation.');
  return result;
}

/**
 * Files and folders at any depth, including dot trees such as `.claude/skills` the manifest walker
 * skips. A missing path throws; most vaults have no `.claude/`.
 */
export async function listTauriVaultEntries(
  rootPath: string,
  relativePath: string,
): Promise<Array<{ name: string; kind: 'file' | 'directory' }>> {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  return invoke<TauriVaultEntry[]>('list_vault_directory', { rootPath, relativePath });
}

/** One child of a listed folder; a file carries its directory-entry mtime (ms) and length. */
export interface StampedVaultEntry {
  name: string;
  kind: 'file' | 'directory';
  lastModified?: number;
  size?: number;
}

/**
 * One folder's children with each file's stamp, in one call and without reading a byte: what a
 * path delta needs to tell a changed file from an unchanged one. `null` outside the app.
 */
export async function listTauriVaultStamped(rootPath: string, relativePath: string): Promise<StampedVaultEntry[] | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<StampedVaultEntry[]>('list_vault_directory', { rootPath, relativePath, withStamps: true });
}

export async function listTauriVaultLinks(rootPath: string, relativePath: string): Promise<string[]> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error('Listing links requires the installed app.');
  const entries = await invoke<Array<{ name: string; kind: string }>>('list_vault_directory', { rootPath, relativePath, includeLinks: true });
  return entries.filter((entry) => entry.kind === 'symlink').map((entry) => entry.name);
}

export async function readTauriVaultText(
  rootPath: string,
  relativePath: string,
): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const file = await invoke<TauriTextFile>('read_vault_text_file', { rootPath, relativePath });
  return file.text;
}

export async function readTauriVaultTextTail(
  rootPath: string,
  relativePath: string,
  maxLines: number,
): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<string>('read_vault_text_tail', { rootPath, relativePath, maxLines });
}

/** Keeps the mtime `readTauriVaultText` drops, without a second round trip; `null` without the bridge. */
export async function readTauriVaultTextFile(
  rootPath: string,
  relativePath: string,
): Promise<{ text: string; lastModified: number } | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const file = await invoke<TauriTextFile>('read_vault_text_file', { rootPath, relativePath });
  return { text: file.text, lastModified: file.lastModified };
}

export async function readTauriVaultTextFiles(
  rootPath: string,
  relativePaths: readonly string[],
): Promise<NativeVaultTextRead[] | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  const frames = await invoke<ArrayBuffer>('read_vault_text_files', {
    rootPath,
    relativePaths: [...relativePaths],
  });
  return decodeVaultTextFrames(frames);
}

export async function listTauriDirectoryNames(rootPath: string): Promise<string[]> {
  const invoke = getTauriInvoke();
  if (!invoke) return [];
  const entries = await invoke<TauriVaultEntry[]>('list_vault_directory', {
    rootPath,
    relativePath: '',
  });
  return entries.filter((entry) => entry.kind === 'directory').map((entry) => entry.name);
}

export async function ensureTauriChildDirectory(rootPath: string, name: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    throw new Error('Tauri vault runtime is not available.');
  }
  await invoke('ensure_vault_directory', { rootPath, relativePath: name });
}
