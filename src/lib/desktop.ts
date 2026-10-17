/** One line of a right-click menu. */
export type MenuEntry =
  | { id: string; label: string; enabled?: boolean; checked?: boolean }
  | { label: string; submenu: MenuEntry[] }
  | { separator: true };

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
  /** Shows a right-click menu; resolves with the chosen entry's id (null if closed). */
  popupMenu(entries: MenuEntry[]): Promise<string | null>;
  /** This version, and whether it looks for updates by itself when opened. */
  appInfo(): Promise<{ version: string; autoUpdate: boolean }>;
  /** Looks for a new version; the desktop shell shows the result and installs it if asked. */
  checkForUpdates(): Promise<void>;
  setAutoUpdate(on: boolean): Promise<void>;
  /** Menu commands; returns a function that stops listening. */
  onCommand(callback: (command: string) => void): () => void;
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
