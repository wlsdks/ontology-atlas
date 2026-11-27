import { createDocumentStore, type DocumentRef, type DocumentStore } from '@/entities/docs-vault';
import type { GrantedVaultFiles } from '@/entities/vault-session';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { createVaultTextReader } from '@/shared/lib/vault-folder/vault-text-reader';

export interface ResolvedDocumentStore {
  store: DocumentStore;
  origin: object;
}

/*
 * Keyed weakly by the build's handle map: a folder switch or a rebuild leaves the old store, its
 * cache and its handles unreachable, so nothing of an earlier folder outlives it.
 */
const localStores = new WeakMap<ReadonlyMap<string, FileSystemFileHandle>, DocumentStore>();

function localStoreFor({ root, fileHandles }: GrantedVaultFiles): DocumentStore {
  let store = localStores.get(fileHandles);
  if (!store) {
    const nativeRoot = getTauriVaultRootPath(root) ?? null;
    store = createDocumentStore({ readTexts: createVaultTextReader(nativeRoot, fileHandles) });
    localStores.set(fileHandles, store);
  }
  return store;
}

/** `null`: no folder is open or the document has no file stamp, so nothing can read it now. */
export function documentStoreFor(
  doc: DocumentRef,
  local: GrantedVaultFiles | null,
): ResolvedDocumentStore | null {
  if (doc.mtime === undefined || !local) return null;
  return { store: localStoreFor(local), origin: local.root };
}
