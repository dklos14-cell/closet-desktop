import { getDb, saveDb } from '@/lib/db';
import { photoUrl } from '@/lib/desktop';
import { storePicture } from '@/lib/images';
import type { ItemWithUrl } from '@/lib/items';
import { makeThumbnail } from '@/lib/thumbnail';

let running = false;

/**
 * Items without a small picture (e.g. imported from an older backup) load their full-size picture
 * everywhere, which is slow. This quietly makes the missing thumbnails in the background, one item
 * at a time, and calls `onDone` once any were added (so the screen can reload with them).
 */
export function backfillThumbnails(items: ItemWithUrl[], onDone: () => void): void {
  const missing = items.filter((it) => !it.thumb_path);
  if (running || missing.length === 0) return;
  running = true;
  (async () => {
    // Let the screen finish loading its own pictures first.
    await new Promise((r) => setTimeout(r, 2000));
    const db = await getDb();
    let made = 0;
    for (const item of missing) {
      try {
        const row = db.items.find((i) => i.id === item.id);
        if (!row || row.thumb_path) continue;
        // Download first so the canvas can read the pixels.
        const local = URL.createObjectURL(await (await fetch(photoUrl(row.image_path))).blob());
        const thumbUri = await makeThumbnail(local);
        URL.revokeObjectURL(local);
        row.thumb_path = await storePicture(thumbUri, `${row.image_path.replace(/\.[a-z]+$/, '')}-thumb`);
        made++;
      } catch (e) {
        console.warn('Could not make a thumbnail for', item.id, e);
      }
    }
    if (made > 0) await saveDb();
    running = false;
    if (made > 0) onDone();
  })();
}
