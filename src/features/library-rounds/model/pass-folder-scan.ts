import { isNotFoundError } from '@/shared/lib/vault-folder/vault-sidecar';

import { pageIdentity, type PassScan } from './pass-pages';

async function isMissing(vault: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  try {
    const parts = path.split('/');
    const name = parts.pop() ?? '';
    let directory = vault;
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
    await directory.getFileHandle(name);
    return false;
  } catch (error) {
    return isNotFoundError(error);
  }
}

export function readOrMissing(vault: FileSystemDirectoryHandle, read: (path: string) => Promise<string | null>) {
  return async (path: string): Promise<string | null> => {
    try {
      return await read(path);
    } catch (error) {
      if (await isMissing(vault, path)) return null;
      throw error;
    }
  };
}

export async function scanPassFolders(
  vault: FileSystemDirectoryHandle,
  linksIn: (directory: string) => Promise<string[]>,
): Promise<Required<Pick<PassScan, 'dirs' | 'links'>> & { pages: { path: string; text: string | null }[] }> {
  const pages: { path: string; text: string | null }[] = [];
  const dirs: string[] = [];
  const links: string[] = [];
  const walk = async (directory: FileSystemDirectoryHandle, prefix: string, readPages: boolean) => {
    dirs.push(prefix);
    for (const name of await linksIn(prefix)) links.push(`${prefix}/${name}`);
    for await (const [name, entry] of (directory as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (name.startsWith('.')) continue;
      const path = `${prefix}/${name}`;
      if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, path, readPages);
      else if (readPages && name.toLowerCase().endsWith('.md')) {
        pages.push({ path, text: await (entry as FileSystemFileHandle).getFile().then((file) => file.text(), () => null) });
      }
    }
  };
  const rootLinks = new Set((await linksIn('')).map(pageIdentity));
  for (const [folder, readPages] of [['wiki', true], ['sources', false]] as const) {
    if (rootLinks.has(pageIdentity(folder))) {
      links.push(folder);
      continue;
    }
    let directory: FileSystemDirectoryHandle;
    try {
      directory = await vault.getDirectoryHandle(folder);
    } catch (error) {
      if (isNotFoundError(error)) continue;
      throw error;
    }
    await walk(directory, folder, readPages);
  }
  return { pages, dirs, links };
}

