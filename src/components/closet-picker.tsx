import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ClosetFilterBar, useClosetFilter } from '@/components/closet-filters';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ItemWithUrl } from '@/lib/items';
import { useTags } from '@/lib/tag-store';

const TARGET_TILE_WIDTH = 110;

/**
 * "Add from closet": your whole closet, full screen, grouped by type (Shirts, Pants, Socks…),
 * with search and filters. Tap an item to put it in the outfit; tap again to take it out.
 */
export function ClosetPicker({
  visible,
  items,
  inOutfit,
  onToggle,
  onClose,
  onCancel,
}: {
  visible: boolean;
  items: ItemWithUrl[];
  inOutfit: string[];
  onToggle: (itemId: string) => void;
  /** Done: keep the changes. */
  onClose: () => void;
  /** Cancel: undo everything tapped since the picker opened. */
  onCancel: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { ofKind, byId } = useTags();
  const { visible: shown, filter, setFilter, search, setSearch } = useClosetFilter(items);

  // Group by the item's first Type tag, in the order of the Type list; untyped items last.
  const types = ofKind('type');
  const sections = [
    ...types.map((t) => ({ key: t.id, title: t.name, items: shown.filter((it) => firstType(it) === t.id) })),
    { key: 'none', title: 'No type yet', items: shown.filter((it) => firstType(it) === null) },
  ].filter((s) => s.items.length > 0);
  function firstType(item: ItemWithUrl) {
    return item.tagIds.find((id) => byId.get(id)?.kind === 'type') ?? null;
  }

  const contentWidth = Math.min(width, MaxContentWidth) - Spacing.three * 2;
  const columns = Math.max(3, Math.floor(contentWidth / TARGET_TILE_WIDTH));
  const tile = (contentWidth - Spacing.two * (columns - 1)) / columns;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={[styles.bar, { borderColor: theme.backgroundElement }]}>
          <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.cancel, { color: theme.tint }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Add from closet</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.done, { color: theme.tint }]}>Done ({inOutfit.length})</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <ClosetFilterBar filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} collapsible />
          {sections.length === 0 ? (
            <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: Spacing.five }}>
              {items.length === 0 ? 'Your closet is empty: add clothes first.' : 'Nothing matches these filters.'}
            </Text>
          ) : null}
          {sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {section.title} <Text style={{ color: theme.textSecondary }}>({section.items.length})</Text>
              </Text>
              <View style={styles.grid}>
                {section.items.map((item) => {
                  const added = inOutfit.includes(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => onToggle(item.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: added }}
                      accessibilityLabel={item.name ?? section.title}
                      style={[
                        styles.tile,
                        {
                          width: tile,
                          height: tile,
                          backgroundColor: theme.backgroundElement,
                          borderColor: added ? theme.tint : 'transparent',
                        },
                      ]}>
                      {item.imageUrl ? (
                        <Image
                          source={{ uri: item.imageUrl, cacheKey: item.image_path }}
                          style={styles.image}
                          contentFit="contain"
                        />
                      ) : null}
                      {added ? (
                        <View style={[styles.badge, { backgroundColor: theme.tint }]}>
                          <Text style={styles.badgeText}>In outfit ✓</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontWeight: '700' },
  done: { fontSize: 17, fontWeight: '700' },
  cancel: { fontSize: 17 },
  container: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: { gap: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { borderRadius: 10, padding: 4, borderWidth: 3 },
  image: { flex: 1 },
  badge: { position: 'absolute', left: 4, right: 4, bottom: 4, borderRadius: 6, paddingVertical: 2, alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
