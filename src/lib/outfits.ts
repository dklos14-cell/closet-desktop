import { remember } from '@/lib/cache';
import {
  getDb,
  newId,
  now,
  outfitWear,
  removeFolder,
  removeOutfit,
  saveDb,
  setLinks,
  type Db,
  type OutfitItemRow,
  type OutfitRow,
} from '@/lib/db';
import { photoUrl } from '@/lib/desktop';
import { deletePictures, newPictureName, storePicture, type Thumb } from '@/lib/images';
import type { Layout } from '@/lib/outfit-board';

export type Outfit = {
  id: string;
  name: string | null;
  rating: number | null;
  is_favorite: boolean;
  created_at: string;
  tagIds: string[];
  folder_id: string | null;
  /** A photo of you wearing it (file name), if there is one. */
  photo_path: string | null;
  /** Where that photo is shown from. */
  photoUrl: string | null;
  /** Show the photo on the outfit's card instead of the board. */
  show_photo: boolean;
};

export type OutfitFields = Pick<Outfit, 'name' | 'rating' | 'is_favorite' | 'tagIds' | 'folder_id' | 'show_photo'>;

/** What to do with the outfit's photo when saving: keep it, put in a new one, or remove it. */
export type PhotoChange = { kind: 'keep' } | { kind: 'new'; uri: string } | { kind: 'remove' };

export type Folder = { id: string; name: string };

function toOutfit(db: Db, row: OutfitRow): Outfit {
  const { worn_before: _w, last_worn_before: _l, ...outfit } = row;
  return {
    ...outfit,
    tagIds: db.outfit_tags.filter((l) => l.outfit_id === row.id).map((l) => l.tag_id),
    photoUrl: row.photo_path ? photoUrl(row.photo_path) : null,
  };
}

/** An item as it appears in an outfit: its picture, tags, and where it sits on the board. */
export type BoardItem = Thumb & { tagIds: string[]; layout: Layout | null; warmth: string | null };

export type OutfitWithItems = Outfit & { items: BoardItem[] };

function toLayout(row: OutfitItemRow): Layout | null {
  if (row.pos_x === null || row.pos_y === null) return null; // not placed yet → auto-arrange
  return { x: row.pos_x, y: row.pos_y, scale: row.scale, rotation: row.rotation, z: row.z };
}

/** An outfit with its items (small picture, tags, board position) and its tags. */
export function outfitWithItems(db: Db, row: OutfitRow): OutfitWithItems {
  const items = new Map(db.items.map((i) => [i.id, i]));
  return {
    ...toOutfit(db, row),
    items: db.outfit_items
      .filter((l) => l.outfit_id === row.id)
      .flatMap((l) => {
        const item = items.get(l.item_id);
        if (!item) return [];
        return [
          {
            id: item.id,
            image_path: item.image_path,
            imageUrl: photoUrl(item.thumb_path ?? item.image_path),
            warmth: item.warmth,
            tagIds: db.item_tags.filter((t) => t.item_id === item.id).map((t) => t.tag_id),
            layout: toLayout(l),
          },
        ];
      }),
  };
}

export async function fetchOutfits(): Promise<OutfitWithItems[]> {
  const db = await getDb();
  const rows = [...db.outfits].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return remember(
    'outfits',
    rows.map((row) => outfitWithItems(db, row)),
  );
}

/** One outfit's fields, the ids of its items, and their saved board positions (for the editor). */
export async function fetchOutfit(
  id: string,
): Promise<Outfit & { itemIds: string[]; layouts: Map<string, Layout> }> {
  const db = await getDb();
  const row = db.outfits.find((o) => o.id === id);
  if (!row) throw new Error('This outfit no longer exists.');
  const links = db.outfit_items.filter((l) => l.outfit_id === id);
  const layouts = new Map<string, Layout>();
  for (const l of links) {
    const layout = toLayout(l);
    if (layout) layouts.set(l.item_id, layout);
  }
  return {
    ...toOutfit(db, row),
    itemIds: links.map((l) => l.item_id),
    layouts,
  };
}

/**
 * Creates (no id) or updates an outfit, then makes its items, their board positions and its
 * tags match. Returns the outfit's id.
 */
