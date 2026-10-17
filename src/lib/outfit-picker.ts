import type { ItemWithUrl } from '@/lib/items';
import { slotOf, type Slot } from '@/lib/outfit-board';
import type { Tag, Warmth } from '@/lib/tags';

/**
 * "Pick an outfit for me". Each ready item gets a score for how well it fits what you asked for
 * (occasion, style, weather, season) and how you've used it (rating, last worn); the outfit as a
 * whole gets a score for how its pieces go together (colors, patterns, matching style). Many
 * random outfits are tried, weighted towards good pieces, and the best one wins, so Shuffle gives
 * a different good outfit each time. Reroll swaps one piece for the next best fit with the rest.
 */

export type PickOptions = {
  occasionId: string | null;
  styleId: string | null;
  /** What the weather calls for; null = don't care. */
  warmth: Warmth | null;
  /** The date being dressed for (season and "worn recently" are counted from it). */
  date: string;
};

/** The slots an outfit can have, in the order they're listed. */
export const PICK_SLOTS: Slot[] = ['outer', 'top', 'dress', 'bottom', 'feet', 'head', 'side'];

export const SLOT_NAMES: Record<Slot, string> = {
  head: 'Hat',
  outer: 'Jacket / layer',
  top: 'Top',
  dress: 'Dress / one-piece',
  bottom: 'Bottoms',
  feet: 'Shoes',
  side: 'Bag / accessory',
  other: 'Other',
};

/** An item, read once for picking. */
export type Piece = {
  item: ItemWithUrl;
  slot: Slot;
  colors: string[]; // lower-case color tag names
  patterned: boolean; // has a pattern other than solid
  styleIds: string[];
  occasionIds: string[];
  seasons: string[]; // lower-case
  lastWorn: string | null;
};

/** The chosen outfit: one item per slot. */
export type Picked = Partial<Record<Slot, string>>;

export function buildPool(
  items: ItemWithUrl[],
  byId: Map<string, Tag>,
  wear: Map<string, { last_worn: string | null }>,
): Piece[] {
  return items
    .filter((it) => it.wear_status === 'ready')
    .map((item) => {
      const tags = item.tagIds.flatMap((id) => byId.get(id) ?? []);
      const names = (kind: string) => tags.filter((t) => t.kind === kind).map((t) => t.name.toLowerCase());
      const patterns = names('pattern');
      return {
        item,
        slot: slotOf(names('type')),
        colors: names('color'),
        patterned: patterns.some((p) => p !== 'solid' && p !== 'textured'),
        styleIds: tags.filter((t) => t.kind === 'style').map((t) => t.id),
        occasionIds: tags.filter((t) => t.kind === 'occasion').map((t) => t.id),
        seasons: names('season'),
        lastWorn: wear.get(item.id)?.last_worn ?? null,
      };
    })
    .filter((p) => p.slot !== 'other');
}

// ---- one piece on its own ------------------------------------------------------------------

const WARMTH_LEVEL: Record<Warmth, number> = { light: 0, medium: 1, heavy: 2 };

/** Northern-hemisphere season of a YYYY-MM-DD date. */
function seasonOf(date: string): string {
  const m = Number(date.slice(5, 7));
  return m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall';
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** How well one item fits the request, with the reasons shown under it. */
export function pieceScore(p: Piece, opts: PickOptions, byId: Map<string, Tag>): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (opts.occasionId) {
    const name = byId.get(opts.occasionId)?.name ?? '';
    if (p.occasionIds.includes(opts.occasionId)) {
      score += 3;
      reasons.push(`for ${name}`);
    } else if (p.occasionIds.length > 0) score -= 2; // tagged for other occasions only
  }
  if (opts.styleId) {
    const name = byId.get(opts.styleId)?.name ?? '';
    if (p.styleIds.includes(opts.styleId)) {
      score += 2;
      reasons.push(`${name} style`);
    } else if (p.styleIds.length > 0) score -= 0.5;
  }

  const warmth = p.item.warmth;
  if (opts.warmth && warmth) {
    const gap = Math.abs(WARMTH_LEVEL[opts.warmth] - WARMTH_LEVEL[warmth]);
    // A layer is about adding warmth: on cold days a heavy one is right.
    if (gap === 0) {
      score += 1.5;
      reasons.push(`${warmth} for the weather`);
    } else if (gap === 2) {
      score -= 3;
      reasons.push(WARMTH_LEVEL[warmth] > WARMTH_LEVEL[opts.warmth] ? 'may be too warm' : 'may be too light');
    }
  }

  const season = seasonOf(opts.date);
  if (p.seasons.length > 0) {
    if (p.seasons.includes(season)) score += 1;
    else {
      score -= 1.5;
      reasons.push(`more of a ${p.seasons[0]} piece`);
    }
  }

  if (p.item.rating) {
    score += (p.item.rating - 3) * 0.5;
    if (p.item.rating >= 4) reasons.push(`rated ${'★'.repeat(p.item.rating)}`);
  }

  if (p.lastWorn) {
    const ago = daysBetween(p.lastWorn, opts.date);
    if (ago >= 0 && ago <= 2) {
      score -= 2;
      reasons.push(ago === 0 ? 'already worn that day' : 'worn very recently');
    } else if (ago >= 21) {
      score += 0.5;
      reasons.push('not worn in a while');
    }
  } else {
    score += 0.5;
    reasons.push('never worn yet');
  }
  return { score, reasons };
}

