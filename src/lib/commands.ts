import { useEffect, useEffectEvent } from 'react';

import { desktop } from '@/lib/desktop';

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

/** Starts listening to the menu; `fallback` gets commands no screen handled. */
export function listenToMenu(fallback: (command: string) => void): () => void {
  return desktop().onCommand((command) => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i](command)) return;
    // Undo / Redo in a text box: let the text box do it.
    if (command === 'undo' || command === 'redo') {
      document.execCommand(command);
      return;
    }
    fallback(command);
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
    `${mod}Z  Undo     ${mod}= / ${mod}-  Zoom     ${mod}0  Fit`,
    '',
    'Cut-out editor: E erase · R restore · W wand · G gap · hold Space to move · [ ] brush size · F fit · Enter done · Esc cancel',
    'Outfit board: drag the corner to resize, the ring to turn · arrows move · + − size · [ ] turn · F / B front / back · Delete removes · Esc done',
    'Trackpad: pinch to zoom or resize, two-finger scroll to move around',
  ].join('\n');
