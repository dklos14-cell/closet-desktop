import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OutfitBoard } from '@/components/outfit-board';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { OutfitWithItems } from '@/lib/outfits';

/**
 * An outfit as a small card: the whole look, its name, and its rating (only once it's been
 * worn). The ♥ saves it to / removes it from Favorites.
 */
export function OutfitCard({
  outfit,
  timesWorn,
  width,
  onToggleFavorite,
}: {
  outfit: OutfitWithItems;
  timesWorn: number;
  width: number;
  onToggleFavorite: (outfit: OutfitWithItems) => void;
}) {
  const theme = useTheme();
  const rating =
    timesWorn === 0
      ? 'Not worn yet'
      : outfit.rating
        ? '★'.repeat(outfit.rating) + '☆'.repeat(5 - outfit.rating)
        : `Worn ${timesWorn}× · tap to rate`;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/outfits/edit', params: { id: outfit.id } }, { withAnchor: true })}
      style={[styles.card, { width, backgroundColor: theme.backgroundElement }]}>
      <OutfitBoard items={outfit.items} style={{ backgroundColor: theme.background }} />
      <View style={styles.footer}>
        <View style={styles.flex}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {outfit.name || 'Untitled outfit'}
          </Text>
          <Text style={{ color: outfit.rating && timesWorn ? theme.tint : theme.textSecondary, fontSize: 13 }}>
            {rating}
          </Text>
        </View>
        <Pressable
          onPress={() => onToggleFavorite(outfit)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={outfit.is_favorite ? 'Remove from favorites' : 'Add to favorites'}>
          <Text style={[styles.heart, { color: outfit.is_favorite ? theme.danger : theme.textSecondary }]}>
            {outfit.is_favorite ? '♥' : '♡'}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.two, gap: Spacing.two },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.one },
  flex: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  heart: { fontSize: 24 },
});
