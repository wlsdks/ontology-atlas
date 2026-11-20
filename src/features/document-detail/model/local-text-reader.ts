import type { DocumentRef } from '@/entities/docs-vault';
import {
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  readTauriVaultTextFiles,
} from '@/shared/lib/vault-folder/tauri-vault-fs';

/**
 * Reads only documents the folder's walk handed a file to, at the path the walk derived the slug
 * from, so a path a page supplies never reaches outside the granted folder.
 */
function isGranted(doc: DocumentRef, fileHandles: ReadonlyMap<string, FileSystemFileHandle>): boolean {
  return fileHandles.has(doc.slug) && doc.path === `${doc.slug}.md`;
}

async function readThroughHandle(handle: FileSystemFileHandle | undefined): Promise<string | null> {
  if (!handle) return null;
  try {
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

/** The app reads a batch in one bridge call (Rust checks scope again); the web reads each handle. */
export function createLocalTextReader(
  root: FileSystemDirectoryHandle,
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>,
) {
  const nativeRoot = isTauriVaultRuntime() ? getTauriVaultRootPath(root) : undefined;
  return async (docs: readonly DocumentRef[]): Promise<(string | null)[]> => {
    const granted = docs.map((doc) => isGranted(doc, fileHandles));
    if (!nativeRoot) {
      return Promise.all(docs.map((doc, index) => (granted[index] ? readThroughHandle(fileHandles.get(doc.slug)) : null)));
    }
    const paths = docs.filter((_, index) => granted[index]).map((doc) => doc.path);
    const reads = paths.length > 0 ? ((await readTauriVaultTextFiles(nativeRoot, paths)) ?? []) : [];
    const textByPath = new Map(reads.map((read) => [read.relativePath, read.text]));
    return docs.map((doc, index) => (granted[index] ? (textByPath.get(doc.path) ?? null) : null));
  };
}
