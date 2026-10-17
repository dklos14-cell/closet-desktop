// Tag kinds are fixed; the tags inside each kind belong to the user (see the `tags` table
// and supabase/migrations/20261014000000_custom_tags.sql). Warmth and wear status stay fixed
// fields on the item. Keep these lists in sync with the CHECK constraints in the migrations.

export const TAG_KINDS = ['type', 'color', 'pattern', 'style', 'season', 'occasion', 'other', 'favorite'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

/** Groups shown when tagging an item / an outfit. "favorite" = the user's favorite lists. */
export const ITEM_TAG_KINDS: readonly TagKind[] = ['type', 'color', 'pattern', 'style', 'season', 'occasion', 'other'];
export const OUTFIT_TAG_KINDS: readonly TagKind[] = ['occasion', 'season', 'other'];

export const TAG_KIND_TITLES: Record<TagKind, string> = {
  type: 'Type',
  color: 'Colors',
  pattern: 'Pattern',
  style: 'Style',
  season: 'Seasons',
  occasion: 'Occasions',
  other: 'Other',
  favorite: 'Favorite lists',
};

export type Tag = {
  id: string;
  kind: TagKind;
  name: string;
  position: number;
};

export const WARMTHS = ['light', 'medium', 'heavy'] as const;
export const WEAR_STATUSES = ['ready', 'in_laundry', 'needs_repair', 'retired'] as const;

export type Warmth = (typeof WARMTHS)[number];
export type WearStatus = (typeof WEAR_STATUSES)[number];

/** Shape of a row in the `items` table, plus the ids of its tags (from `item_tags`). */
export type Item = {
  id: string;
  user_id: string;
  image_path: string;
  /** Small copy for grids (null for items saved before thumbnails existed). */
  thumb_path: string | null;
  name: string | null;
  warmth: Warmth | null;
  wear_status: WearStatus;
  rating: number | null;
  created_at: string;
  tagIds: string[];
  /** Extra photos from other sides. */
  angles: { image_path: string; thumb_path: string }[];
};

/** Everything the item form edits. */
export type ItemFields = Pick<Item, 'name' | 'warmth' | 'wear_status' | 'rating' | 'tagIds'>;

/** Copies just the editable fields, so extra properties never reach the database. */
export function pickFields(item: ItemFields): ItemFields {
  const { name, warmth, wear_status, rating, tagIds } = item;
  return { name, warmth, wear_status, rating, tagIds };
}

/** Turns `in_laundry` into `In laundry` for display. */
export function label(value: string) {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
