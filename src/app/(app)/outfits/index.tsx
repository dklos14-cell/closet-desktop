import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/chips';
import { OutfitCard } from '@/components/outfit-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { peek } from '@/lib/cache';
import { addEntry, toDateString } from '@/lib/calendar';
import { desktop, type MenuEntry } from '@/lib/desktop';
import { confirmAction, showMessage } from '@/lib/dialogs';
import {
  addFolder,
  deleteFolder,
  deleteOutfit,
  fetchFolders,
  fetchOutfits,
  fetchOutfitWearStats,
  moveToFolder,
  renameFolder,
  setFavorite,
  type Folder,
  type OutfitWithItems,
} from '@/lib/outfits';
import { OUTFIT_TAG_KINDS } from '@/lib/tags';
import { useTags } from '@/lib/tag-store';

const TARGET_CARD_WIDTH = 190;
const MAX_WIDTH = 1400;

/** Which outfits are shown: all, those in no folder, or one folder. */
type FolderView = 'all' | 'none' | string;
type Sort = 'newest' | 'worn' | 'rating' | 'name';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'worn', label: 'Most worn' },
  { key: 'rating', label: 'Top rated' },
  { key: 'name', label: 'A–Z' },
];

/**
 * All outfits as a grid of "whole look" cards, with folders, search, tag filters and sorting.
 * ♡ saves one to Favorites; right-click a card for more (move to a folder, wear today, delete).
 */
