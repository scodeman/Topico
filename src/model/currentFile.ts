/* The current file (Chrome, Edge): the file handle last opened or saved with the browser's file pickers, kept in
   IndexedDB so that Save still writes to it after a reload. Browsers allow storing file handles there (not in
   localStorage). Writing again asks the user's permission once per visit. Failures are ignored: Save then asks where. */

const DB = 'topico-files';
const STORE = 'handles';
const KEY = 'current';

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

export const loadCurrentFile = <H>() => run<H>('readonly', (s) => s.get(KEY));
export const storeCurrentFile = (h: unknown) => (h ? run('readwrite', (s) => s.put(h, KEY)) : run('readwrite', (s) => s.delete(KEY)));
