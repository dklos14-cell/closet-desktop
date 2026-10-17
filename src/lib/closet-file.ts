import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';

import { toDateString } from '@/lib/calendar';
import {
  DEFAULT_PROFILE,
  getDb,
  LOCAL_USER,
  now,
  saveDb,
  type EntryRow,
  type FolderRow,
  type ItemRow,
  type OutfitItemRow,
  type OutfitRow,
  type RecurringRow,
  type TagRow,
} from '@/lib/db';
import { desktop } from '@/lib/desktop';
import { deletePictures } from '@/lib/images';

/**
 * A closet file is a zip that moves a whole closet between the website and this app:
 *   closet.json   every table (same tables and columns as the website's database)
 *   photos/...    every picture, by file name (an item's image_path ends with its file name)
 * The website's "Download my closet" backup is the same format, so it can be imported here too.
 */

const fileName = (path: string) => path.split('/').pop()!;

/** Saves the whole closet as one zip file, wherever the user picks. Returns the path, or null. */
export async function exportCloset(onProgress: (message: string) => void): Promise<string | null> {
  const db = await getDb();
  onProgress('Collecting your closet…');
  const pictures = [
    ...db.items.flatMap((i) => (i.thumb_path ? [i.image_path, i.thumb_path] : [i.image_path])),
    ...db.outfits.flatMap((o) => (o.photo_path ? [o.photo_path] : [])),
    ...(db.profile.avatar_path ? [db.profile.avatar_path] : []),
  ];
  const photos: Zippable = {};
  let done = 0;
  for (const name of pictures) {
    onProgress(`Packing photos… ${++done} of ${pictures.length}`);
    try {
      photos[fileName(name)] = [await desktop().readPhoto(name), { level: 0 }]; // already compressed
    } catch {
      // A missing picture shouldn't stop the export.
    }
  }

  const { last_cleanup: _, ...profile } = db.profile;
  const data = {
    format: 'closet',
    version: 2,
    exported_at: new Date().toISOString(),
    profiles: [{ id: LOCAL_USER, ...profile }],
    tags: db.tags,
    items: db.items,
    item_tags: db.item_tags,
    outfits: db.outfits,
    folders: db.folders,
    outfit_items: db.outfit_items,
    outfit_tags: db.outfit_tags,
    calendar_entries: db.calendar_entries,
    recurring_events: db.recurring_events,
  };
  const today = toDateString(new Date());
  onProgress('Packing the zip…');
  const zip = zipSync({
    'closet.json': strToU8(JSON.stringify(data, null, 2)),
    'README.txt': strToU8(
      `Closet from ${today}.\n\n` +
        'Import it in the Closet app (Profile → Import a closet) or on the Closet website.\n' +
        'closet.json has all items, tags, outfits, calendar days and the profile; photos/ has the pictures.\n',
    ),
    photos,
  });
  const path = await desktop().exportFile(`closet-${today}.zip`, zip);
  onProgress(path ? `Saved ${db.items.length} items to ${path}` : 'Export cancelled.');
  return path;
}

type ClosetFile = {
  profiles?: Record<string, unknown>[];
  tags?: Partial<TagRow>[];
  items?: Partial<ItemRow>[];
  item_tags?: { item_id: string; tag_id: string }[];
  outfits?: Partial<OutfitRow>[];
  outfit_items?: Partial<OutfitItemRow>[];
  outfit_tags?: { outfit_id: string; tag_id: string }[];
  calendar_entries?: Partial<EntryRow>[];
  recurring_events?: Partial<RecurringRow>[];
  folders?: Partial<FolderRow>[];
};

export type ImportSummary = { items: number; outfits: number; days: number; tags: number };

/**
 * Asks for a closet file and adds it to this closet. Things already here (same id) are updated
 * to the file's version; tags with the same name are merged. Returns null if cancelled.
 */
