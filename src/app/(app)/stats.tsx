import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ThumbStrip } from '@/components/thumb-strip';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchRange, REACTIONS, toDateString, type CalendarEntry } from '@/lib/calendar';
import { showMessage } from '@/lib/dialogs';
import { fetchItems, fetchWearStats, type ItemWithUrl } from '@/lib/items';
import { fetchOutfits, type OutfitWithItems } from '@/lib/outfits';
import { useTags } from '@/lib/tag-store';
import { label } from '@/lib/tags';

type Data = {
  items: ItemWithUrl[];
  wear: Awaited<ReturnType<typeof fetchWearStats>>;
  outfits: OutfitWithItems[];
  month: CalendarEntry[];
};

/** Numbers about the closet: most and least worn, what you own by type, ratings, reactions. */
export default function StatsScreen() {
  const theme = useTheme();
  const { ofKind } = useTags();
  const [data, setData] = useState<Data | null>(null);

  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      Promise.all([
        fetchItems(),
        fetchWearStats(),
        fetchOutfits(),
        fetchRange(
          toDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
          toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        ),
      ])
        .then(([items, wear, outfits, month]) => setData({ items, wear, outfits, month }))
        .catch((e) => showMessage('Could not load stats', e.message));
    }, []),
  );

  const stats = useMemo(() => {
    if (!data) return null;
    const { items, wear, outfits, month } = data;
    const worn = (i: ItemWithUrl) => wear.get(i.id)?.wear_count ?? 0;
    const byType = ofKind('type')
      .map((t) => ({ name: t.name, count: items.filter((i) => i.tagIds.includes(t.id)).length }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
    const reactionCounts = REACTIONS.map((r) => ({
      ...r,
      count: month.filter((e) => e.reactions.includes(r.key)).length,
    })).filter((r) => r.count > 0);
    return {
      mostWorn: [...items].filter((i) => worn(i) > 0).sort((a, b) => worn(b) - worn(a)).slice(0, 5),
      neverWorn: items.filter((i) => worn(i) === 0),
      byType,
      topOutfits: [...outfits].filter((o) => o.rating).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3),
      daysLogged: new Set(month.map((e) => e.date)).size,
      statuses: (['in_laundry', 'needs_repair', 'retired'] as const).map((s) => ({
        status: s,
        count: items.filter((i) => i.wear_status === s).length,
      })),
      reactionCounts,
      worn,
    };
  }, [data, ofKind]);

  if (!data || !stats) return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.background }} />;

  const maxType = Math.max(1, ...stats.byType.map((t) => t.count));
  const card = [styles.card, { backgroundColor: theme.backgroundElement }];
  const title = [styles.cardTitle, { color: theme.text }];
  const muted = { color: theme.textSecondary };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <View style={styles.numbers}>
        <Big value={data.items.length} label="items" />
        <Big value={data.outfits.length} label="outfits" />
        <Big value={stats.daysLogged} label="days logged this month" />
      </View>

      <View style={card}>
        <Text style={title}>Most worn</Text>
        {stats.mostWorn.length === 0 ? (
          <Text style={muted}>Log outfits on the Calendar to see what you wear most.</Text>
        ) : (
          stats.mostWorn.map((item) => (
            <Pressable
              key={item.id}
              style={styles.wornRow}
              onPress={() => router.push({ pathname: '/closet/[id]', params: { id: item.id } }, { withAnchor: true })}>
              <ThumbStrip items={[item]} size={44} />
              <Text style={[styles.flex, { color: theme.text }]} numberOfLines={1}>
                {item.name || 'Unnamed item'}
              </Text>
              <Text style={muted}>{stats.worn(item)}×</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={card}>
        <Text style={title}>Not worn yet ({stats.neverWorn.length})</Text>
        {stats.neverWorn.length === 0 ? (
          <Text style={muted}>You&apos;ve worn everything at least once. 🎉</Text>
        ) : (
          <>
            <ThumbStrip items={stats.neverWorn} size={52} max={12} />
            <Text style={muted}>Time to wear these, or think about donating them.</Text>
          </>
        )}
      </View>

      <View style={card}>
        <Text style={title}>Your closet by type</Text>
        {stats.byType.length === 0 ? (
          <Text style={muted}>Tag items with a Type to see this.</Text>
        ) : (
          stats.byType.map((t) => (
            <View key={t.name} style={styles.barRow}>
              <Text style={[styles.barLabel, { color: theme.text }]} numberOfLines={1}>
                {t.name}
              </Text>
              <View style={styles.flex}>
                <View style={[styles.bar, { width: `${(t.count / maxType) * 100}%`, backgroundColor: theme.tint }]} />
              </View>
              <Text style={[styles.barCount, muted]}>{t.count}</Text>
            </View>
          ))
        )}
      </View>

      <View style={card}>
        <Text style={title}>Top-rated outfits</Text>
        {stats.topOutfits.length === 0 ? (
          <Text style={muted}>Rate outfits on the Today screen to see your favorites.</Text>
        ) : (
          stats.topOutfits.map((o) => (
            <Pressable
              key={o.id}
              style={styles.outfitRow}
              onPress={() => router.push({ pathname: '/outfits/edit', params: { id: o.id } }, { withAnchor: true })}>
              <View style={styles.flex}>
                <Text style={{ color: theme.text, fontWeight: '600' }}>{o.name || 'Untitled outfit'}</Text>
                <ThumbStrip items={o.items} size={40} max={5} />
              </View>
              <Text style={{ color: theme.tint }}>{'★'.repeat(o.rating ?? 0)}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={card}>
        <Text style={title}>This month&apos;s reactions</Text>
        {stats.reactionCounts.length === 0 ? (
          <Text style={muted}>Tap the reaction icons on the Today screen after wearing an outfit.</Text>
        ) : (
          <View style={styles.reactionRow}>
            {stats.reactionCounts.map((r) => (
              <Text key={r.key} style={{ color: theme.text, fontSize: 16 }}>
                {r.emoji} {r.count}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={card}>
        <Text style={title}>Status</Text>
        {stats.statuses.map((s) => (
          <View key={s.status} style={styles.barRow}>
            <Text style={[styles.flex, { color: theme.text }]}>{label(s.status)}</Text>
            <Text style={muted}>{s.count}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Big({ value, label: text }: { value: number; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.big, { backgroundColor: theme.backgroundElement }]}>
      <Text style={[styles.bigValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.bigLabel, { color: theme.textSecondary }]}>{text}</Text>
    </View>
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
  numbers: { flexDirection: 'row', gap: Spacing.two },
  big: { flex: 1, borderRadius: 14, padding: Spacing.three, alignItems: 'center', gap: 2 },
  bigValue: { fontSize: 28, fontWeight: '700' },
  bigLabel: { fontSize: 12, textAlign: 'center' },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  wornRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  barLabel: { width: 90 },
  bar: { height: 10, borderRadius: 5, minWidth: 4 },
  barCount: { width: 28, textAlign: 'right' },
  outfitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
});
