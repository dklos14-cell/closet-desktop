import { useEffect, useEffectEvent } from 'react';

import { desktop } from '@/lib/desktop';
import { isTyping } from '@/lib/keys';

/**
 * Menu commands from the desktop shell (electron/main.js → buildMenu): 'undo', 'zoom-in',
 * 'go:closet', … The screen opened last gets the first chance to handle one (e.g. the cut-out
 * editor takes 'undo'); anything it doesn't handle goes to the app-wide handler.
 */
type Handler = (command: string) => boolean;

const stack: Handler[] = [];

/** Handles commands while this component is on screen. Return true when handled. */
export function useCommands(handler: Handler) {
  const handle = useEffectEvent(handler);
  useEffect(() => {
    const h: Handler = (c) => handle(c);
    stack.push(h);
    return () => {
      stack.splice(stack.indexOf(h), 1);
    };
  }, []);
}

/** Gives a command to the screens, newest first. Returns true if one handled it. */
function dispatch(command: string): boolean {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i](command)) return true;
  return false;
}

/**
 * Starts listening to the menu; `fallback` gets commands no screen handled.
 * The Esc key goes the same way, as the 'escape' command: the screen on top closes (Cancel).
 */
export function listenToMenu(fallback: (command: string) => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // In a text box, Esc first just leaves the box.
    if (isTyping(e)) (e.target as HTMLElement).blur();
    else if (dispatch('escape')) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  // Like buttons in Mac / Windows apps: clicking one doesn't leave it holding the keyboard, so
  // Enter, Space and the other shortcuts keep working after a click. (Tab still moves focus.)
  const onPointerUp = () =>
    setTimeout(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) el.blur();
    }, 0);
  window.addEventListener('pointerup', onPointerUp);
  const stop = desktop().onCommand((command) => {
    if (dispatch(command)) return;
    // Undo / Redo in a text box: let the text box do it.
    if (command === 'undo' || command === 'redo') {
      document.execCommand(command);
      return;
    }
    fallback(command);
  });
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerup', onPointerUp);
    stop();
  };
}

/**
 * Keyboard for a form screen: ⌘S (File → Save) saves, Esc cancels.
 * `enabled: false` while something inside it (a pop-up, the cut-out editor) should get the keys.
 */
export function useEditorShortcuts({ save, cancel, enabled = true }: { save?: () => void; cancel: () => void; enabled?: boolean }) {
  useCommands((command) => {
    if (command !== 'save' && command !== 'escape') return false;
    if (!enabled) return false; // something inside it (a pop-up, an editor) gets the keys
    if (command === 'save') save?.();
    else cancel();
    return true;
  });
}

export const SHORTCUTS_HELP = (mod: string) =>
  [
    `${mod}N  Add clothes`,
    `${mod}⇧N  New outfit`,
    `${mod}⇧P  Pick an outfit for me`,
    `${mod}F  Search the closet`,
    `${mod}1 … ${mod}8  Today, Closet, Outfits, Favorites, Calendar, Stats, Tags, Profile`,
    `${mod}E  Export closet     ${mod}⇧I  Import a closet`,
    `${mod}S  Save     Esc  Cancel / close`,
    `${mod}Z  Undo     ${mod}= / ${mod}-  Zoom     ${mod}0  Fit`,
    `${mod}[  Back     ${mod},  Settings`,
    '',
    'Cut-out editor: E erase · R restore · W wand · G gap · P pen (Enter closes, ⌫ removes a point) · hold Space to move · [ ] brush size · F fit · Enter done · Esc cancel',
    'Outfit board: drag the corner to resize, the ring to turn · arrows move · + − size · [ ] turn · V angle · H flip · F / B front / back · Delete removes · Esc done',
    'Outfit picker: Space shuffle all · 1-9 reroll that piece · L keep (lock) it · Enter save',
    'Trackpad: pinch to zoom or resize, two-finger scroll to move around',
  ].join('\n');
