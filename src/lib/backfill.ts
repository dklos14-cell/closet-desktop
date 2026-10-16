import type { ItemWithUrl } from '@/lib/items';

/** Phone apps: thumbnails for older items are made by the website (backfill.web.ts). */
export function backfillThumbnails(_items: ItemWithUrl[], _onDone: () => void): void {}
