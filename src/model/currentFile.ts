/* File and folder handles the user picked (Chrome, Edge), kept in IndexedDB so they survive a reload: browsers allow
   storing such handles there (not in localStorage). Writing again asks the user's permission once per visit.
   Failures are ignored: the caller then asks the user again. */

const DB = 'topico-files';
const STORE = 'handles';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export const loadHandle = <H>(key: string) => run<H>('readonly', (s) => s.get(key));
export const storeHandle = (key: string, h: unknown) => (h ? run('readwrite', (s) => s.put(h, key)) : run('readwrite', (s) => s.delete(key)));

/** The current file: Save writes over it. */
export const loadCurrentFile = <H>() => loadHandle<H>('current');
export const storeCurrentFile = (h: unknown) => storeHandle('current', h);
