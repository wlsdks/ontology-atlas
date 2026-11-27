export const DB_NAME = 'demo-kv';
const DB_VERSION = 1;
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new DOMException('IndexedDB read aborted', 'AbortError'));
    }).finally(() => db.close());
  } catch {
    return undefined;
  }
}

async function writeTransaction(operation: (store: IDBObjectStore) => void): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        operation(tx.objectStore(STORE));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new DOMException('IndexedDB write aborted', 'AbortError'));
      });
    } finally {
      db.close();
    }
  } catch {
    /* Preference writes remain best-effort when storage is unavailable. */
  }
}

export function idbSet<T>(key: string, value: T): Promise<void> {
  return writeTransaction((store) => { store.put(value, key); });
}

export function idbDel(key: string): Promise<void> {
  return writeTransaction((store) => { store.delete(key); });
}

export type IdbRewrite = { action: 'keep' } | { action: 'delete' } | { action: 'set'; value: unknown };

/**
 * Walks every entry once, in one transaction, and keeps, deletes or replaces it. A database that does
 * not exist yet is not created: there is nothing to walk.
 */
export async function idbRewriteAll(rewrite: (key: string, value: unknown) => IdbRewrite): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return;
    if (typeof indexedDB.databases === 'function') {
      const known = await indexedDB.databases();
      if (!known.some((entry) => entry.name === DB_NAME)) return;
    }
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const walk = store.openCursor();
        walk.onsuccess = () => {
          const cursor = walk.result;
          if (!cursor) return;
          const verdict = rewrite(String(cursor.key), cursor.value);
          if (verdict.action === 'delete') cursor.delete();
          else if (verdict.action === 'set') cursor.update(verdict.value);
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new DOMException('IndexedDB rewrite aborted', 'AbortError'));
      });
    } finally {
      db.close();
    }
  } catch {
    /* Cleanup stays best-effort: a store that cannot be opened holds nothing this page can read either. */
  }
}
