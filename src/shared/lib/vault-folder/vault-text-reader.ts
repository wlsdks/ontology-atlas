import {
  readTauriVaultTextFile,
  readTauriVaultTextFiles,
  type NativeVaultTextRead,
} from './tauri-vault-fs';

/** A document the folder's walk listed: its slug and the vault-relative path it came from. */
export interface VaultTextRef {
  slug: string;
  path: string;
}

/**
 * Reads only documents the folder's walk handed a file to, at the path the walk derived the slug
 * from, so a path a page supplies never reaches outside the granted folder.
 */
function isGranted(doc: VaultTextRef, fileHandles: ReadonlyMap<string, FileSystemFileHandle>): boolean {
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
 * With `nativeRoot` (the app's open folder) a batch is one bridge call, Rust checking scope again,
 * and a file whose frame carries an error is read once more on its own; the web reads each handle.
 * `null` stands for a document that could not be read.
 */
export function createVaultTextReader(
  nativeRoot: string | null,
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>,
) {
  return async (docs: readonly VaultTextRef[]): Promise<(string | null)[]> => {
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
