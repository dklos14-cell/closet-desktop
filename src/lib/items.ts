import { requireOptionalNativeModule } from 'expo';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { remember } from '@/lib/cache';
import { getDb, itemWear, LOCAL_USER, newId, now, removeItem, saveDb, setLinks, type Db, type ItemRow } from '@/lib/db';
import { photoUrl } from '@/lib/desktop';
import { deletePictures, newPictureName, storePicture } from '@/lib/images';
import { pickImage } from '@/lib/pick-image';
import { makeThumbnail } from '@/lib/thumbnail';
import { pickFields, type Item, type ItemFields } from '@/lib/tags';

/**
 * Background removal is native code that only exists in our development build.
 * In Expo Go it is missing, so we fall back to saving the photo without removing the background.
 */
export const canRemoveBackground = requireOptionalNativeModule('ExpoBackgroundRemoval') != null;

const MAX_DIMENSION = 1280;

/** Lets the user choose a photo (HEIC photos are turned into JPEG). Returns its URI, or null. */
export async function pickPhoto(_source: 'camera' | 'library'): Promise<string | null> {
  return pickImage();
}

/** Returns the file URI of a PNG: transparent (dev build) or just resized (Expo Go). */
export async function cutOut(photoUri: string): Promise<string> {
  if (canRemoveBackground) {
    // Loaded lazily so that importing this file doesn't crash in Expo Go.
    const { removeBackground } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@rbayuokt/expo-background-removal') as typeof import('@rbayuokt/expo-background-removal');
    const result = await removeBackground(photoUri, { cropToSubject: true, maxDimension: MAX_DIMENSION });
    return result.uri;
  }

  const context = ImageManipulator.manipulate(photoUri);
  context.resize({ width: MAX_DIMENSION });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.PNG });
  return result.uri;
}

/** Saves the picture and a small thumbnail to the photos folder, then the item and its tags. */
export async function saveItem(pngUri: string, fields: ItemFields): Promise<void> {
  const { path, thumbPath } = await storeItemPicture(pngUri);
  const db = await getDb();
  const { tagIds, ...columns } = pickFields(fields);
  const id = newId();
  db.items.push({
    ...columns,
    id,
    user_id: LOCAL_USER,
    image_path: path,
    thumb_path: thumbPath,
    created_at: now(),
    worn_before: 0,
    last_worn_before: null,
  });
  db.item_tags = setLinks(db.item_tags, 'item_id', id, 'tag_id', tagIds);
  await saveDb();
}

const tagIdsOf = (db: Db, itemId: string) => db.item_tags.filter((l) => l.item_id === itemId).map((l) => l.tag_id);

function toItem(db: Db, row: ItemRow): Item {
  const { worn_before: _w, last_worn_before: _l, ...item } = row;
  return { ...item, tagIds: tagIdsOf(db, row.id) };
}

export type ItemWithUrl = Item & { imageUrl: string | null };

/** All of the user's items, newest first, each with the URL of its small picture. */
export async function fetchItems(): Promise<ItemWithUrl[]> {
  const db = await getDb();
  const items = [...db.items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return remember(
    'items',
    items.map((row) => ({ ...toItem(db, row), imageUrl: photoUrl(row.thumb_path ?? row.image_path) })),
  );
}

export type ItemDetail = ItemWithUrl & { wear_count: number; last_worn: string | null };

/** One item plus how often it has been worn. */
export async function fetchItem(id: string): Promise<ItemDetail> {
  const db = await getDb();
  const row = db.items.find((i) => i.id === id);
  if (!row) throw new Error('This item no longer exists.');
  const stats = itemWear(db).get(id);
  return {
    ...toItem(db, row),
    imageUrl: photoUrl(row.image_path),
    wear_count: stats?.wear_count ?? 0,
    last_worn: stats?.last_worn ?? null,
  };
}

/** Wear count and last-worn date for every item. */
export async function fetchWearStats(): Promise<Map<string, { wear_count: number; last_worn: string | null }>> {
  return itemWear(await getDb());
}

/** Stores a picture and its thumbnail under a new name; returns both file names. */
async function storeItemPicture(pngUri: string): Promise<{ path: string; thumbPath: string }> {
  const base = newPictureName();
  const path = await storePicture(pngUri, base);
  try {
    const thumbPath = await storePicture(await makeThumbnail(pngUri), `${base}-thumb`);
    return { path, thumbPath };
  } catch (e) {
    await deletePictures([path]);
    throw e;
  }
}

/** "Edit cut-out": swaps an item's picture for a re-edited one, then deletes the old files. */
export async function replaceItemPicture(
  item: Pick<Item, 'id' | 'user_id' | 'image_path' | 'thumb_path'>,
  pngUri: string,
): Promise<void> {
  const { path, thumbPath } = await storeItemPicture(pngUri);
  const db = await getDb();
  const row = db.items.find((i) => i.id === item.id);
  if (!row) {
    await deletePictures([path, thumbPath]);
    throw new Error('This item no longer exists.');
  }
  const old = [row.image_path, row.thumb_path];
  row.image_path = path;
  row.thumb_path = thumbPath;
  await saveDb();
  await deletePictures(old);
}

export async function updateItem(id: string, fields: ItemFields): Promise<void> {
  const db = await getDb();
  const row = db.items.find((i) => i.id === id);
  if (!row) throw new Error('This item no longer exists.');
  const { tagIds, ...columns } = pickFields(fields);
  Object.assign(row, columns);
  db.item_tags = setLinks(db.item_tags, 'item_id', id, 'tag_id', tagIds);
  await saveDb();
}

/** Deletes the item (which also removes it from every outfit) and then its pictures. */
export async function deleteItem(item: Pick<Item, 'id' | 'image_path' | 'thumb_path'>): Promise<void> {
  const db = await getDb();
  removeItem(db, item.id);
  await saveDb();
  await deletePictures([item.image_path, item.thumb_path]);
}
