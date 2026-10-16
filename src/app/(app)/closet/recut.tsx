import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CutoutStep } from '@/components/cutout-step';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/lib/dialogs';
import { fetchItem, replaceItemPicture, type ItemDetail } from '@/lib/items';
import { goBack } from '@/lib/navigation';

/** "Edit cut-out" for a saved item: fix a blemish with the editor, then save the new picture. */
export default function RecutScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    fetchItem(id)
      .then(async (loaded) => {
        if (!loaded.imageUrl) throw new Error('This item has no picture.');
        // Download first: the editor must read the pixels, which a picture from another site can't allow.
        made = URL.createObjectURL(await (await fetch(loaded.imageUrl)).blob());
        if (cancelled) return;
        setItem(loaded);
        setLocalUri(made);
      })
      .catch((e) => {
        if (cancelled) return;
        showMessage('Could not open the picture', e.message);
        goBack('/closet');
      });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);

  const onDone = useCallback(
    async (png: string) => {
      if (!item) return;
      setSaving(true);
      try {
        await replaceItemPicture(item, png);
        goBack('/closet');
      } catch (e) {
        showMessage('Could not save the picture', (e as Error).message);
        setSaving(false);
      }
    },
    [item],
  );

  if (saving || !localUri) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Edit cut-out' }} />
        <ActivityIndicator />
        <Text style={{ color: theme.textSecondary }}>{saving ? 'Saving…' : 'Opening…'}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CutoutStep photoUri={localUri} onDone={onDone} onCancel={() => goBack('/closet')} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
