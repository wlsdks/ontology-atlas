import type { Page } from "@playwright/test";

/**
 * The IndexedDB database an earlier website kept its remembered folder in, which the browser's cleanup
 * empties of browser folder handles only. Shared by the public page's test and the app's.
 */
export const OLD_STORE = { database: "demo-kv", store: "kv" } as const;

/** Writes entries into the database an earlier website kept its remembered folder in. */
export async function seedOldStore(page: Page, entries: Array<{ key: string; kind: "browser-folder" | "app-folder" | "other" }>) {
  await page.evaluate(
    async ({ database, store, entries: seeded }) => {
      const opfs = await navigator.storage.getDirectory();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(database, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(store);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        for (const { key, kind } of seeded) {
          const weight = new Uint8Array(200_000);
          const value =
            kind === "browser-folder"
              ? { id: "current", handle: opfs, name: "old folder", weight }
              : kind === "app-folder"
                ? { id: "current", handle: { name: "app folder" }, desktopRootPath: "/Users/probe/atlas-vault", weight }
                : { weight };
          tx.objectStore(store).put(value, key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { ...OLD_STORE, entries },
  );
}

/** What the old database still holds: each key with the bytes it keeps. */
export async function readOldStore(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async ({ database, store }) => {
    const known = await indexedDB.databases();
    if (!known.some((entry) => entry.name === database)) return {};
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(database, 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const kept: Record<string, number> = {};
    await new Promise<void>((resolve, reject) => {
      const walk = db.transaction(store, "readonly").objectStore(store).openCursor();
      walk.onsuccess = () => {
        const cursor = walk.result;
        if (!cursor) return resolve();
        kept[String(cursor.key)] = (cursor.value as { weight?: Uint8Array }).weight?.byteLength ?? 0;
        cursor.continue();
      };
      walk.onerror = () => reject(walk.error);
    });
    db.close();
    return kept;
  }, OLD_STORE);
}
