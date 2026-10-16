import type { DesktopBridge } from '@/lib/desktop';

/**
 * The phone (browser) version of the desktop shell's functions: the closet is kept in the
 * browser's own database (IndexedDB) on this device, nothing is sent anywhere.
 *   kv/db       closet.json as text
 *   photos/<n>  each picture as a Blob
 * Pictures are shown through blob: URLs made once at start-up (see photoUrls).
 */

const DB_NAME = 'closet';

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
      req.result.createObjectStore('photos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the closet storage.'));
  });
  return opening;
}

async function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = work(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('Could not save on this device.'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving was stopped (is the device full?).'));
  });
}

/** blob: URL of every stored picture, by name. */
export const photoUrls = new Map<string, string>();

const typeOf = (name: string) =>
  name.endsWith('.webp') ? 'image/webp' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/png';

function download(name: string, bytes: Uint8Array) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const browserBridge: DesktopBridge = {
  async loadDb() {
    // Ask the browser not to clear the closet when the device runs low on space.
    navigator.storage?.persist?.().catch(() => {});
    const [json, names, blobs] = await Promise.all([
      run<string | undefined>('kv', 'readonly', (s) => s.get('db')),
      run<IDBValidKey[]>('photos', 'readonly', (s) => s.getAllKeys()),
      run<Blob[]>('photos', 'readonly', (s) => s.getAll()),
    ]);
    names.forEach((name, i) => photoUrls.set(String(name), URL.createObjectURL(blobs[i])));
    return json ?? null;
  },
  async saveDb(json) {
    await run('kv', 'readwrite', (s) => s.put(json, 'db'));
  },
  async savePhoto(name, bytes) {
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: typeOf(name) });
    await run('photos', 'readwrite', (s) => s.put(blob, name));
    const old = photoUrls.get(name);
    if (old) URL.revokeObjectURL(old);
    photoUrls.set(name, URL.createObjectURL(blob));
  },
  async readPhoto(name) {
    const blob = await run<Blob | undefined>('photos', 'readonly', (s) => s.get(name));
    if (!blob) throw new Error(`Missing photo ${name}`);
    return new Uint8Array(await blob.arrayBuffer());
  },
  async deletePhoto(name) {
    await run('photos', 'readwrite', (s) => s.delete(name));
    const url = photoUrls.get(name);
    if (url) URL.revokeObjectURL(url);
    photoUrls.delete(name);
  },
  // Phones: the file goes to Downloads (iPhone: Files app → Downloads), ready to share or keep.
  async exportFile(defaultName, bytes) {
    download(defaultName, bytes);
    return defaultName;
  },
  async importFile() {
    const file = await chooseFile('.zip,application/zip');
    return file ? new Uint8Array(await file.arrayBuffer()) : null;
  },
  async openDataFolder() {
    return '';
  },
  async getDataFolder() {
    return { path: '', isDefault: true, canChange: false };
  },
  async changeDataFolder() {
    return false;
  },
};
