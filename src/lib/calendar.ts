import { remember } from '@/lib/cache';
import { getDb, newId, now, saveDb } from '@/lib/db';
import { outfitWithItems, type OutfitWithItems } from '@/lib/outfits';

/** Quick "how did it go" reactions for a worn outfit. Keep in sync with the migration's CHECK. */
export const REACTIONS = [
  { key: 'loved', emoji: '😍', label: 'Loved it' },
  { key: 'comfy', emoji: '😌', label: 'Comfy' },
  { key: 'compliments', emoji: '🙌', label: 'Got compliments' },
  { key: 'too_warm', emoji: '🥵', label: 'Too warm' },
  { key: 'too_cold', emoji: '🥶', label: 'Too cold' },
] as const;
export type Reaction = (typeof REACTIONS)[number]['key'];

export type CalendarEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  note: string | null;
  reactions: Reaction[];
  outfit: OutfitWithItems | null;
};

/** Local-time YYYY-MM-DD (toISOString would shift the day for anyone west of UTC). */
export function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** First day of the week containing `d`. weekStartsOn: 0 = Sunday, 1 = Monday. */
export function startOfWeek(d: Date, weekStartsOn: 0 | 1): Date {
  const back = (d.getDay() - weekStartsOn + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** All entries from `first` to `last` (inclusive, YYYY-MM-DD). */
export async function fetchRange(first: string, last: string): Promise<CalendarEntry[]> {
  const db = await getDb();
  const outfits = new Map(db.outfits.map((o) => [o.id, o]));
  const rows = db.calendar_entries
    .filter((e) => e.date >= first && e.date <= last)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return remember(
    `calendar:${first}:${last}`,
    rows.map((r) => {
      const outfit = r.outfit_id ? outfits.get(r.outfit_id) : undefined;
      return {
        id: r.id,
        date: r.date,
        note: r.note,
        reactions: (r.reactions ?? []) as Reaction[],
        outfit: outfit ? outfitWithItems(db, outfit) : null,
      };
    }),
  );
}

/** All entries in one month. `month` is 0-11 like Date.getMonth(). */
export function fetchMonth(year: number, month: number): Promise<CalendarEntry[]> {
  return fetchRange(toDateString(new Date(year, month, 1)), toDateString(new Date(year, month + 1, 0)));
}

export async function addEntry(date: string, outfitId: string, note: string | null): Promise<void> {
  const db = await getDb();
  db.calendar_entries.push({ id: newId(), date, outfit_id: outfitId, note, reactions: [], created_at: now() });
  await saveDb();
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDb();
  db.calendar_entries = db.calendar_entries.filter((e) => e.id !== id);
  await saveDb();
}

export async function setReactions(id: string, reactions: Reaction[]): Promise<void> {
  const db = await getDb();
  const entry = db.calendar_entries.find((e) => e.id === id);
  if (!entry) throw new Error('This day no longer exists.');
  entry.reactions = reactions;
  await saveDb();
}
