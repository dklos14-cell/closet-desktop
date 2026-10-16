import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chips';
import { HeaderCancel } from '@/components/header-cancel';
import { ClosetPicker } from '@/components/closet-picker';
import { resolveLayouts } from '@/components/outfit-board';
import { OutfitBoardEditor } from '@/components/outfit-board-editor';
import { StarRating } from '@/components/star-rating';
import { TagPicker } from '@/components/tag-picker';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchItems, type ItemWithUrl } from '@/lib/items';
import { addEntry } from '@/lib/calendar';
import type { Layout } from '@/lib/outfit-board';
import { deleteOutfit, fetchOutfit, fetchOutfitWearStats, saveOutfit, type OutfitFields } from '@/lib/outfits';
import { OUTFIT_TAG_KINDS } from '@/lib/tags';
import { useTags } from '@/lib/tag-store';
import { showMessage, confirmAction } from '@/lib/dialogs';
import { cancelEditing, goBack } from '@/lib/navigation';

const EMPTY_OUTFIT: OutfitFields = { name: '', rating: null, is_favorite: false, tagIds: [] };

/** A comparable text version of everything the editor can change. */
function snapshot(fields: OutfitFields, itemIds: string[], placed: Map<string, Layout>) {
  return JSON.stringify([fields, [...itemIds].sort(), [...placed.entries()].sort()]);
}

