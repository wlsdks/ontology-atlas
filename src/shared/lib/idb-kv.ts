/** IndexedDB storage for structured-cloneable preferences and folder handles. */
const DB_NAME = 'demo-kv';
const DB_VERSION = 1;
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
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
