import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ClosetFilterBar, useClosetFilter } from '@/components/closet-filters';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { startAddItem } from '@/lib/add-item';
import { backfillThumbnails } from '@/lib/backfill';
import { peek } from '@/lib/cache';
import { desktop } from '@/lib/desktop';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { deleteItem, fetchItems, updateItem, type ItemWithUrl } from '@/lib/items';
import { contextMenu, MOD } from '@/lib/keys';
import { label, pickFields, WEAR_STATUSES } from '@/lib/tags';
import { useTags } from '@/lib/tag-store';

/** Aim for tiles about this wide. */
const TARGET_TILE_WIDTH = 150;

export default function ClosetScreen() {
  const theme = useTheme();
  // The space the grid really has (the window minus the sidebar).
  const [width, setWidth] = useState(0);
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
  const reload = useCallback(() => {
    fetchItems()
      .then(setItems)
      .catch(() => {});
  }, []);

  /** Right-click on an item. */
  async function itemMenu(item: ItemWithUrl) {
    const choice = await desktop().popupMenu([
      { id: 'open', label: 'Open' },
      { id: 'recut', label: 'Edit cut-out' },
      {
        label: 'Status',
        submenu: WEAR_STATUSES.map((st) => ({ id: `status:${st}`, label: label(st), checked: item.wear_status === st })),
      },
      { separator: true },
      { id: 'delete', label: 'Delete item…' },
    ]);
    if (choice === 'open') router.push({ pathname: '/closet/[id]', params: { id: item.id } }, { withAnchor: true });
    else if (choice === 'recut') router.push({ pathname: '/closet/recut', params: { id: item.id } }, { withAnchor: true });
    else if (choice?.startsWith('status:')) {
      const wear_status = choice.slice(7) as ItemWithUrl['wear_status'];
      updateItem(item.id, { ...pickFields(item), wear_status })
        .then(reload)
        .catch((e) => showMessage('Could not save', e.message));
    } else if (choice === 'delete') {
      if (!(await confirmAction('Delete this item?', 'It will also be removed from any outfits.', 'Delete'))) return;
      deleteItem(item)
        .then(reload)
        .catch((e) => showMessage('Could not delete', e.message));
    }
  }

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


  const inner = width - Spacing.three * 2;
  const columns = Math.max(3, Math.floor(inner / TARGET_TILE_WIDTH));
  const tileSize = (inner - Spacing.two * (columns - 1)) / columns;

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
      <View style={styles.flex} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
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
              {items.length === 0 ? 'No items yet. Click Add (or press ' + MOD + 'N) to add a photo of one.' : 'No items match these filters.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/closet/[id]', params: { id: item.id } }, { withAnchor: true })}
            {...contextMenu(() => itemMenu(item))}
            accessibilityLabel={item.name ?? item.tagIds.map((id) => byId.get(id)?.name).join(', ')}
            style={({ hovered }: { hovered?: boolean }) => [
              styles.tile,
              {
                width: tileSize,
                height: tileSize,
                backgroundColor: hovered ? theme.backgroundSelected : theme.backgroundElement,
                opacity: item.wear_status === 'ready' ? 1 : 0.55,
              },
            ]}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl, cacheKey: item.image_path }}
                style={styles.image}
                contentFit="contain"
                accessibilityLabel={item.name ?? item.tagIds.map((id) => byId.get(id)?.name).join(', ')}
              />
            ) : null}
            {item.wear_status !== 'ready' ? (
              <Text style={[styles.status, { backgroundColor: theme.background, color: theme.textSecondary }]}>
                {label(item.wear_status)}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
      ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  status: { position: 'absolute', left: 6, bottom: 6, fontSize: 11, fontWeight: '600', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  column: { gap: Spacing.two },
  filters: { gap: Spacing.two, marginBottom: Spacing.two },
  tile: { borderRadius: 12, padding: Spacing.two },
  image: { flex: 1 },
  empty: { marginTop: Spacing.five, textAlign: 'center', fontSize: 16 },
  addButton: { fontSize: 17, fontWeight: '600' },
});
