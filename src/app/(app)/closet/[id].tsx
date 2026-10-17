import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { HeaderCancel } from '@/components/header-cancel';
import { ItemTagForm } from '@/components/item-tag-form';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteItem, fetchItem, removeItemAngle, updateItem, type ItemDetail } from '@/lib/items';
import { pickImage } from '@/lib/pick-image';
import { pickFields, type ItemFields } from '@/lib/tags';
import { showMessage, confirmAction } from '@/lib/dialogs';
import { cancelEditing, goBack } from '@/lib/navigation';
import { useEditorShortcuts } from '@/lib/commands';

export default function ItemDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [fields, setFields] = useState<ItemFields | null>(null);
  const [busy, setBusy] = useState<'saving' | 'deleting' | null>(null);

  // Reload when the screen comes back into view (e.g. after "Edit cut-out"), keeping any tag
  // changes that haven't been saved yet.
  useFocusEffect(
    useCallback(() => {
      fetchItem(id)
        .then((loaded) => {
          setItem(loaded);
          setFields((current) => current ?? pickFields(loaded));
        })
        .catch((e) => {
          showMessage('Could not load item', e.message);
          goBack('/closet');
        });
    }, [id]),
  );

  const changed = !!item && !!fields && JSON.stringify(fields) !== JSON.stringify(pickFields(item));
  function cancel() {
    cancelEditing(changed, '/closet');
  }

  async function save() {
    if (!fields) return;
    setBusy('saving');
    try {
      await updateItem(id, { ...fields, name: fields.name?.trim() || null });
      goBack('/closet');
    } catch (e) {
      showMessage('Could not save', (e as Error).message);
      setBusy(null);
    }
  }

  useEditorShortcuts({ save, cancel, enabled: busy === null });

  /** Another side of the item (e.g. a shoe's side view): pick a photo, then cut it out. */
  async function addAngle() {
    try {
      const photoUri = await pickImage();
      if (photoUri) router.push({ pathname: '/closet/angle', params: { id, photoUri } }, { withAnchor: true });
    } catch (e) {
      showMessage('Could not open photo', (e as Error).message);
    }
  }

  async function removeAngle(n: number) {
    if (!(await confirmAction('Remove this angle?', 'Outfits that show it go back to the main photo.', 'Remove'))) return;
    try {
      await removeItemAngle(id, n);
      setItem(await fetchItem(id));
    } catch (e) {
      showMessage('Could not remove', (e as Error).message);
    }
  }

  async function confirmDelete() {
    if (!item) return;
    if (!(await confirmAction('Delete this item?', 'It will also be removed from any outfits.', 'Delete'))) return;
    setBusy('deleting');
    try {
      await deleteItem(item);
      goBack('/closet');
    } catch (e) {
      showMessage('Could not delete', (e as Error).message);
      setBusy(null);
    }
  }

  if (!item || !fields) {
    return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.background }} />;
  }

  const worn =
    item.wear_count === 0
      ? 'Not worn yet'
      : `Worn ${item.wear_count} time${item.wear_count === 1 ? '' : 's'} · last on ${item.last_worn}`;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: item.name ?? 'Item',
          headerLeft: () => <HeaderCancel onPress={cancel} />,
        }}
      />
      <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl, cacheKey: `${item.image_path}#full` }}
            style={styles.image}
            contentFit="contain"
          />
        ) : null}
      </View>
      <Text style={[styles.worn, { color: theme.textSecondary }]}>{worn}</Text>
      {Platform.OS === 'web' ? (
        <Button
          title="✂️ Edit cut-out"
          variant="secondary"
          onPress={() => router.push({ pathname: '/closet/recut', params: { id: item.id } }, { withAnchor: true })}
        />
      ) : null}

      <View style={styles.angles}>
        <Text style={[styles.anglesTitle, { color: theme.textSecondary }]}>Angles</Text>
        <View style={styles.angleRow}>
          {item.angleUrls.map((url, n) => (
            <View key={url} style={[styles.angle, { backgroundColor: theme.backgroundElement }]}>
              <Image source={{ uri: url }} style={styles.image} contentFit="contain" />
              {n === 0 ? (
                <Text style={[styles.angleLabel, { color: theme.textSecondary }]}>Main</Text>
              ) : (
                <Pressable onPress={() => removeAngle(n)} hitSlop={6} accessibilityLabel={`Remove angle ${n}`} style={styles.angleRemove}>
                  <Text style={{ color: theme.danger, fontWeight: '700' }}>✕</Text>
                </Pressable>
              )}
            </View>
          ))}
          <Pressable
            onPress={addAngle}
            accessibilityRole="button"
            style={[styles.angle, styles.angleAdd, { borderColor: theme.backgroundSelected }]}>
            <Text style={{ color: theme.tint, fontWeight: '600', textAlign: 'center' }}>+ Add angle</Text>
          </Pressable>
        </View>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          Add the item from another side, like a shoe from the side and the front. In an outfit, click the piece and press
          Angle (V) to switch, or Flip (H) to mirror it.
        </Text>
      </View>

      <ItemTagForm fields={fields} onChange={setFields} />
      <Button title="Save changes" onPress={save} busy={busy === 'saving'} disabled={busy !== null} />
      <Button title="Cancel" variant="secondary" onPress={cancel} disabled={busy !== null} />
      <Button
        title="Delete item"
        variant="danger"
        onPress={confirmDelete}
        busy={busy === 'deleting'}
        disabled={busy !== null}
      />
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
  preview: { height: 280, borderRadius: 16, padding: Spacing.three },
  image: { flex: 1 },
  worn: { textAlign: 'center', fontSize: 15 },
  angles: { gap: Spacing.two },
  anglesTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  angleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  angle: { width: 84, height: 84, borderRadius: 12, padding: 6 },
  angleAdd: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  angleLabel: { position: 'absolute', bottom: 2, alignSelf: 'center', fontSize: 11, fontWeight: '600' },
  angleRemove: { position: 'absolute', top: 2, right: 6 },
});
