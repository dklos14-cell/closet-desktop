import { desktop } from '@/lib/desktop';
import type { Accent } from '@/constants/theme';

/**
 * The closet, kept on this computer. The tables and columns are the same as the website's
 * Supabase database (see closet-app/supabase/migrations), so a closet file exported from either
 * one can be imported into the other, and the data could later be synced to a server as-is.
 *
 * Everything is loaded into memory once; each change is written back to closet.json.
 */

export const LOCAL_USER = 'local';

export type ProfileRow = {
  display_name: string | null;
  avatar_emoji: string | null;
  avatar_path: string | null;
  accent: Accent;
  theme: 'system' | 'light' | 'dark';
  week_start: 0 | 1;
  weather_place: string | null;
  weather_lat: number | null;
  weather_lon: number | null;
  temp_unit: 'fahrenheit' | 'celsius';
  /** First day of the month the monthly clean-up last ran for. */
  last_cleanup: string | null;
};

export type TagRow = { id: string; kind: string; name: string; position: number; created_at: string };
export type ItemRow = {
  id: string;
  user_id: string;
  image_path: string;
  thumb_path: string | null;
  name: string | null;
  warmth: 'light' | 'medium' | 'heavy' | null;
  wear_status: 'ready' | 'in_laundry' | 'needs_repair' | 'retired';
  rating: number | null;
  created_at: string;
  worn_before: number;
  last_worn_before: string | null;
};
export type OutfitRow = {
  id: string;
  name: string | null;
  rating: number | null;
  is_favorite: boolean;
  created_at: string;
  worn_before: number;
  last_worn_before: string | null;
  /** The folder it's filed in (Outfits screen), if any. */
  folder_id: string | null;
  /** A photo of you wearing it, if you added one. */
  photo_path: string | null;
  /** Show that photo on the outfit's card instead of the board. */
  show_photo: boolean;
};
export type FolderRow = { id: string; name: string; position: number; created_at: string };
export type OutfitItemRow = {
  outfit_id: string;
  item_id: string;
  pos_x: number | null;
  pos_y: number | null;
  scale: number;
  rotation: number;
  z: number;
};
export type EntryRow = {
  id: string;
  date: string;
  outfit_id: string | null;
  note: string | null;
  reactions: string[];
  created_at: string;
};
export type RecurringRow = { id: string; name: string; weekdays: number[]; outfit_id: string | null; created_at: string };

export type Db = {
  version: 2;
  profile: ProfileRow;
  tags: TagRow[];
  items: ItemRow[];
  item_tags: { item_id: string; tag_id: string }[];
  outfits: OutfitRow[];
  folders: FolderRow[];
  outfit_items: OutfitItemRow[];
  outfit_tags: { outfit_id: string; tag_id: string }[];
  calendar_entries: EntryRow[];
  recurring_events: RecurringRow[];
};

export const DEFAULT_PROFILE: ProfileRow = {
  display_name: null,
  avatar_emoji: null,
  avatar_path: null,
  accent: 'blue',
  theme: 'system',
  week_start: 1,
  weather_place: null,
  weather_lat: null,
  weather_lon: null,
  temp_unit: 'fahrenheit',
  last_cleanup: null,
};

// The same starting tags a new website account gets (seed_default_tags in the migrations).
const BASE_TAGS: Record<string, string[]> = {
  type: [
    'T-shirt', 'Shirt', 'Blouse', 'Sweater', 'Hoodie', 'Jacket', 'Coat', 'Pants', 'Jeans', 'Shorts', 'Skirt',
    'Dress', 'Leggings', 'Socks', 'Shoes', 'Sneakers', 'Boots', 'Pajamas', 'Swimwear', 'Bag', 'Jewelry', 'Hat',
    'Accessory',
  ],
  color: [
    'Black', 'White', 'Gray', 'Beige', 'Brown', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple',
    'Pink', 'Gold', 'Silver', 'Multicolor',
  ],
  season: ['Spring', 'Summer', 'Fall', 'Winter'],
  occasion: ['Casual', 'Work', 'Formal', 'Party', 'Date', 'Sport', 'Lounge', 'Travel'],
  other: ['Favorite'],
  favorite: ['Everyday', 'Date night', 'Going out'],
  pattern: [
    'Solid', 'Striped', 'Plaid', 'Checkered', 'Polka dot', 'Floral', 'Graphic', 'Logo', 'Animal print', 'Camo',
    'Tie-dye', 'Paisley', 'Textured',
  ],
  style: ['Classic', 'Casual', 'Sporty', 'Streetwear', 'Minimal', 'Preppy', 'Boho', 'Edgy', 'Cozy', 'Dressy'],
};

