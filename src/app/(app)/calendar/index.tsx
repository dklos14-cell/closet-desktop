import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ThumbStrip } from '@/components/thumb-strip';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/lib/profile-store';
import { useTheme } from '@/hooks/use-theme';
import { deleteEntry, fetchMonth, toDateString, type CalendarEntry } from '@/lib/calendar';
import { showMessage, confirmAction } from '@/lib/dialogs';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sunday first

export default function CalendarScreen() {
  const theme = useTheme();
  const weekStartsOn = useProfile().profile.week_start;
  const today = toDateString(new Date());
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(today);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);

  const load = useCallback(() => {
    fetchMonth(month.year, month.month)
      .then(setEntries)
      .catch((e) => showMessage('Could not load calendar', e.message));
  }, [month]);

  // Reload on focus (e.g. after logging an outfit) and when the month changes.
  useFocusEffect(load);

  function shiftMonth(delta: number) {
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(toDateString(d));
  }

  async function confirmDelete(entry: CalendarEntry) {
    if (!(await confirmAction('Remove this entry?', undefined, 'Remove'))) return;
    deleteEntry(entry.id)
      .then(load)
      .catch((e) => showMessage('Could not remove', e.message));
  }

  // Grid cells: blanks before the 1st, then one cell per day.
  // Blank cells before the 1st, counting from the user's first day of the week.
  const firstWeekday = (new Date(month.year, month.month, 1).getDay() - weekStartsOn + 7) % 7;
  const weekdayLabels = [...WEEKDAYS.slice(weekStartsOn), ...WEEKDAYS.slice(0, weekStartsOn)];
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateString(new Date(month.year, month.month, i + 1))),
  ];
  // First item picture of the first outfit worn each day, shown inside the day's cell.
  const pictureByDate = new Map<string, { uri: string; key: string } | null>();
  for (const e of entries) {
    if (pictureByDate.get(e.date)) continue;
    const item = e.outfit?.items.find((it) => it.imageUrl);
    pictureByDate.set(e.date, item ? { uri: item.imageUrl!, key: item.image_path } : null);
  }
  const dayEntries = entries.filter((e) => e.date === selectedDate);
  const monthTitle = new Date(month.year, month.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const selectedTitle = new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/calendar/repeating', { withAnchor: true })} hitSlop={10} accessibilityLabel="Repeating events">
              <Text style={{ color: theme.tint, fontSize: 17, fontWeight: '600' }}>🔁 Repeating</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.monthHeader}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityLabel="Previous month">
          <Text style={[styles.arrow, { color: theme.tint }]}>‹</Text>
        </Pressable>
        <Text style={[styles.monthTitle, { color: theme.text }]}>{monthTitle}</Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityLabel="Next month">
          <Text style={[styles.arrow, { color: theme.tint }]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {weekdayLabels.map((d, i) => (
          <Text key={i} style={[styles.cell, styles.weekday, { color: theme.textSecondary }]}>
            {d}
          </Text>
        ))}
        {cells.map((date, i) =>
          date ? (
            <Pressable key={date} style={styles.cell} onPress={() => setSelectedDate(date)}>
              <View
                style={[
                  styles.day,
                  { backgroundColor: theme.backgroundElement },
                  date === today && { borderColor: theme.tint },
                  date === selectedDate && { borderColor: theme.tint, backgroundColor: theme.backgroundSelected },
                ]}>
                <Text
                  style={[
                    styles.dayNumber,
                    { color: date === today ? theme.tint : theme.text },
                    date === today && styles.bold,
                  ]}>
                  {Number(date.slice(8))}
                </Text>
                {pictureByDate.get(date) ? (
                  <Image
                    source={{ uri: pictureByDate.get(date)!.uri, cacheKey: pictureByDate.get(date)!.key }}
                    style={styles.dayImage}
                    contentFit="contain"
                  />
                ) : pictureByDate.has(date) ? (
                  <View style={[styles.dot, { backgroundColor: theme.tint }]} />
                ) : null}
              </View>
            </Pressable>
          ) : (
            <View key={`blank-${i}`} style={styles.cell} />
          ),
        )}
      </View>

      <Text style={[styles.dayTitle, { color: theme.text }]}>{selectedTitle}</Text>
      {dayEntries.length === 0 ? (
        <Text style={{ color: theme.textSecondary }}>Nothing logged for this day.</Text>
      ) : (
        dayEntries.map((entry) => (
          <Pressable
            key={entry.id}
            onLongPress={() => confirmDelete(entry)}
            style={[styles.entry, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.entryHeader}>
              <Text style={[styles.entryName, { color: theme.text }]}>
                {entry.outfit ? entry.outfit.name || 'Untitled outfit' : 'Deleted outfit'}
              </Text>
              <Pressable onPress={() => confirmDelete(entry)} hitSlop={10} accessibilityLabel="Remove entry">
                <Text style={{ color: theme.danger }}>Remove</Text>
              </Pressable>
            </View>
            {entry.outfit ? <ThumbStrip items={entry.outfit.items} /> : null}
            {entry.note ? <Text style={{ color: theme.textSecondary }}>{entry.note}</Text> : null}
          </Pressable>
        ))
      )}

      <Button
        title="Log an outfit for this day"
        onPress={() => router.push({ pathname: '/calendar/log', params: { date: selectedDate } }, { withAnchor: true })}
      />
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
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthTitle: { fontSize: 18, fontWeight: '600' },
  arrow: { fontSize: 32, paddingHorizontal: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: 2 },
  weekday: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  day: { aspectRatio: 0.8, borderRadius: 10, padding: 4, borderWidth: 2, borderColor: 'transparent' },
  dayNumber: { fontSize: 13 },
  bold: { fontWeight: '700' },
  dayImage: { flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto' },
  dayTitle: { fontSize: 17, fontWeight: '600' },
  entry: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryName: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
});
