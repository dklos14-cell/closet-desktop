import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chips';
import { OutfitBoard } from '@/components/outfit-board';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { fetchOutfits, type OutfitWithItems } from '@/lib/outfits';
import { useProfile } from '@/lib/profile-store';
import {
  deleteRecurring,
  describeWeekdays,
  fetchRecurring,
  saveRecurring,
  type RecurringEvent,
  type RecurringFields,
} from '@/lib/recurring';

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMPTY: RecurringFields = { name: '', weekdays: [], outfit_id: null };

/**
 * Events that repeat every week ("Office party, every Friday"). They show up on Today on those
 * days with their outfit, and they (and their outfits) are kept when a new month starts.
 */
export default function RepeatingEventsScreen() {
  const theme = useTheme();
  const weekStartsOn = useProfile().profile.week_start;
  const [events, setEvents] = useState<RecurringEvent[] | null>(null);
  const [outfits, setOutfits] = useState<OutfitWithItems[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; fields: RecurringFields } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchRecurring(), fetchOutfits()])
      .then(([evts, outs]) => {
        setEvents(evts);
        setOutfits(outs);
      })
      .catch((e) => showMessage('Could not load', e.message));
  }, []);
  useFocusEffect(load);

  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (i + weekStartsOn) % 7);
  const outfitById = new Map(outfits.map((o) => [o.id, o]));

  async function save() {
    if (!editing) return;
    const { fields } = editing;
    if (!fields.name.trim()) return showMessage('Give it a name', 'For example "Office party".');
    if (fields.weekdays.length === 0) return showMessage('Pick a day', 'Choose which day(s) of the week it repeats on.');
    setSaving(true);
    try {
      await saveRecurring(editing.id, fields);
      setEditing(null);
      load();
    } catch (e) {
      showMessage('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(event: RecurringEvent) {
    if (!(await confirmAction(`Delete "${event.name}"?`, 'Its outfit is kept.', 'Delete'))) return;
    deleteRecurring(event.id)
      .then(load)
      .catch((e) => showMessage('Could not delete', e.message));
  }

  if (!events) return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.background }} />;

  const set = (patch: Partial<RecurringFields>) =>
    setEditing((e) => (e ? { ...e, fields: { ...e.fields, ...patch } } : e));

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text style={{ color: theme.textSecondary }}>
        Events that happen every week. They appear on Today on their days, and they stay when a new
        month starts (other one-off days are cleared each month).
      </Text>

      {editing ? (
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.title, { color: theme.textSecondary }]}>
            {editing.id ? 'Edit event' : 'New repeating event'}
          </Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
            placeholder="Name, e.g. Office party"
            placeholderTextColor={theme.textSecondary}
            value={editing.fields.name}
            onChangeText={(name) => set({ name })}
            maxLength={60}
          />
          <Text style={[styles.title, { color: theme.textSecondary }]}>Repeats every</Text>
          <View style={styles.row}>
            {order.map((d) => (
              <Chip
                key={d}
                text={SHORT[d]}
                selected={editing.fields.weekdays.includes(d)}
                onPress={() =>
                  set({
                    weekdays: editing.fields.weekdays.includes(d)
                      ? editing.fields.weekdays.filter((x) => x !== d)
                      : [...editing.fields.weekdays, d],
                  })
                }
              />
            ))}
          </View>
          <Text style={[styles.title, { color: theme.textSecondary }]}>Outfit (optional)</Text>
          {outfits.length === 0 ? (
            <Text style={{ color: theme.textSecondary }}>Make an outfit first (Outfits → New).</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {outfits.map((o) => {
                const chosen = editing.fields.outfit_id === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => set({ outfit_id: chosen ? null : o.id })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen }}
                    style={[styles.pick, { borderColor: chosen ? theme.tint : 'transparent', backgroundColor: theme.background }]}>
                    <OutfitBoard items={o.items} />
                    <Text style={{ color: theme.text, fontSize: 13 }} numberOfLines={1}>
                      {o.name || 'Untitled'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Button title="Save event" onPress={save} busy={saving} />
          <Button title="Cancel" variant="secondary" onPress={() => setEditing(null)} />
        </View>
      ) : (
        <Button title="+ New repeating event" onPress={() => setEditing({ id: null, fields: EMPTY })} />
      )}

      {events.length === 0 && !editing ? (
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>No repeating events yet.</Text>
      ) : null}

      {events.map((event) => {
        const outfit = event.outfit_id ? outfitById.get(event.outfit_id) : undefined;
        return (
          <View key={event.id} style={[styles.card, styles.eventRow, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.eventBoard}>{outfit ? <OutfitBoard items={outfit.items} /> : null}</View>
            <View style={styles.flex}>
              <Text style={[styles.eventName, { color: theme.text }]}>🔁 {event.name}</Text>
              <Text style={{ color: theme.textSecondary }}>{describeWeekdays(event.weekdays, weekStartsOn)}</Text>
              <Text style={{ color: theme.textSecondary }}>{outfit ? `Outfit: ${outfit.name || 'Untitled'}` : 'No outfit yet'}</Text>
              <View style={styles.row}>
                <Chip
                  text="Edit"
                  selected={false}
                  onPress={() =>
                    setEditing({ id: event.id, fields: { name: event.name, weekdays: event.weekdays, outfit_id: event.outfit_id } })
                  }
                />
                <Chip text="Delete" selected={false} onPress={() => remove(event)} />
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  input: { borderRadius: 10, padding: 12, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pick: { width: 110, borderRadius: 12, borderWidth: 3, padding: 4, gap: 4 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  eventBoard: { width: 72 },
  eventName: { fontSize: 17, fontWeight: '700' },
  flex: { flex: 1, gap: 4 },
});
