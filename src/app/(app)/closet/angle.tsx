import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CutoutStep } from '@/components/cutout-step';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/lib/dialogs';
import { addItemAngle } from '@/lib/items';
import { goBack } from '@/lib/navigation';

/** "Add angle": cut out a photo of the item from another side, then add it to the item. */
export default function AddAngleScreen() {
  const theme = useTheme();
  const { id, photoUri } = useLocalSearchParams<{ id: string; photoUri: string }>();
  const [saving, setSaving] = useState(false);

  const onDone = useCallback(
    async (png: string) => {
      setSaving(true);
      try {
        await addItemAngle(id, png);
        goBack('/closet');
      } catch (e) {
        showMessage('Could not add the angle', (e as Error).message);
        setSaving(false);
      }
    },
    [id],
  );

  if (saving || !photoUri) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Add angle' }} />
        {saving ? <ActivityIndicator /> : null}
        <Text style={{ color: theme.textSecondary }}>{saving ? 'Saving…' : 'No photo selected.'}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CutoutStep photoUri={photoUri} onDone={onDone} onCancel={() => goBack('/closet')} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
