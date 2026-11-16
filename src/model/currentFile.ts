import { create } from 'zustand';

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

/** A file picked with the browser's file pickers (File System Access API: not in TypeScript's DOM types). */
export interface FileHandle {
  name: string;
  kind?: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}

/** The browser has the file pickers but refuses them (SecurityError): a setting or a company policy blocks file
    access for this site (Edge: "File editing" permission, DefaultFileSystemRead/WriteGuardSetting policies). The app
    then falls back to the classic file input and downloads, as in browsers without the pickers. */
export const useFsaBlocked = create<{ blocked: boolean }>(() => ({ blocked: false }));
export const isFsaBlocked = (e: unknown) => (e as Error)?.name === 'SecurityError' || (e as Error)?.name === 'NotAllowedError';
export const FSA_BLOCKED_HELP =
  'This browser blocks access to files and folders for this site, often because of a company policy (in Edge: Settings → Cookies and site permissions → File editing, or the DefaultFileSystemReadGuardSetting / DefaultFileSystemWriteGuardSetting policies, see edge://policy). Edge in InPrivate or Application Guard can block it too.';

/** The current file, shared by the toolbar (Open, Save) and the Collaborate panel (a file picked in the room's folder). */
export const useCurrentFile = create<{ handle: FileHandle | null }>(() => ({ handle: null }));
export const setCurrentFile = (h: FileHandle | null) => {
  useCurrentFile.setState({ handle: h });
  void storeCurrentFile(h);
};
// Restored after a reload, like the diagram itself.
if (typeof indexedDB !== 'undefined') void loadCurrentFile<FileHandle>().then((h) => h && !useCurrentFile.getState().handle && useCurrentFile.setState({ handle: h }));
