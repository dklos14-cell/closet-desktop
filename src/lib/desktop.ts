/** What the desktop shell (electron/preload.js) lets the app do on this computer. */
export type DesktopBridge = {
  loadDb(): Promise<string | null>;
  saveDb(json: string): Promise<void>;
  savePhoto(name: string, bytes: Uint8Array): Promise<void>;
  readPhoto(name: string): Promise<Uint8Array>;
  deletePhoto(name: string): Promise<void>;
  /** Asks where to save; returns the chosen path, or null if cancelled. */
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

export function desktop(): DesktopBridge {
  if (!window.closetDesktop) throw new Error('This page only works inside the Closet app.');
  return window.closetDesktop;
}

/** Where the app shows a stored picture from. */
export function photoUrl(name: string): string {
  return `photo://local/${encodeURIComponent(name)}`;
}
