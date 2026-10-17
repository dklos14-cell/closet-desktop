/** Keyboard helpers shared by the editors. */

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent);

/** The command key's name for shortcut hints: ⌘ on a Mac, Ctrl on Windows. */
export const MOD = isMac ? '⌘' : 'Ctrl';

/** ⌘ on a Mac, Ctrl on Windows. */
export function modKey(e: KeyboardEvent | WheelEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

/** True while typing in a text box, so single-letter shortcuts don't fire. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

/**
 * Props that make a Pressable open `show` on right-click (two-finger click on a trackpad)
 * instead of the browser's own menu. Spread them onto the Pressable.
 */
export function contextMenu(show: (() => void) | undefined): object {
  if (!show) return {};
  return {
    onContextMenu: (e: { preventDefault(): void }) => {
      e.preventDefault();
      show();
    },
  };
}
