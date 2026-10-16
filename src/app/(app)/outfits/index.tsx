import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { OutfitCard } from '@/components/outfit-card';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { peek } from '@/lib/cache';
import { showMessage } from '@/lib/dialogs';
import { fetchOutfits, fetchOutfitWearStats, setFavorite, type OutfitWithItems } from '@/lib/outfits';

const TARGET_CARD_WIDTH = 170;

/** All outfits as a grid of "whole look" cards. ♡ saves one to Favorites. */
export default function OutfitsScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [outfits, setOutfits] = useState<OutfitWithItems[]>(() => peek<OutfitWithItems[]>('outfits') ?? []);
  const [worn, setWorn] = useState<Map<string, { wear_count: number }>>(() => peek('outfit-wear') ?? new Map());
  const [loading, setLoading] = useState(() => !peek('outfits'));

  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchOutfits(), fetchOutfitWearStats()])
        .then(([all, wear]) => {
          setOutfits(all);
          setWorn(wear);
        })
        .catch((e) => showMessage('Could not load outfits', e.message))
        .finally(() => setLoading(false));
    }, []),
  );

  function toggleFavorite(outfit: OutfitWithItems) {
    const next = !outfit.is_favorite;
    setOutfits((all) => all.map((o) => (o.id === outfit.id ? { ...o, is_favorite: next } : o)));
    setFavorite(outfit.id, next).catch((e) => showMessage('Could not save', e.message));
  }

  const contentWidth = Math.min(width, MaxContentWidth) - Spacing.three * 2;
  const columns = Math.max(2, Math.floor(contentWidth / TARGET_CARD_WIDTH));
  const cardWidth = (contentWidth - Spacing.three * (columns - 1)) / columns;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/outfits/edit', { withAnchor: true })} hitSlop={10} accessibilityLabel="New outfit">
              <Text style={[styles.headerButton, { color: theme.tint }]}>New</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={outfits}
        keyExtractor={(o) => o.id}
        // FlatList can't change numColumns in place, so the key forces a fresh list on resize.
        key={columns}
        numColumns={columns}
        columnWrapperStyle={styles.column}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.empty} />
          ) : (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              No outfits yet. Tap New to put one together from your closet.
            </Text>
          )
        }
        renderItem={({ item: outfit }) => (
          <OutfitCard
            outfit={outfit}
            width={cardWidth}
            timesWorn={worn.get(outfit.id)?.wear_count ?? 0}
            onToggleFavorite={toggleFavorite}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  column: { gap: Spacing.three },
  empty: { marginTop: Spacing.five, textAlign: 'center', fontSize: 16 },
  headerButton: { fontSize: 17, fontWeight: '600' },
});
