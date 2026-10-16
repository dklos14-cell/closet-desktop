import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { NewTagChip } from '@/components/tag-picker';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { useTags } from '@/lib/tag-store';
import { TAG_KIND_TITLES, TAG_KINDS, type Tag } from '@/lib/tags';

/** Rename, delete and add tags in every group. */
export default function ManageTagsScreen() {
  const theme = useTheme();
  const { ofKind } = useTags();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text style={{ color: theme.textSecondary }}>
        Tap a name to rename it, then Save (or Cancel). Deleting a tag removes it from every item and outfit.
      </Text>
      {TAG_KINDS.map((kind) => (
        <View key={kind} style={styles.group}>
          <Text style={[styles.title, { color: theme.textSecondary }]}>{TAG_KIND_TITLES[kind]}</Text>
          {ofKind(kind).map((tag) => (
            <TagRow key={tag.id} tag={tag} />
          ))}
          <View style={styles.newRow}>
            <NewTagChip kind={kind} onCreated={() => {}} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function TagRow({ tag }: { tag: Tag }) {
  const theme = useTheme();
  const { renameTag, deleteTag } = useTags();
  const [draft, setDraft] = useState(tag.name);

  async function rename() {
    const name = draft.trim();
    if (name === tag.name) return;
    if (!name) {
      setDraft(tag.name);
      return;
    }
    try {
      await renameTag(tag.id, name);
    } catch (e) {
      showMessage('Could not rename', (e as Error).message);
      setDraft(tag.name);
    }
  }

  async function remove() {
    if (!(await confirmAction(`Delete "${tag.name}"?`, 'It will be removed from every item and outfit.', 'Delete')))
      return;
    try {
      await deleteTag(tag.id);
    } catch (e) {
      showMessage('Could not delete', (e as Error).message);
    }
  }

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <TextInput
        style={[styles.input, { color: theme.text }]}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={rename}
        maxLength={40}
        returnKeyType="done"
        accessibilityLabel={`Rename ${tag.name}`}
      />
      {draft !== tag.name ? (
        <>
          <Pressable onPress={rename} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: theme.tint, fontWeight: '700' }}>Save</Text>
          </Pressable>
          <Pressable onPress={() => setDraft(tag.name)} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: theme.textSecondary }}>Cancel</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={remove} hitSlop={10} accessibilityLabel={`Delete ${tag.name}`}>
          <Text style={{ color: theme.danger }}>Delete</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  group: { gap: Spacing.two },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  newRow: { flexDirection: 'row' },
});
