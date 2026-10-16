import type { Tag } from '@/lib/tags';

/**
 * Where an item sits on the outfit board (a 3:4 picture of the whole outfit).
 * x / y: centre, as a fraction of the board's width / height. scale: item width as a
 * fraction of the board's width. rotation in degrees. z: stacking order (higher = in front).
 */
export type Layout = { x: number; y: number; scale: number; rotation: number; z: number };

export const BOARD_ASPECT = 3 / 4; // width / height

type Slot = 'head' | 'top' | 'outer' | 'dress' | 'bottom' | 'feet' | 'side' | 'other';

// Words in a Type tag name → where that kind of item goes on a body.
const SLOT_WORDS: [Slot, string[]][] = [
  ['head', ['hat', 'cap', 'beanie']],
  ['outer', ['jacket', 'coat', 'blazer', 'cardigan', 'vest', 'parka']],
  ['dress', ['dress', 'jumpsuit', 'romper', 'pajama', 'swim']],
  ['top', ['shirt', 'tee', 'blouse', 'sweater', 'hoodie', 'top', 'tank', 'polo', 'sweatshirt', 'jumper']],
  ['bottom', ['pant', 'jean', 'short', 'skirt', 'legging', 'trouser', 'jogger', 'chino']],
  ['feet', ['sock', 'shoe', 'sneaker', 'boot', 'sandal', 'heel', 'loafer', 'slipper', 'flat']],
  ['side', ['bag', 'jewel', 'accessor', 'watch', 'belt', 'scarf', 'glasses', 'necklace', 'earring', 'purse']],
];

// Default spot for each slot: [x, y, scale, z]
const SLOT_SPOTS: Record<Slot, [number, number, number, number]> = {
  head: [0.5, 0.09, 0.26, 4],
  outer: [0.33, 0.33, 0.48, 1],
  top: [0.55, 0.3, 0.46, 3],
  dress: [0.5, 0.42, 0.56, 3],
  bottom: [0.5, 0.63, 0.44, 2],
  feet: [0.5, 0.9, 0.3, 2],
  side: [0.85, 0.5, 0.24, 5],
  other: [0.16, 0.6, 0.24, 5],
};

function slotOf(typeNames: string[]): Slot {
  const text = typeNames.join(' ').toLowerCase();
  for (const [slot, words] of SLOT_WORDS) if (words.some((w) => text.includes(w))) return slot;
  return 'other';
}

/**
 * Arranges items like a person: hat at the top, then tops, bottoms, shoes; bags and jewelry
 * at the side. Several items in the same spot are spread out sideways / downwards.
 */
export function autoLayout(
  items: { id: string; tagIds: string[] }[],
  tagById: Map<string, Tag>,
): Map<string, Layout> {
  const bySlot = new Map<Slot, string[]>();
  for (const item of items) {
    const types = item.tagIds.flatMap((id) => {
      const tag = tagById.get(id);
      return tag?.kind === 'type' ? [tag.name] : [];
    });
    const slot = slotOf(types);
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), item.id]);
  }

  const result = new Map<string, Layout>();
  for (const [slot, ids] of bySlot) {
    const [x, y, scale, z] = SLOT_SPOTS[slot];
    ids.forEach((id, k) => {
      // Side items stack downwards; everything else spreads left/right around its spot.
      const vertical = slot === 'side' || slot === 'other';
      const offset = vertical ? 0 : (k - (ids.length - 1) / 2) * scale * 0.7;
      result.set(id, {
        x: Math.min(0.9, Math.max(0.1, x + offset)),
        y: vertical ? Math.min(0.92, y - 0.25 + k * 0.2) : y,
        scale: ids.length > 2 && !vertical ? scale * 0.8 : scale,
        rotation: 0,
        z: z + k,
      });
    });
  }
  return result;
}
