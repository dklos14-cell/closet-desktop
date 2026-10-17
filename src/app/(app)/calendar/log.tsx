import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Button } from '@/components/button';
import { HeaderCancel } from '@/components/header-cancel';
import { ThumbStrip } from '@/components/thumb-strip';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addEntry } from '@/lib/calendar';
import { fetchOutfits, type OutfitWithItems } from '@/lib/outfits';
import { showMessage } from '@/lib/dialogs';
import { cancelEditing, goBack } from '@/lib/navigation';
import { useEditorShortcuts } from '@/lib/commands';

/** Pick which outfit was worn on `date`, with an optional note. */
export default function LogOutfitScreen() {
  const theme = useTheme();
  const { date } = useLocalSearchParams<{ date: string }>();
  const [outfits, setOutfits] = useState<OutfitWithItems[] | null>(null);
  const [outfitId, setOutfitId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOutfits()
      .then(setOutfits)
      .catch((e) => {
        showMessage('Could not load outfits', e.message);
        goBack('/');
      });
  }, []);

  function cancel() {
    cancelEditing(outfitId !== null || note.trim() !== '', '/');
  }

  async function save() {
    if (!outfitId) return;
    setSaving(true);
    try {
      await addEntry(date, outfitId, note.trim() || null);
      goBack('/');
    } catch (e) {
      showMessage('Could not save', (e as Error).message);
      setSaving(false);
    }
  }

  useEditorShortcuts({ save, cancel, enabled: !saving });

  if (!outfits) return <ActivityIndicator style={{ flex: 1, backgroundColor: theme.background }} />;

  const dayTitle = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerLeft: () => <HeaderCancel onPress={cancel} /> }} />
      <Text style={[styles.title, { color: theme.text }]}>What did you wear on {dayTitle}?</Text>

      {outfits.length === 0 ? (
        <Text style={{ color: theme.textSecondary }}>
          You have no outfits yet. Create one in the Outfits tab first.
        </Text>
      ) : (
        outfits.map((outfit) => (
          <Pressable
            key={outfit.id}
            onPress={() => setOutfitId(outfit.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: outfitId === outfit.id }}
            style={[
              styles.card,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: outfitId === outfit.id ? theme.tint : 'transparent',
              },
            ]}>
            <Text style={[styles.name, { color: theme.text }]}>{outfit.name || 'Untitled outfit'}</Text>
            <ThumbStrip items={outfit.items} size={44} />
          </Pressable>
        ))
      )}

      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="Event (optional), e.g. Dinner with friends"
        placeholderTextColor={theme.textSecondary}
        value={note}
        onChangeText={setNote}
      />
      <Button title="Save" onPress={save} busy={saving} disabled={!outfitId} />
      <Button title="Cancel" variant="secondary" onPress={cancel} disabled={saving} />
      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
        One-off days are cleared when a new month starts. For something every week, use Calendar → 🔁 Repeating.
      </Text>
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
  title: { fontSize: 18, fontWeight: '600' },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two, borderWidth: 3 },
  name: { fontSize: 16, fontWeight: '600' },
  input: { borderRadius: 10, padding: 14, fontSize: 16 },
});