const baseTags = (kind: string, created_at: string) =>
  BASE_TAGS[kind].map((name, i) => ({ id: newId(), kind, name, position: i + 1, created_at }));

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

function emptyDb(): Db {
  const created_at = now();
  return {
    version: 2,
    profile: { ...DEFAULT_PROFILE },
    tags: Object.keys(BASE_TAGS).flatMap((kind) => baseTags(kind, created_at)),
    items: [],
    item_tags: [],
    outfits: [],
    folders: [],
    outfit_items: [],
    outfit_tags: [],
    calendar_entries: [],
    recurring_events: [],
  };
}

let loading: Promise<Db> | null = null;

/** The closet (loaded from disk the first time). */
export function getDb(): Promise<Db> {
  loading ??= desktop()
    .loadDb()
    .then((json) => (json ? upgrade(JSON.parse(json) as Db) : emptyDb()));
  return loading;
}

/** Brings a closet saved by an older version up to date (saved again on the next change). */
function upgrade(saved: Db): Db {
  const db: Db = { ...emptyDb(), ...saved, folders: saved.folders ?? [] };
  if ((saved.version ?? 1) < 2) {
    // Version 2: a Style tag group, and outfit folders and photos.
    if (!db.tags.some((t) => t.kind === 'style')) db.tags.push(...baseTags('style', now()));
  }
  db.outfits = db.outfits.map((o) => ({ ...o, folder_id: o.folder_id ?? null, photo_path: o.photo_path ?? null, show_photo: o.show_photo ?? false }));
  db.version = 2;
  return db;
}

/** Writes the closet back to disk. Call after every change. */
export async function saveDb(): Promise<void> {
  const db = await getDb();
  await desktop().saveDb(JSON.stringify(db));
}

// --- Deleting, with the same knock-on effects as the database's foreign keys ---------------

export function removeItem(db: Db, id: string) {
  db.items = db.items.filter((i) => i.id !== id);
  db.item_tags = db.item_tags.filter((l) => l.item_id !== id);
  db.outfit_items = db.outfit_items.filter((l) => l.item_id !== id);
}

/** Calendar days and repeating events that used the outfit keep their date, note and name. */
export function removeOutfit(db: Db, id: string) {
  db.outfits = db.outfits.filter((o) => o.id !== id);
  db.outfit_items = db.outfit_items.filter((l) => l.outfit_id !== id);
  db.outfit_tags = db.outfit_tags.filter((l) => l.outfit_id !== id);
  for (const e of db.calendar_entries) if (e.outfit_id === id) e.outfit_id = null;
  for (const r of db.recurring_events) if (r.outfit_id === id) r.outfit_id = null;
}

/** Outfits in the folder stay; they're just no longer in a folder. */
export function removeFolder(db: Db, id: string) {
  db.folders = db.folders.filter((f) => f.id !== id);
  for (const o of db.outfits) if (o.folder_id === id) o.folder_id = null;
}

export function removeTag(db: Db, id: string) {
  db.tags = db.tags.filter((t) => t.id !== id);
  db.item_tags = db.item_tags.filter((l) => l.tag_id !== id);
  db.outfit_tags = db.outfit_tags.filter((l) => l.tag_id !== id);
}

/** Makes a link list (e.g. item_tags) contain exactly `ids` for one owner. */
export function setLinks<K extends string, L extends string>(
  links: Record<K | L, string>[],
  ownerKey: K,
  ownerId: string,
  idKey: L,
  ids: string[],
): Record<K | L, string>[] {
  const kept = links.filter((l) => l[ownerKey] !== ownerId);
  return [...kept, ...[...new Set(ids)].map((id) => ({ [ownerKey]: ownerId, [idKey]: id }) as Record<K | L, string>)];
}

