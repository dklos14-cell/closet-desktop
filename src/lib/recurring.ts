import { remember } from '@/lib/cache';
import { getDb, newId, now, saveDb } from '@/lib/db';

/** "Office party, every Friday": repeats on these weekdays (0 = Sunday … 6 = Saturday). */
export type RecurringEvent = {
  id: string;
  name: string;
  weekdays: number[];
  outfit_id: string | null;
};

export type RecurringFields = Pick<RecurringEvent, 'name' | 'weekdays' | 'outfit_id'>;

export async function fetchRecurring(): Promise<RecurringEvent[]> {
  const db = await getDb();
  const rows = [...db.recurring_events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return remember(
    'recurring',
    rows.map(({ id, name, weekdays, outfit_id }) => ({ id, name, weekdays, outfit_id })),
  );
}

export async function saveRecurring(id: string | null, fields: RecurringFields): Promise<void> {
  const db = await getDb();
  const row = { ...fields, name: fields.name.trim() };
  if (id) {
    const existing = db.recurring_events.find((r) => r.id === id);
    if (!existing) throw new Error('This event no longer exists.');
    Object.assign(existing, row);
  } else {
    db.recurring_events.push({ ...row, id: newId(), created_at: now() });
  }
  await saveDb();
}

export async function deleteRecurring(id: string): Promise<void> {
  const db = await getDb();
  db.recurring_events = db.recurring_events.filter((r) => r.id !== id);
  await saveDb();
}

/** Events that repeat on the weekday of `date` (YYYY-MM-DD). */
export function eventsOn(events: RecurringEvent[], date: string): RecurringEvent[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return events.filter((e) => e.weekdays.includes(weekday));
}

const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "every Friday", "every Mon & Wed", "every day". */
export function describeWeekdays(weekdays: number[], weekStartsOn: 0 | 1): string {
  if (weekdays.length === 7) return 'every day';
  const sorted = [...weekdays].sort((a, b) => ((a - weekStartsOn + 7) % 7) - ((b - weekStartsOn + 7) % 7));
  if (sorted.length === 1) return `every ${NAMES[sorted[0]]}`;
  return `every ${sorted.map((d) => NAMES[d].slice(0, 3)).join(' & ')}`;
}