/** Create a new outfit (no id) or edit an existing one (id param). */
export default function OutfitEditScreen() {
  const theme = useTheme();
  // logDate: opened from Today's "Create a new outfit" → also put the new outfit on that day.
  const { id, logDate } = useLocalSearchParams<{ id?: string; logDate?: string }>();
  const [items, setItems] = useState<ItemWithUrl[] | null>(null);
  const { byId } = useTags();
  const [fields, setFields] = useState<OutfitFields>(EMPTY_OUTFIT);
  const [selected, setSelected] = useState<string[]>([]);
  // Board positions placed by hand (or saved before); everything else is auto-arranged.
  const [placed, setPlaced] = useState<Map<string, Layout>>(new Map());
  const [timesWorn, setTimesWorn] = useState(0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<'saving' | 'deleting' | null>(null);
  // What the outfit looked like when opened, to know whether Cancel would lose anything.
  const [original, setOriginal] = useState<string>(() => snapshot(EMPTY_OUTFIT, [], new Map()));
  // The pieces chosen before opening "Add from closet", so its Cancel can put them back.
  const [beforePicking, setBeforePicking] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([fetchItems(), id ? fetchOutfit(id) : null, id ? fetchOutfitWearStats() : null])
      .then(([allItems, outfit, wear]) => {
        setItems(allItems);
        if (outfit) {
          const { name, rating, is_favorite, tagIds } = outfit;
          setFields({ name, rating, is_favorite, tagIds });
          setSelected(outfit.itemIds);
          setPlaced(outfit.layouts);
          setTimesWorn(wear?.get(outfit.id)?.wear_count ?? 0);
          setOriginal(snapshot({ name, rating, is_favorite, tagIds }, outfit.itemIds, outfit.layouts));
        }
      })
      .catch((e) => {
        showMessage('Could not load', e.message);
        goBack('/outfits');
      });
  }, [id]);

  // Sort by type tag so shirts, pants, shoes... sit together while picking.
  const sortedItems = useMemo(() => {
    const typeOrder = (item: ItemWithUrl) =>
      Math.min(
        Infinity,
        ...item.tagIds.flatMap((id) => {
          const tag = byId.get(id);
          return tag?.kind === 'type' ? [tag.position] : [];
        }),
      );
    return items ? [...items].sort((a, b) => typeOrder(a) - typeOrder(b)) : null;
  }, [items, byId]);

  // The pieces on the board, in the order they were picked.
  const boardItems = useMemo(
    () => selected.flatMap((sid) => items?.find((it) => it.id === sid) ?? []),
    [selected, items],
  );
  const layouts = useMemo(() => resolveLayouts(boardItems, byId, placed), [boardItems, byId, placed]);

  const toggle = (itemId: string) =>
    setSelected((s) => (s.includes(itemId) ? s.filter((x) => x !== itemId) : [...s, itemId]));

  const changed = snapshot(fields, selected, placed) !== original;
  function cancel() {
    cancelEditing(changed, '/outfits');
  }

  async function save() {
    if (selected.length === 0) {
      showMessage('Add some pieces', 'Tap "+ Add from closet" to put items in this outfit.');
      return;
    }
    setBusy('saving');
    try {
      const savedId = await saveOutfit(
        id ?? null,
        { ...fields, name: fields.name?.trim() || null },
        selected,
        layouts,
      );
      if (logDate) await addEntry(logDate, savedId, null);
      goBack('/outfits');
    } catch (e) {
      showMessage('Could not save', (e as Error).message);
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!id) return;
    if (!(await confirmAction('Delete this outfit?', 'Your items stay in your closet.', 'Delete'))) return;
    setBusy('deleting');
    try {
      await deleteOutfit(id);
      goBack('/outfits');
    } catch (e) {
      showMessage('Could not delete', (e as Error).message);
      setBusy(null);
    }
  }

  if (!sortedItems) return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.background }} />;


  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{ title: id ? 'Edit outfit' : 'New outfit', headerLeft: () => <HeaderCancel onPress={cancel} /> }}
      />
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="Name (optional)"
        placeholderTextColor={theme.textSecondary}
        value={fields.name ?? ''}
        onChangeText={(name) => setFields((f) => ({ ...f, name }))}
      />

      <Text style={[styles.title, { color: theme.textSecondary }]}>The look</Text>
      <OutfitBoardEditor
        items={boardItems}
        layouts={layouts}
        onChange={setPlaced}
        onAutoArrange={() => setPlaced(new Map())}
        onRemove={toggle}
      />
      <Button
        title={`+ Add from closet${selected.length ? ` (${selected.length} in outfit)` : ''}`}
        variant="secondary"
        onPress={() => {
          setBeforePicking(selected);
          setPicking(true);
        }}
      />
      <ClosetPicker
        visible={picking}
        items={sortedItems}
        inOutfit={selected}
        onToggle={toggle}
        onClose={() => setPicking(false)}
        onCancel={() => {
          setSelected(beforePicking); // undo whatever was tapped in the picker
          setPicking(false);
        }}
      />

      <TagPicker
        kinds={OUTFIT_TAG_KINDS}
        value={fields.tagIds}
        onChange={(tagIds) => setFields((f) => ({ ...f, tagIds }))}
      />

      <View style={styles.section}>
        <Text style={[styles.title, { color: theme.textSecondary }]}>Favorites</Text>
        <View style={styles.row}>
          <Chip
            text={fields.is_favorite ? '♥ In favorites' : '♡ Add to favorites'}
            selected={fields.is_favorite}
            onPress={() => setFields((f) => ({ ...f, is_favorite: !f.is_favorite }))}
          />
        </View>
        {fields.is_favorite ? (
          <TagPicker
            kinds={['favorite']}
            value={fields.tagIds}
            onChange={(tagIds) => setFields((f) => ({ ...f, tagIds }))}
          />
        ) : null}
      </View>

      {timesWorn > 0 ? (
        <StarRating value={fields.rating} onChange={(rating) => setFields((f) => ({ ...f, rating }))} />
      ) : (
        <View style={styles.section}>
          <Text style={[styles.title, { color: theme.textSecondary }]}>Rating</Text>
          <Text style={{ color: theme.textSecondary }}>
            ☆ You can rate this outfit once you&apos;ve worn it. Put it on a day (Today or Calendar) and
            rate it from that day on.
          </Text>
        </View>
      )}

      <Button title="Save outfit" onPress={save} busy={busy === 'saving'} disabled={busy !== null} />
      <Button title="Cancel" variant="secondary" onPress={cancel} disabled={busy !== null} />
      {id ? (
        <Button
          title="Delete outfit"
          variant="danger"
          onPress={confirmDelete}
          busy={busy === 'deleting'}
          disabled={busy !== null}
        />
      ) : null}
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
  input: { borderRadius: 10, padding: 14, fontSize: 16 },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { borderRadius: 10, padding: 4, borderWidth: 3 },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  image: { flex: 1 },
});