export async function saveOutfit(
  id: string | null,
  fields: OutfitFields,
  itemIds: string[],
  layouts: Map<string, Layout>,
  photo: PhotoChange = { kind: 'keep' },
): Promise<string> {
  const db = await getDb();
  const { tagIds, name, rating, is_favorite, folder_id, show_photo } = fields;
  const newPhoto = photo.kind === 'new' ? await storePicture(photo.uri, `outfit-${newPictureName()}`) : null;
  let row = id ? db.outfits.find((o) => o.id === id) : undefined;
  if (id && !row) throw new Error('This outfit no longer exists.');
  const oldPhoto = row?.photo_path ?? null;
  const photo_path = photo.kind === 'new' ? newPhoto : photo.kind === 'remove' ? null : oldPhoto;
  const changes = { name, rating, is_favorite, folder_id, show_photo: show_photo && !!photo_path, photo_path };
  if (row) Object.assign(row, changes);
  else {
    row = { id: newId(), ...changes, created_at: now(), worn_before: 0, last_worn_before: null };
    db.outfits.push(row);
  }
  const outfitId = row.id;
  db.outfit_items = [
    ...db.outfit_items.filter((l) => l.outfit_id !== outfitId),
    ...[...new Set(itemIds)].map((itemId) => {
      const l = layouts.get(itemId);
      return {
        outfit_id: outfitId,
        item_id: itemId,
        pos_x: l?.x ?? null,
        pos_y: l?.y ?? null,
        scale: l?.scale ?? 0.4,
        rotation: l?.rotation ?? 0,
        z: l?.z ?? 0,
      };
    }),
  ];
  db.outfit_tags = setLinks(db.outfit_tags, 'outfit_id', outfitId, 'tag_id', tagIds);
  await saveDb();
  if (oldPhoto && oldPhoto !== photo_path) await deletePictures([oldPhoto]);
  return outfitId;
}

async function updateOutfit(id: string, fields: Partial<OutfitRow>): Promise<void> {
  const db = await getDb();
  const row = db.outfits.find((o) => o.id === id);
  if (!row) throw new Error('This outfit no longer exists.');
  Object.assign(row, fields);
  await saveDb();
}

export function setOutfitRating(id: string, rating: number | null): Promise<void> {
  return updateOutfit(id, { rating });
}

export function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  return updateOutfit(id, { is_favorite: isFavorite });
}

/** How often each outfit has been worn (calendar days up to today). Rating unlocks after 1. */
export async function fetchOutfitWearStats(): Promise<Map<string, { wear_count: number; last_worn: string | null }>> {
  return remember('outfit-wear', outfitWear(await getDb()));
}

/** Calendar entries for this outfit keep their date and note; only the outfit link is cleared. */
export async function deleteOutfit(id: string): Promise<void> {
  const db = await getDb();
  const photo = db.outfits.find((o) => o.id === id)?.photo_path;
  removeOutfit(db, id);
  await saveDb();
  await deletePictures([photo]);
}

// --- Folders (Outfits screen) ---------------------------------------------------------------

export async function fetchFolders(): Promise<Folder[]> {
  const db = await getDb();
  return [...db.folders].sort((a, b) => a.position - b.position).map(({ id, name }) => ({ id, name }));
}

function checkFolderName(db: Db, name: string, exceptId?: string) {
  if (name.length < 1 || name.length > 40) throw new Error('Folder names must be 1-40 characters.');
  if (db.folders.some((f) => f.id !== exceptId && f.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`You already have a folder called "${name}".`);
  }
}

export async function addFolder(rawName: string): Promise<Folder> {
  const db = await getDb();
  const name = rawName.trim();
  checkFolderName(db, name);
  const folder = { id: newId(), name, position: Math.max(0, ...db.folders.map((f) => f.position)) + 1, created_at: now() };
  db.folders.push(folder);
  await saveDb();
  return { id: folder.id, name };
}

export async function renameFolder(id: string, rawName: string): Promise<void> {
  const db = await getDb();
  const name = rawName.trim();
  checkFolderName(db, name, id);
  const folder = db.folders.find((f) => f.id === id);
  if (!folder) throw new Error('This folder no longer exists.');
  folder.name = name;
  await saveDb();
}

/** The outfits inside stay, outside any folder. */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDb();
  removeFolder(db, id);
  await saveDb();
}

/** Files an outfit in a folder (or takes it out, with null). */
export async function moveToFolder(outfitId: string, folderId: string | null): Promise<void> {
  return updateOutfit(outfitId, { folder_id: folderId });
}