// --- Wear counts (the item_wear_stats / outfit_wear_stats views) ---------------------------

type Wear = { wear_count: number; last_worn: string | null };

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Every calendar day an item's outfits were (or are planned to be) worn, plus older history. */
export function itemWear(db: Db): Map<string, Wear> {
  const itemsOf = new Map<string, string[]>();
  for (const l of db.outfit_items) itemsOf.set(l.outfit_id, [...(itemsOf.get(l.outfit_id) ?? []), l.item_id]);
  const stats = new Map<string, Wear>(
    db.items.map((i) => [i.id, { wear_count: i.worn_before, last_worn: i.last_worn_before }]),
  );
  for (const e of db.calendar_entries) {
    if (!e.outfit_id) continue;
    for (const itemId of itemsOf.get(e.outfit_id) ?? []) {
      const s = stats.get(itemId);
      if (s) {
        s.wear_count++;
        s.last_worn = later(s.last_worn, e.date);
      }
    }
  }
  return stats;
}

/** Days each outfit was worn, up to today. */
export function outfitWear(db: Db): Map<string, Wear> {
  const stats = new Map<string, Wear>(
    db.outfits.map((o) => [o.id, { wear_count: o.worn_before, last_worn: o.last_worn_before }]),
  );
  const t = today();
  for (const e of db.calendar_entries) {
    const s = e.outfit_id ? stats.get(e.outfit_id) : undefined;
    if (s && e.date <= t) {
      s.wear_count++;
      s.last_worn = later(s.last_worn, e.date);
    }
  }
  return stats;
}

// --- Monthly clean-up (same rules as monthly_cleanup in the migrations) ----------------------

/**
 * When a new month starts: last month's one-off calendar days and outfits made in past months
 * are cleared. Items are never removed, and neither are favorite outfits, outfits in a folder or
 * with your photo, outfits used by a repeating event, or outfits planned for a coming day.
 * Wear counts are kept.
 * Returns true if anything ran.
 */
export async function monthlyCleanup(): Promise<boolean> {
  const db = await getDb();
  const monthStart = `${today().slice(0, 7)}-01`;
  if (db.profile.last_cleanup && db.profile.last_cleanup >= monthStart) return false;

  const old = db.calendar_entries.filter((e) => e.date < monthStart && e.outfit_id);
  const itemsOf = new Map<string, string[]>();
  for (const l of db.outfit_items) itemsOf.set(l.outfit_id, [...(itemsOf.get(l.outfit_id) ?? []), l.item_id]);
  const items = new Map(db.items.map((i) => [i.id, i]));
  const outfits = new Map(db.outfits.map((o) => [o.id, o]));
  for (const e of old) {
    const o = outfits.get(e.outfit_id!);
    if (o) {
      o.worn_before++;
      o.last_worn_before = later(o.last_worn_before, e.date);
    }
    for (const itemId of itemsOf.get(e.outfit_id!) ?? []) {
      const i = items.get(itemId);
      if (i) {
        i.worn_before++;
        i.last_worn_before = later(i.last_worn_before, e.date);
      }
    }
  }

  db.calendar_entries = db.calendar_entries.filter((e) => e.date >= monthStart);
  const kept = new Set([
    ...db.recurring_events.flatMap((r) => (r.outfit_id ? [r.outfit_id] : [])),
    ...db.calendar_entries.flatMap((e) => (e.outfit_id ? [e.outfit_id] : [])),
  ]);
  for (const o of [...db.outfits]) {
    // Outfits you organized (favorite, in a folder, or with your photo) are kept too.
    const organized = o.is_favorite || !!o.folder_id || !!o.photo_path;
    if (o.created_at.slice(0, 10) < monthStart && !organized && !kept.has(o.id)) removeOutfit(db, o.id);
  }
  db.profile.last_cleanup = monthStart;
  await saveDb();
  return true;
}