export default function OutfitsScreen() {
  const theme = useTheme();
  const { byId, ofKind } = useTags();
  const [outfits, setOutfits] = useState<OutfitWithItems[]>(() => peek<OutfitWithItems[]>('outfits') ?? []);
  const [worn, setWorn] = useState<Map<string, { wear_count: number }>>(() => peek('outfit-wear') ?? new Map());
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(() => !peek('outfits'));
  const [width, setWidth] = useState(0);

  const [folder, setFolder] = useState<FolderView>('all');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyPhotos, setOnlyPhotos] = useState(false);
  const [sort, setSort] = useState<Sort>('newest');
  const [naming, setNaming] = useState<{ id: string | null; name: string } | null>(null); // new / renamed folder

  const load = useCallback(() => {
    Promise.all([fetchOutfits(), fetchOutfitWearStats(), fetchFolders()])
      .then(([all, wear, allFolders]) => {
        setOutfits(all);
        setWorn(wear);
        setFolders(allFolders);
      })
      .catch((e) => showMessage('Could not load outfits', e.message))
      .finally(() => setLoading(false));
  }, []);
  useFocusEffect(load);

  function toggleFavorite(outfit: OutfitWithItems) {
    const next = !outfit.is_favorite;
    setOutfits((all) => all.map((o) => (o.id === outfit.id ? { ...o, is_favorite: next } : o)));
    setFavorite(outfit.id, next).catch((e) => showMessage('Could not save', e.message));
  }

  async function move(outfit: OutfitWithItems, folderId: string | null) {
    setOutfits((all) => all.map((o) => (o.id === outfit.id ? { ...o, folder_id: folderId } : o)));
    await moveToFolder(outfit.id, folderId).catch((e) => showMessage('Could not move', e.message));
  }

  /** Right-click on a card. */
  async function cardMenu(outfit: OutfitWithItems) {
    const entries: MenuEntry[] = [
      { id: 'open', label: 'Open' },
      { id: 'fav', label: outfit.is_favorite ? 'Remove from Favorites' : 'Add to Favorites' },
      { id: 'wear', label: 'Wear it today' },
      {
        label: 'Move to folder',
        submenu: [
          { id: 'folder:', label: 'No folder', checked: !outfit.folder_id },
          ...(folders.length ? [{ separator: true } as const] : []),
          ...folders.map((f) => ({ id: `folder:${f.id}`, label: f.name, checked: outfit.folder_id === f.id })),
        ],
      },
      { separator: true },
      { id: 'delete', label: 'Delete outfit…' },
    ];
    const choice = await desktop().popupMenu(entries);
    if (choice === 'open') router.push({ pathname: '/outfits/edit', params: { id: outfit.id } }, { withAnchor: true });
    else if (choice === 'fav') toggleFavorite(outfit);
    else if (choice?.startsWith('folder:')) move(outfit, choice.slice(7) || null);
    else if (choice === 'wear') {
      addEntry(toDateString(new Date()), outfit.id, null)
        .then(() => showMessage('On today', `${outfit.name || 'This outfit'} is now today's outfit.`))
        .catch((e) => showMessage('Could not save', e.message));
    } else if (choice === 'delete') {
      if (!(await confirmAction('Delete this outfit?', 'Your items stay in your closet.', 'Delete'))) return;
      deleteOutfit(outfit.id)
        .then(load)
        .catch((e) => showMessage('Could not delete', e.message));
    }
  }

  async function saveFolderName() {
    if (!naming) return;
    const name = naming.name.trim();
    if (!name) return setNaming(null);
    try {
      if (naming.id) await renameFolder(naming.id, name);
      else setFolder((await addFolder(name)).id);
      setNaming(null);
      setFolders(await fetchFolders());
    } catch (e) {
      showMessage('Could not save the folder', (e as Error).message);
    }
  }

  async function removeFolder(f: Folder) {
    const ok = await confirmAction(`Delete the folder "${f.name}"?`, 'The outfits in it are kept; they just leave the folder.', 'Delete folder');
    if (!ok) return;
    await deleteFolder(f.id).catch((e) => showMessage('Could not delete', e.message));
    setFolder('all');
    load();
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kinds = OUTFIT_TAG_KINDS.map((kind) => tagFilter.filter((id) => byId.get(id)?.kind === kind)).filter((ids) => ids.length);
    const list = outfits.filter(
      (o) =>
        (folder === 'all' || (folder === 'none' ? !o.folder_id : o.folder_id === folder)) &&
        (!onlyFavorites || o.is_favorite) &&
        (!onlyPhotos || !!o.photo_path) &&
        kinds.every((ids) => ids.some((id) => o.tagIds.includes(id))) &&
        (!q ||
          (o.name ?? '').toLowerCase().includes(q) ||
          o.tagIds.some((id) => byId.get(id)?.name.toLowerCase().includes(q)) ||
          o.items.some((it) => it.tagIds.some((id) => byId.get(id)?.name.toLowerCase().includes(q)))),
    );
    const count = (o: OutfitWithItems) => worn.get(o.id)?.wear_count ?? 0;
    if (sort === 'worn') list.sort((a, b) => count(b) - count(a));
    else if (sort === 'rating') list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else if (sort === 'name') list.sort((a, b) => (a.name || '~').localeCompare(b.name || '~'));
    return list;
  }, [outfits, folder, search, tagFilter, onlyFavorites, onlyPhotos, sort, byId, worn]);

  const inner = Math.min(width, MAX_WIDTH) - Spacing.three * 2;
  const columns = Math.max(2, Math.floor(inner / TARGET_CARD_WIDTH));
  const cardWidth = (inner - Spacing.three * (columns - 1)) / columns;
  const filtering = search || tagFilter.length || onlyFavorites || onlyPhotos;
  const current = folders.find((f) => f.id === folder);
  const countIn = (view: FolderView) =>
    outfits.filter((o) => (view === 'all' ? true : view === 'none' ? !o.folder_id : o.folder_id === view)).length;

  const header = (
    <View style={styles.header}>
      <TextInput
        style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="🔍 Search outfits by name, tag or piece"
        placeholderTextColor={theme.textSecondary}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        accessibilityLabel="Search outfits"
      />

      {/* Folders */}
      <View style={styles.row}>
        <Chip text={`All (${countIn('all')})`} selected={folder === 'all'} onPress={() => setFolder('all')} />
        <Chip text={`Not in a folder (${countIn('none')})`} selected={folder === 'none'} onPress={() => setFolder('none')} />
        {folders.map((f) => (
          <Chip key={f.id} text={`📁 ${f.name} (${countIn(f.id)})`} selected={folder === f.id} onPress={() => setFolder(f.id)} />
        ))}
        {naming ? (
          <View style={styles.row}>
            <TextInput
              autoFocus
              style={[styles.folderInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              placeholder="Folder name"
              placeholderTextColor={theme.textSecondary}
              value={naming.name}
              onChangeText={(name) => setNaming({ ...naming, name })}
              onSubmitEditing={saveFolderName}
              onKeyPress={(e) => e.nativeEvent.key === 'Escape' && setNaming(null)}
              maxLength={40}
            />
            <Chip text={naming.id ? 'Rename' : 'Add'} selected onPress={saveFolderName} />
            <Chip text="Cancel" selected={false} onPress={() => setNaming(null)} />
          </View>
        ) : (
          <Chip text="+ New folder" selected={false} onPress={() => setNaming({ id: null, name: '' })} />
        )}
      </View>
      {current && !naming ? (
        <View style={styles.row}>
          <Pressable onPress={() => setNaming({ id: current.id, name: current.name })} hitSlop={6}>
            <Text style={[styles.link, { color: theme.tint }]}>Rename folder</Text>
          </Pressable>
          <Pressable onPress={() => removeFolder(current)} hitSlop={6}>
            <Text style={[styles.link, { color: theme.danger }]}>Delete folder</Text>
          </Pressable>
          <Text style={{ color: theme.textSecondary }}>Add outfits: right-click a card → Move to folder, or choose a folder in the outfit.</Text>
        </View>
      ) : null}

      {/* Filters and sorting */}
      <View style={styles.row}>
        <Chip text="♥ Favorites" selected={onlyFavorites} onPress={() => setOnlyFavorites((v) => !v)} />
        <Chip text="📷 With my photo" selected={onlyPhotos} onPress={() => setOnlyPhotos((v) => !v)} />
        {OUTFIT_TAG_KINDS.flatMap((kind) => ofKind(kind)).map((t) => (
          <Chip
            key={t.id}
            text={t.name}
            selected={tagFilter.includes(t.id)}
            onPress={() => setTagFilter((f) => (f.includes(t.id) ? f.filter((x) => x !== t.id) : [...f, t.id]))}
          />
        ))}
      </View>
      <View style={[styles.row, styles.sortRow]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Sort</Text>
        {SORTS.map((s) => (
          <Chip key={s.key} text={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
        ))}
        {filtering ? (
          <Pressable
            onPress={() => {
              setSearch('');
              setTagFilter([]);
              setOnlyFavorites(false);
              setOnlyPhotos(false);
            }}
            hitSlop={6}>
            <Text style={[styles.link, { color: theme.tint }]}>Clear filters</Text>
          </Pressable>
        ) : null}
        <Text style={{ color: theme.textSecondary, marginLeft: 'auto' }}>
          {visible.length} outfit{visible.length === 1 ? '' : 's'}
        </Text>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable onPress={() => router.push('/outfits/pick', { withAnchor: true })} hitSlop={10} accessibilityLabel="Pick an outfit for me">
                <Text style={[styles.headerButton, { color: theme.tint }]}>✨ Pick for me</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/outfits/edit', { withAnchor: true })} hitSlop={10} accessibilityLabel="New outfit">
                <Text style={[styles.headerButton, { color: theme.tint }]}>+ New</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <FlatList
            style={{ backgroundColor: theme.background }}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.list}
            data={visible}
            keyExtractor={(o) => o.id}
            // FlatList can't change numColumns in place, so the key forces a fresh list on resize.
            key={columns}
            numColumns={columns}
            columnWrapperStyle={styles.column}
            ListHeaderComponent={header}
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator style={styles.empty} />
              ) : (
                <Text style={[styles.empty, { color: theme.textSecondary }]}>
                  {outfits.length === 0
                    ? 'No outfits yet. Click + New to put one together, or ✨ Pick for me to have one made.'
                    : 'No outfits match. Try another folder or clear the filters.'}
                </Text>
              )
            }
            renderItem={({ item: outfit }) => (
              <OutfitCard
                outfit={outfit}
                width={cardWidth}
                timesWorn={worn.get(outfit.id)?.wear_count ?? 0}
                onToggleFavorite={toggleFavorite}
                onMenu={cardMenu}
              />
            )}
          />
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  column: { gap: Spacing.three },
  header: { gap: Spacing.two, marginBottom: Spacing.two },
  search: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  sortRow: { marginTop: Spacing.one },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  link: { fontWeight: '600' },
  folderInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, fontSize: 15, minWidth: 160 },
  empty: { marginTop: Spacing.five, textAlign: 'center', fontSize: 16 },
  headerButtons: { flexDirection: 'row', gap: Spacing.four, paddingRight: Spacing.three },
  headerButton: { fontSize: 16, fontWeight: '600' },
});
