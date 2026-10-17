import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/chips';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ItemWithUrl } from '@/lib/items';
import { useTags } from '@/lib/tag-store';
import type { TagKind } from '@/lib/tags';

export const FILTER_KINDS: TagKind[] = ['type', 'color', 'pattern', 'style', 'season'];

/**
 * Search + tag filters for a list of items (Closet screen and "Add from closet").
 * Within a group an item matches ANY selected tag; across groups it must match ALL groups.
 * Search matches the item's name or any of its tag names.
 */
export function useClosetFilter(items: ItemWithUrl[], initialTags: string[] = []) {
  const { byId } = useTags();
  const [filter, setFilter] = useState<string[]>(initialTags);
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const selectedByKind = FILTER_KINDS.map((kind) => filter.filter((id) => byId.get(id)?.kind === kind)).filter(
      (ids) => ids.length > 0,
    );
    const q = search.trim().toLowerCase();
    const matchesSearch = (item: ItemWithUrl) =>
      !q ||
      (item.name ?? '').toLowerCase().includes(q) ||
      item.tagIds.some((id) => byId.get(id)?.name.toLowerCase().includes(q));
    return items.filter(
      (item) => matchesSearch(item) && selectedByKind.every((ids) => ids.some((id) => item.tagIds.includes(id))),
    );
  }, [items, filter, search, byId]);

  return { visible, filter, setFilter, search, setSearch };
}

/** The search box and filter chips. `collapsible` hides the chips behind a "Filters" button. */
export function ClosetFilterBar({
  filter,
  setFilter,
  search,
  setSearch,
  collapsible = false,
}: {
  filter: string[];
  setFilter: (ids: string[]) => void;
  search: string;
  setSearch: (s: string) => void;
  collapsible?: boolean;
}) {
  const theme = useTheme();
  const { ofKind, byId } = useTags();
  const [open, setOpen] = useState(!collapsible);

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          placeholder="🔍 Search by name or tag"
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel="Search your closet"
        />
        {collapsible ? (
          <Pressable
            onPress={() => setOpen((o) => !o)}
            accessibilityRole="button"
            style={[styles.filterButton, { backgroundColor: filter.length ? theme.tint : theme.backgroundSelected }]}>
            <Text style={{ color: filter.length ? '#fff' : theme.text, fontWeight: '600' }}>
              Filters{filter.length ? ` (${filter.length})` : ''} {open ? '▴' : '▾'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {open
        ? FILTER_KINDS.map((kind) => (
            <ChipGroup
              key={kind}
              scroll
              options={ofKind(kind).map((t) => t.id)}
              labelOf={(id) => byId.get(id)?.name ?? ''}
              value={filter.filter((id) => byId.get(id)?.kind === kind)}
              onChange={(ids) => setFilter([...filter.filter((id) => byId.get(id)?.kind !== kind), ...ids])}
            />
          ))
        : null}
      {open && filter.length > 0 ? (
        <Pressable onPress={() => setFilter([])} hitSlop={8}>
          <Text style={{ color: theme.tint, fontWeight: '600' }}>Clear filters</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  searchRow: { flexDirection: 'row', gap: Spacing.two },
  search: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  filterButton: { borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' },
});
