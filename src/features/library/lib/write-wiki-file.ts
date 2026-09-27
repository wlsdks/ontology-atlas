import { createTauriVaultTextFile, getTauriVaultRootPath } from '@/shared/lib/tauri-vault-fs';
import { WIKI_DIR } from '@/shared/lib/wiki-page-schema';

/** Removes a file the app just wrote (a toast's undo); folders created on the way stay. */
export async function deleteWikiFile(vault: FileSystemDirectoryHandle, relPath: string): Promise<void> {
  const parts = relPath.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error("a file needs a name");
  let dir = vault;
  for (const part of parts) dir = await dir.getDirectoryHandle(part);
  await dir.removeEntry(fileName);
}

/** Writes one app-composed file whole, creating folders on the way; a partial write tears a page. */
export async function writeWikiFile(
  vault: FileSystemDirectoryHandle,
  relPath: string,
  text: string,
): Promise<void> {
  const parts = relPath.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error("a file needs a name");
  let dir = vault;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  const file = await dir.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Native-only create: File System Access has no equivalent atomic no-clobber operation. */
export async function createWikiFile(vault: FileSystemDirectoryHandle, relPath: string, text: string): Promise<boolean> {
  const rootPath = getTauriVaultRootPath(vault);
  if (!rootPath) throw new Error('Exclusive answer filing requires the installed app.');
  const parts = relPath.split('/');
  const fileName = parts.pop();
  if (!fileName?.endsWith('.md') || parts[0] !== WIKI_DIR || parts.some((part) => !part || part === '.' || part === '..') || /[\\\0]/.test(relPath)) {
    throw new Error('A new wiki page needs a vault-relative Markdown path.');
  }
  let directory = vault;
  for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
  // Never call getFileHandle(create:true): that would publish an empty destination
  // before the native operation can create it exclusively.
  return createTauriVaultTextFile(rootPath, relPath, text);
}
