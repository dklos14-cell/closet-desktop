import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ClosetFilterBar, useClosetFilter } from '@/components/closet-filters';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { startAddItem } from '@/lib/add-item';
import { backfillThumbnails } from '@/lib/backfill';
import { peek } from '@/lib/cache';
import { showMessage } from '@/lib/dialogs';
import { fetchItems, type ItemWithUrl } from '@/lib/items';
import { useTags } from '@/lib/tag-store';

/** Aim for tiles about this wide: 3 columns on a phone, 5-6 on a tablet. */
const TARGET_TILE_WIDTH = 130;

export default function ClosetScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  // Start from the last-loaded closet (instant), then refresh.
  const [items, setItems] = useState<ItemWithUrl[]>(() => peek<ItemWithUrl[]>('items') ?? []);
  const [loading, setLoading] = useState(() => !peek('items'));
  const { byId } = useTags();
  // ?tag=<id> (from the Tags screen) opens the closet filtered to that tag.
  const { tag } = useLocalSearchParams<{ tag?: string }>();
  const { visible, filter, setFilter, search, setSearch } = useClosetFilter(items, tag ? [tag] : []);
  const [lastTag, setLastTag] = useState(tag);
  if (tag !== lastTag) {
    setLastTag(tag);
    setFilter(tag ? [tag] : []);
  }

  // Reload whenever the tab comes into view (e.g. after saving a new item).
  useFocusEffect(
    useCallback(() => {
      fetchItems()
        .then((loaded) => {
          setItems(loaded);
          // Older items have no thumbnail yet: make them quietly, then reload.
          backfillThumbnails(loaded, () => fetchItems().then(setItems).catch(() => {}));
        })
        .catch((e) => showMessage('Could not load your closet', e.message))
        .finally(() => setLoading(false));
    }, []),
  );


  const columns = Math.max(3, Math.floor(width / TARGET_TILE_WIDTH));
  const tileSize = (width - Spacing.three * 2 - Spacing.two * (columns - 1)) / columns;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={startAddItem} hitSlop={10} accessibilityLabel="Add item">
              <Text style={[styles.addButton, { color: theme.tint }]}>Add</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={visible}
        keyExtractor={(item) => item.id}
        // FlatList can't change numColumns in place, so the key forces a fresh list on rotation.
        key={columns}
        numColumns={columns}
        columnWrapperStyle={styles.column}
        ListHeaderComponent={
          <View style={styles.filters}>
            <ClosetFilterBar filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.empty} />
          ) : (
            <Text style={[styles.empty, { color: theme.textSecondary }]}>
              {items.length === 0 ? 'No items yet. Tap Add to photograph one.' : 'No items match these filters.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/closet/[id]', params: { id: item.id } }, { withAnchor: true })}
            style={[
              styles.tile,
              { width: tileSize, height: tileSize, backgroundColor: theme.backgroundElement },
            ]}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl, cacheKey: item.image_path }}
                style={styles.image}
                contentFit="contain"
                accessibilityLabel={item.name ?? item.tagIds.map((id) => byId.get(id)?.name).join(', ')}
              />
            ) : null}
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.three, gap: Spacing.two },
  column: { gap: Spacing.two },
  filters: { gap: Spacing.two, marginBottom: Spacing.two },
  tile: { borderRadius: 12, padding: Spacing.two },
  image: { flex: 1 },
  empty: { marginTop: Spacing.five, textAlign: 'center', fontSize: 16 },
  addButton: { fontSize: 17, fontWeight: '600' },
});
