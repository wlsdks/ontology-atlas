/**
 * The IndexedDB database an earlier website kept its remembered folder in
 * (`src/shared/lib/vault-folder/idb-kv.ts`). The installed app still keeps its own record there, so
 * only a plain browser deletes it. Deleting it does not touch any folder on disk.
 */
const BROWSER_FOLDER_DATABASE = "demo-kv";

/** Resolves once the database is gone, or when another open tab holds it and the deletion waits. */
export function forgetOldBrowserFolders(): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(BROWSER_FOLDER_DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
