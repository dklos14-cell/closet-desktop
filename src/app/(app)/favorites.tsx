import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OutfitCard } from '@/components/outfit-card';
import { NewTagChip } from '@/components/tag-picker';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { peek } from '@/lib/cache';
import { showMessage } from '@/lib/dialogs';
import { fetchOutfits, fetchOutfitWearStats, setFavorite, type OutfitWithItems } from '@/lib/outfits';
import { useTags } from '@/lib/tag-store';

const CARD_WIDTH = 160;

/**
 * Favorite outfits, grouped by the user's favorite lists ("Date night", "Everyday"…).
 * An outfit can be in several lists; favorites in no list appear under "Not in a list".
 */
export default function FavoritesScreen() {
  const theme = useTheme();
  const { ofKind } = useTags();
  const [outfits, setOutfits] = useState<OutfitWithItems[] | null>(
    () => peek<OutfitWithItems[]>('outfits')?.filter((o) => o.is_favorite) ?? null,
  );
  const [worn, setWorn] = useState<Map<string, { wear_count: number }>>(() => peek('outfit-wear') ?? new Map());

  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchOutfits(), fetchOutfitWearStats()])
        .then(([all, wear]) => {
          setOutfits(all.filter((o) => o.is_favorite));
          setWorn(wear);
        })
        .catch((e) => showMessage('Could not load favorites', e.message));
    }, []),
  );

  function unfavorite(outfit: OutfitWithItems) {
    setOutfits((all) => all?.filter((o) => o.id !== outfit.id) ?? null);
    setFavorite(outfit.id, false).catch((e) => showMessage('Could not save', e.message));
  }

  if (!outfits) return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.background }} />;

  const lists = ofKind('favorite');
  const sections = [
    ...lists.map((list) => ({ key: list.id, title: list.name, outfits: outfits.filter((o) => o.tagIds.includes(list.id)) })),
    {
      key: 'none',
      title: 'Not in a list',
      outfits: outfits.filter((o) => !o.tagIds.some((t) => lists.some((l) => l.id === t))),
    },
  ].filter((s) => s.key !== 'none' || s.outfits.length > 0);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      {outfits.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No favorites yet</Text>
          <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
            Tap ♡ on an outfit (in Outfits or on Today) to save it here, then sort it into lists
            in the outfit&apos;s editor.
          </Text>
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.key} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {section.title} <Text style={{ color: theme.textSecondary }}>({section.outfits.length})</Text>
          </Text>
          {section.outfits.length === 0 ? (
            <Text style={{ color: theme.textSecondary }}>Nothing here yet.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {section.outfits.map((o) => (
                <OutfitCard
                  key={o.id}
                  outfit={o}
                  width={CARD_WIDTH}
                  timesWorn={worn.get(o.id)?.wear_count ?? 0}
                  onToggleFavorite={unfavorite}
                />
              ))}
            </ScrollView>
          )}
        </View>
      ))}

      <View style={styles.newList}>
        <Text style={{ color: theme.textSecondary }}>Make a new list:</Text>
        <NewTagChip kind="favorite" onCreated={() => {}} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  empty: { borderRadius: 16, padding: Spacing.four, alignItems: 'center', gap: Spacing.two },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  section: { gap: Spacing.two },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  row: { gap: Spacing.three },
  newList: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
