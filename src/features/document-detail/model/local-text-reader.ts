import type { DocumentRef } from '@/entities/docs-vault';
import {
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  readTauriVaultTextFile,
  readTauriVaultTextFiles,
  type NativeVaultTextRead,
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

async function readOneNative(nativeRoot: string, path: string): Promise<string | null> {
  try {
    return (await readTauriVaultTextFile(nativeRoot, path))?.text ?? null;
  } catch {
    return null;
  }
}

/**
 * The app reads a batch in one bridge call (Rust checks scope again) and reads a file whose frame
 * carries an error once more on its own, as the build does; the web reads each handle.
 */
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
    let reads: NativeVaultTextRead[] = [];
    if (paths.length > 0) {
      try {
        reads = (await readTauriVaultTextFiles(nativeRoot, paths)) ?? [];
      } catch {
        reads = [];
      }
    }
    const textByPath = new Map(reads.map((read) => [read.relativePath, read.text]));
    return Promise.all(
      docs.map((doc, index) => {
        if (!granted[index]) return null;
        const text = textByPath.get(doc.path);
        return typeof text === 'string' ? text : readOneNative(nativeRoot, doc.path);
      }),
    );
  };
}
