import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { CutoutStep } from '@/components/cutout-step';
import { HeaderCancel } from '@/components/header-cancel';
import { ItemTagForm } from '@/components/item-tag-form';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/lib/dialogs';
import { saveItem } from '@/lib/items';
import type { ItemFields } from '@/lib/tags';
import { cancelEditing, goBack } from '@/lib/navigation';

const EMPTY_FIELDS: ItemFields = {
  name: '',
  warmth: null,
  wear_status: 'ready',
  rating: null,
  tagIds: [],
};

type Step = 'cutout' | 'editing' | 'saving';

/** 1. cut out the background  2. the user names and tags the item, then saves. */
export default function NewItemScreen() {
  const theme = useTheme();
  const { photoUri } = useLocalSearchParams<{ photoUri: string }>();
  const [step, setStep] = useState<Step>('cutout');
  const [pngUri, setPngUri] = useState<string | null>(null);
  const [maskUri, setMaskUri] = useState<string | undefined>(undefined);
  const [fields, setFields] = useState<ItemFields>(EMPTY_FIELDS);

  const onCutoutDone = useCallback((png: string, mask?: string) => {
    setPngUri(png);
    setMaskUri(mask);
    setStep('editing');
  }, []);

  const onCancel = useCallback(() => goBack('/closet'), []);

  /** Cancel on the form: throw this new item away (after asking). */
  function discard() {
    cancelEditing(true, '/closet', 'Discard this new item?');
  }

  async function save() {
    if (!pngUri) return;
    setStep('saving');
    try {
      await saveItem(pngUri, { ...fields, name: fields.name?.trim() || null });
      goBack('/closet');
    } catch (e) {
      showMessage('Could not save', (e as Error).message);
      setStep('editing');
    }
  }

  if (!photoUri) {
    // e.g. the page was reloaded in a browser, which forgets the picked photo.
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>No photo selected.</Text>
        <Button title="Back to closet" onPress={onCancel} />
      </View>
    );
  }

  // The cut-out editor takes the whole screen (it has its own Cancel / Done bar).
  if (step === 'cutout') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CutoutStep
          photoUri={photoUri}
          initialMaskUri={maskUri}
          onDone={onCutoutDone}
          // Cancelling a re-edit goes back to the form; cancelling the first cut leaves.
          onCancel={pngUri ? () => setStep('editing') : onCancel}
        />
      </>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          headerShown: true,
          headerLeft: () => <HeaderCancel onPress={discard} />,
        }}
      />
      <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
        {pngUri ? <Image source={{ uri: pngUri }} style={styles.image} contentFit="contain" /> : null}
      </View>
      {/* Right under the picture, so they're visible without scrolling. */}
      <View style={styles.actions}>
        {Platform.OS === 'web' ? (
          <View style={styles.flex}>
            <Button title="✂️ Edit cut-out" variant="secondary" onPress={() => setStep('cutout')} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Button title="✕ Cancel" variant="secondary" onPress={discard} disabled={step === 'saving'} />
        </View>
      </View>
      <ItemTagForm fields={fields} onChange={setFields} />
      <Button title="Save item" onPress={save} busy={step === 'saving'} />
      <Button title="Cancel" variant="secondary" onPress={discard} disabled={step === 'saving'} />
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
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
