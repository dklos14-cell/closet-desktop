import { browserBridge, photoUrls } from '@/lib/browser-store';

/**
 * Where the closet is kept. In the desktop app (Electron) these functions come from
 * electron/preload.js and use the closet folder; on a phone or in a browser, browser-store.ts
 * keeps the closet in the browser's own storage on that device.
 */
export type DesktopBridge = {
  loadDb(): Promise<string | null>;
  saveDb(json: string): Promise<void>;
  savePhoto(name: string, bytes: Uint8Array): Promise<void>;
  readPhoto(name: string): Promise<Uint8Array>;
  deletePhoto(name: string): Promise<void>;
  /** Asks where to save (desktop) or downloads it (phone); returns where it went, or null if cancelled. */
  exportFile(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  /** Asks for a file; returns its bytes, or null if cancelled. */
  importFile(): Promise<Uint8Array | null>;
  openDataFolder(): Promise<string>;
  /** Where the closet is kept. canChange is false when it's fixed by CLOSET_DATA_DIR. */
  getDataFolder(): Promise<{ path: string; isDefault: boolean; canChange: boolean }>;
  /** Moves the closet to a folder the user picks (or back to the default) and restarts the app. */
  changeDataFolder(useDefault: boolean): Promise<boolean>;
};

declare global {
  interface Window {
    closetDesktop?: DesktopBridge;
  }
}

/** True in the Mac / Windows app, false on a phone or in a browser. */
export const isDesktop = typeof window !== 'undefined' && !!window.closetDesktop;

export function desktop(): DesktopBridge {
  return window.closetDesktop ?? browserBridge;
}

/** Where the app shows a stored picture from. */
export function photoUrl(name: string): string {
  return isDesktop ? `photo://local/${encodeURIComponent(name)}` : (photoUrls.get(name) ?? '');
}