// ---- how the pieces go together -----------------------------------------------------------

const NEUTRALS = new Set([
  'black', 'white', 'gray', 'grey', 'beige', 'brown', 'navy', 'cream', 'khaki', 'tan', 'denim', 'silver', 'gold',
  'ivory', 'charcoal', 'camel', 'taupe', 'off-white',
]);

/** Color name → hue in degrees (for the colors that aren't neutrals). */
const HUES: [string, number][] = [
  ['red', 0], ['burgundy', 345], ['maroon', 345], ['coral', 15], ['orange', 30], ['rust', 20], ['mustard', 48],
  ['yellow', 55], ['olive', 75], ['lime', 90], ['green', 120], ['mint', 150], ['teal', 175], ['turquoise', 180],
  ['sky', 200], ['blue', 220], ['purple', 275], ['lavender', 270], ['lilac', 280], ['magenta', 310], ['pink', 330],
];

function hueOf(color: string): number | null {
  for (const [word, hue] of HUES) if (color.includes(word)) return hue;
  return null;
}

/** The main non-neutral color of a piece: a hue, 'multi' (multicolor), or null (neutral / untagged). */
function accentOf(p: Piece): number | 'multi' | null {
  for (const c of p.colors) {
    if (NEUTRALS.has(c)) continue;
    if (c.includes('multi') || c.includes('rainbow')) return 'multi';
    const hue = hueOf(c);
    if (hue !== null) return hue;
  }
  return null;
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Colors, patterns and style working together. Returns the score and a sentence about it. */
export function harmony(pieces: Piece[], opts: PickOptions, byId: Map<string, Tag>): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  // Colors: neutrals go with anything; one or two colors that suit each other look intended.
  const accents = pieces.map(accentOf).filter((a) => a !== null);
  const hues = [...new Set(accents.filter((a): a is number => a !== 'multi').map((h) => Math.round(h / 30)))].map((h) => h * 30);
  const multi = accents.filter((a) => a === 'multi').length;
  if (accents.length === 0) {
    score += 1;
    if (pieces.some((p) => p.colors.length > 0)) notes.push('Neutral colors that go together');
  } else if (hues.length + multi === 1) {
    score += 2;
    notes.push(multi ? 'One colorful piece with calm colors around it' : 'One color, the rest neutral');
  } else if (multi > 0) {
    score -= 1.5 * (hues.length + multi - 1);
    notes.push('Lots of colors at once');
  } else if (hues.length === 2) {
    const gap = hueGap(hues[0], hues[1]);
    if (gap <= 45) {
      score += 1.5;
      notes.push('Colors next to each other on the color wheel');
    } else if (gap >= 150) {
      score += 1.5;
      notes.push('Opposite colors that set each other off');
    } else score -= 1;
  } else {
    score -= 2 * (hues.length - 2);
    notes.push('Lots of colors at once');
  }

  // Patterns: one is a statement; two or more compete.
  const patterned = pieces.filter((p) => p.patterned && p.slot !== 'side').length;
  if (patterned === 1) {
    score += 1;
    notes.push('One patterned piece');
  } else if (patterned >= 2) {
    score -= 2 * (patterned - 1);
    notes.push('Several patterns');
  }

  // Without a chosen style: pieces sharing a style look like they belong together.
  if (!opts.styleId) {
    const count = new Map<string, number>();
    for (const p of pieces) for (const s of p.styleIds) count.set(s, (count.get(s) ?? 0) + 1);
    const [best, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    if (best && n >= 2) {
      score += Math.min(2, n - 1);
      notes.push(`${byId.get(best)?.name ?? ''} style throughout`);
    }
    const names = new Set(pieces.flatMap((p) => p.styleIds.map((s) => byId.get(s)?.name.toLowerCase())));
    if (names.has('sporty') && names.has('dressy')) score -= 1.5;
  }
  return { score, notes };
}

// ---- choosing --------------------------------------------------------------------------------

/** Which slots this outfit should fill: separates or a dress, shoes, and a layer when it's cold. */
function plan(pool: Piece[], opts: PickOptions, locked: Picked): Slot[] {
  const has = (slot: Slot) => pool.some((p) => p.slot === slot) || !!locked[slot];
  const slots: Slot[] = [];
  const separates = has('top') && has('bottom');
  const useDress =
    !!locked.dress || (!locked.top && !locked.bottom && has('dress') && (!separates || Math.random() < 0.3));
  if (useDress) slots.push('dress');
  else {
    if (has('top')) slots.push('top');
    if (has('bottom')) slots.push('bottom');
  }
  if (has('feet')) slots.push('feet');
  const cold = opts.warmth === 'heavy';
  const mild = opts.warmth === 'medium';
  if (locked.outer || (has('outer') && (cold || (mild && Math.random() < 0.6) || (!opts.warmth && Math.random() < 0.3)))) {
    slots.push('outer');
  }
  if (locked.head || (has('head') && Math.random() < (cold ? 0.5 : 0.2))) slots.push('head');
  if (locked.side || (has('side') && Math.random() < 0.4)) slots.push('side');
  return slots;
}

function softmaxPick<T>(options: T[], weightOf: (o: T) => number, temperature = 1): T {
  const ws = options.map((o) => Math.exp(weightOf(o) / temperature));
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    r -= ws[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

export type Scorer = {
  piece: (id: string) => Piece | undefined;
  single: (id: string) => { score: number; reasons: string[] };
  total: (picked: Picked) => number;
};

/** Caches each item's own score for one set of options. */
export function makeScorer(pool: Piece[], opts: PickOptions, byId: Map<string, Tag>): Scorer {
  const byItem = new Map(pool.map((p) => [p.item.id, p]));
  const singles = new Map(pool.map((p) => [p.item.id, pieceScore(p, opts, byId)]));
  return {
    piece: (id) => byItem.get(id),
    single: (id) => singles.get(id) ?? { score: 0, reasons: [] },
    total(picked) {
      const pieces = Object.values(picked).flatMap((id) => byItem.get(id!) ?? []);
      return pieces.reduce((sum, p) => sum + singles.get(p.item.id)!.score, 0) + harmony(pieces, opts, byId).score;
    },
  };
}

const REPEAT_PENALTY = 1.5; // Shuffle: how much less a piece from the last outfit counts

/**
 * A whole new outfit. Pieces in `locked` stay; pieces in `avoid` (the outfit being shuffled
 * away) count a little less, so Shuffle brings something new without settling for a bad fit.
 * Returns null if the closet doesn't have enough to make one.
 */
export function pickOutfit(pool: Piece[], scorer: Scorer, opts: PickOptions, locked: Picked, avoid: Set<string>): Picked | null {
  const bySlot = new Map<Slot, Piece[]>();
  for (const p of pool) bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), p]);
  const repeats = (picked: Picked) =>
    Object.entries(picked).filter(([slot, id]) => !locked[slot as Slot] && avoid.has(id!)).length;
  let best: Picked | null = null;
  let bestScore = -Infinity;
  for (let round = 0; round < 250; round++) {
    const picked: Picked = {};
    for (const slot of plan(pool, opts, locked)) {
      if (locked[slot]) picked[slot] = locked[slot];
      else {
        const options = bySlot.get(slot);
        const weight = (p: Piece) => scorer.single(p.item.id).score - (avoid.has(p.item.id) ? REPEAT_PENALTY : 0);
        if (options?.length) picked[slot] = softmaxPick(options, weight).item.id;
      }
    }
    if (!picked.dress && !picked.top && !picked.bottom) continue;
    // A little randomness, so equally good outfits take turns.
    const score = scorer.total(picked) - repeats(picked) * REPEAT_PENALTY + Math.random() * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = picked;
    }
  }
  return best;
}

/**
 * Reroll one piece: the best-fitting item for that slot (with the rest of the outfit as it is)
 * that hasn't been shown there yet. When all have been shown, starts over.
 */
export function rerollSlot(pool: Piece[], scorer: Scorer, picked: Picked, slot: Slot, seen: Set<string>): string | null {
  const options = pool.filter((p) => p.slot === slot && p.item.id !== picked[slot]);
  if (options.length === 0) return null;
  let fresh = options.filter((p) => !seen.has(p.item.id));
  if (fresh.length === 0) {
    seen.clear();
    fresh = options;
  }
  const rank = (p: Piece) => scorer.total({ ...picked, [slot]: p.item.id });
  return fresh.reduce((a, b) => (rank(b) > rank(a) ? b : a)).item.id;
}

/** Slots that could still be added to this outfit (there's something in the closet for them). */
export function addableSlots(pool: Piece[], picked: Picked): Slot[] {
  return PICK_SLOTS.filter((slot) => {
    if (picked[slot]) return false;
    if (slot === 'dress' && (picked.top || picked.bottom)) return false;
    if ((slot === 'top' || slot === 'bottom') && picked.dress) return false;
    return pool.some((p) => p.slot === slot);
  });
}
