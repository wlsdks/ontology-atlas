import { getTauriInvoke } from './tauri-vault-runtime';

export interface TauriLibraryCollectionsWriteResult {
  written: boolean;
  currentContent: string | null;
}

/** Reads the vault-local collection file through the native no-follow boundary. */
export async function readTauriLibraryCollections(rootPath: string): Promise<string | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<string | null>('read_library_collections', { rootPath });
}

/** Compare-before-save for the one vault-local collection metadata file. */
export async function writeTauriLibraryCollections(
  rootPath: string,
  expectedContent: string | null,
  content: string,
): Promise<TauriLibraryCollectionsWriteResult | null> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;
  return invoke<TauriLibraryCollectionsWriteResult>('write_library_collections', {
    rootPath,
    expectedContent,
    content,
  });
}
