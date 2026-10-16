import { router, type Href } from 'expo-router';

import { confirmAction } from '@/lib/dialogs';

/**
 * Go back after saving or cancelling. If there's no screen to go back to (the page was
 * reloaded, or opened from a link), go to `fallback` instead of staying stuck on this one.
 */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * Cancel: leave without saving. If something was changed, ask first so a stray tap can't throw
 * your edits away.
 */
export async function cancelEditing(changed: boolean, fallback: Href, question = 'Discard changes?') {
  if (changed && !(await confirmAction(question, "What you changed here won't be saved.", 'Discard'))) return;
  goBack(fallback);
}