export async function importCloset(onProgress: (message: string) => void): Promise<ImportSummary | null> {
  const bytes = await desktop().importFile();
  if (!bytes) return null;
  onProgress('Reading the file…');
  let files: Record<string, Uint8Array>;
  let data: ClosetFile;
  try {
    files = unzipSync(bytes);
    data = JSON.parse(strFromU8(files['closet.json'])) as ClosetFile;
  } catch {
    throw new Error('This is not a closet file. Pick a .zip made by "Export closet" or "Download my closet".');
  }
  const photoBytes = new Map(
    Object.entries(files).flatMap(([path, b]) => (path.startsWith('photos/') && b.length > 0 ? [[fileName(path), b]] : [])),
  );

  const db = await getDb();
  const summary: ImportSummary = { items: 0, outfits: 0, days: 0, tags: 0 };

  // Tags: the same tag (by id, or same group + name) is merged into the one already here.
  const tagMap = new Map<string, string>();
  for (const t of data.tags ?? []) {
    if (!t.id || !t.kind || !t.name) continue;
    const same =
      db.tags.find((x) => x.id === t.id) ??
      db.tags.find((x) => x.kind === t.kind && x.name.toLowerCase() === t.name!.toLowerCase());
    if (same) tagMap.set(t.id, same.id);
    else {
      db.tags.push({ id: t.id, kind: t.kind, name: t.name, position: t.position ?? 99, created_at: t.created_at ?? now() });
      tagMap.set(t.id, t.id);
      summary.tags++;
    }
  }
  const mapTags = (ids: string[]) => ids.flatMap((id) => (tagMap.has(id) ? [tagMap.get(id)!] : []));

  // Pictures go into the photos folder; a missing thumbnail is made later (see backfill).
  async function keepPhoto(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    const name = fileName(path);
    const b = photoBytes.get(name);
    if (!b) return null;
    await desktop().savePhoto(name, b);
    return name;
  }

  const items = data.items ?? [];
  let done = 0;
  for (const it of items) {
    onProgress(`Adding items… ${++done} of ${items.length}`);
    if (!it.id || !it.image_path) continue;
    const image = await keepPhoto(it.image_path);
    if (!image) continue; // an item without its picture can't be shown
    const row: ItemRow = {
      id: it.id,
      user_id: LOCAL_USER,
      image_path: image,
      thumb_path: await keepPhoto(it.thumb_path),
      name: it.name ?? null,
      warmth: it.warmth ?? null,
      wear_status: it.wear_status ?? 'ready',
      rating: it.rating ?? null,
      created_at: it.created_at ?? now(),
      worn_before: it.worn_before ?? 0,
      last_worn_before: it.last_worn_before ?? null,
    };
    const old = db.items.find((i) => i.id === row.id);
    upsert(db.items, row);
    if (old && old.image_path !== row.image_path) await deletePictures([old.image_path, old.thumb_path]);
    const tagIds = mapTags((data.item_tags ?? []).filter((l) => l.item_id === row.id).map((l) => l.tag_id));
    db.item_tags = [...db.item_tags.filter((l) => l.item_id !== row.id), ...tagIds.map((tag_id) => ({ item_id: row.id, tag_id }))];
    summary.items++;
  }
  const itemIds = new Set(db.items.map((i) => i.id));

  // Folders: one with the same name as yours is merged into yours.
  const folderMap = new Map<string, string>();
  for (const f of data.folders ?? []) {
    if (!f.id || !f.name) continue;
    const same =
      db.folders.find((x) => x.id === f.id) ?? db.folders.find((x) => x.name.toLowerCase() === f.name!.toLowerCase());
    if (same) folderMap.set(f.id, same.id);
    else {
      const position = Math.max(0, ...db.folders.map((x) => x.position)) + 1;
      db.folders.push({ id: f.id, name: f.name, position, created_at: f.created_at ?? now() });
      folderMap.set(f.id, f.id);
    }
  }

  onProgress('Adding outfits…');
  for (const o of data.outfits ?? []) {
    if (!o.id) continue;
    const photo_path = await keepPhoto(o.photo_path);
    upsert(db.outfits, {
      id: o.id,
      name: o.name ?? null,
      rating: o.rating ?? null,
      is_favorite: o.is_favorite ?? false,
      created_at: o.created_at ?? now(),
      worn_before: o.worn_before ?? 0,
      last_worn_before: o.last_worn_before ?? null,
      folder_id: (o.folder_id && folderMap.get(o.folder_id)) || null,
      photo_path,
      show_photo: !!photo_path && (o.show_photo ?? false),
    });
    const links = (data.outfit_items ?? []).filter((l) => l.outfit_id === o.id && l.item_id && itemIds.has(l.item_id));
    db.outfit_items = [
      ...db.outfit_items.filter((l) => l.outfit_id !== o.id),
      ...links.map((l) => ({
        outfit_id: o.id!,
        item_id: l.item_id!,
        pos_x: l.pos_x ?? null,
        pos_y: l.pos_y ?? null,
        scale: l.scale ?? 0.4,
        rotation: l.rotation ?? 0,
        z: l.z ?? 0,
      })),
    ];
    const tagIds = mapTags((data.outfit_tags ?? []).filter((l) => l.outfit_id === o.id).map((l) => l.tag_id));
    db.outfit_tags = [
      ...db.outfit_tags.filter((l) => l.outfit_id !== o.id),
      ...tagIds.map((tag_id) => ({ outfit_id: o.id!, tag_id })),
    ];
    summary.outfits++;
  }
  const outfitIds = new Set(db.outfits.map((o) => o.id));
  const outfitOrNull = (id: string | null | undefined) => (id && outfitIds.has(id) ? id : null);

  for (const e of data.calendar_entries ?? []) {
    if (!e.id || !e.date) continue;
    upsert(db.calendar_entries, {
      id: e.id,
      date: e.date,
      outfit_id: outfitOrNull(e.outfit_id),
      note: e.note ?? null,
      reactions: e.reactions ?? [],
      created_at: e.created_at ?? now(),
    });
    summary.days++;
  }
  for (const r of data.recurring_events ?? []) {
    if (!r.id || !r.name || !r.weekdays?.length) continue;
    upsert(db.recurring_events, {
      id: r.id,
      name: r.name,
      weekdays: r.weekdays,
      outfit_id: outfitOrNull(r.outfit_id),
      created_at: r.created_at ?? now(),
    });
  }

  // A brand-new closet takes the file's name, picture and settings; otherwise yours stay.
  const theirs = data.profiles?.[0];
  if (theirs && !db.profile.display_name) {
    for (const key of Object.keys(DEFAULT_PROFILE) as (keyof typeof DEFAULT_PROFILE)[]) {
      if (key !== 'last_cleanup' && key !== 'avatar_path' && theirs[key] !== undefined) {
        (db.profile as Record<string, unknown>)[key] = theirs[key];
      }
    }
    const avatar = await keepPhoto(theirs.avatar_path as string | null);
    if (avatar) db.profile.avatar_path = avatar;
  }

  await saveDb();
  onProgress(`Imported ${summary.items} items, ${summary.outfits} outfits and ${summary.days} calendar days.`);
  return summary;
}

function upsert<T extends { id: string }>(rows: T[], row: T) {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i >= 0) rows[i] = row;
  else rows.push(row);
}
