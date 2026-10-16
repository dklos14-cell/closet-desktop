import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { HeaderCancel } from '@/components/header-cancel';
import { ItemTagForm } from '@/components/item-tag-form';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteItem, fetchItem, updateItem, type ItemDetail } from '@/lib/items';
import { pickFields, type ItemFields } from '@/lib/tags';
import { showMessage, confirmAction } from '@/lib/dialogs';
import { cancelEditing, goBack } from '@/lib/navigation';

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
});
