import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip, ChipGroup } from '@/components/chips';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/lib/dialogs';
import { useTags } from '@/lib/tag-store';
import { TAG_KIND_TITLES, type TagKind } from '@/lib/tags';

/**
 * Tag groups as collapsible rows: each row shows what's picked ("Colors   Navy, White ▸");
 * tap it to open the chips. "+ New" creates a tag of that kind (and selects it).
 * Renaming and deleting live in the Tags screen → Edit.
 */
export function TagPicker({
  kinds,
  value,
  onChange,
}: {
  kinds: readonly TagKind[];
  value: string[];
  onChange: (tagIds: string[]) => void;
}) {
  const theme = useTheme();
  const { ofKind, byId } = useTags();
  const [open, setOpen] = useState<TagKind | null>(null);

  return (
    <View style={[styles.list, { backgroundColor: theme.backgroundElement }]}>
      {kinds.map((kind, index) => {
        const selected = value.filter((id) => byId.get(id)?.kind === kind);
        const isOpen = open === kind;
        return (
          <View
            key={kind}
            style={[styles.groupRow, index > 0 && { borderTopWidth: 1, borderColor: theme.background }]}>
            <Pressable
              onPress={() => setOpen(isOpen ? null : kind)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={styles.summary}>
              <Text style={[styles.kind, { color: theme.text }]}>{TAG_KIND_TITLES[kind]}</Text>
              <Text style={[styles.picked, { color: selected.length ? theme.text : theme.textSecondary }]} numberOfLines={1}>
                {selected.length ? selected.map((id) => byId.get(id)?.name).join(', ') : 'Tap to choose'}
              </Text>
              <Text style={{ color: theme.textSecondary }}>{isOpen ? '▾' : '▸'}</Text>
            </Pressable>
            {isOpen ? (
              <View style={styles.chips}>
                <ChipGroup
                  options={ofKind(kind).map((t) => t.id)}
                  labelOf={(id) => byId.get(id)?.name ?? ''}
                  value={selected}
                  onChange={(selectedInKind) =>
                    onChange([...value.filter((id) => byId.get(id)?.kind !== kind), ...selectedInKind])
                  }>
                  <NewTagChip kind={kind} onCreated={(id) => onChange([...value, id])} />
                </ChipGroup>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** A "+ New" chip that turns into a small text box for naming a new tag. */
export function NewTagChip({ kind, onCreated }: { kind: TagKind; onCreated: (tagId: string) => void }) {
  const theme = useTheme();
  const { addTag } = useTags();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const tag = await addTag(kind, name);
      onCreated(tag.id);
      setName('');
      setEditing(false);
    } catch (e) {
      showMessage('Could not add tag', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) return <Chip text="+ New" selected={false} onPress={() => setEditing(true)} />;

  return (
    <View style={styles.newRow}>
      <TextInput
        autoFocus
        style={[styles.input, { color: theme.text, borderColor: theme.tint }]}
        placeholder={`New ${TAG_KIND_TITLES[kind].toLowerCase()} tag`}
        placeholderTextColor={theme.textSecondary}
        value={name}
        onChangeText={setName}
        maxLength={40}
        editable={!busy}
        returnKeyType="done"
        onSubmitEditing={create}
      />
      <Chip text="Add" selected onPress={create} />
      <Chip
        text="Cancel"
        selected={false}
        onPress={() => {
          setName('');
          setEditing(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 12, overflow: 'hidden' },
  groupRow: { paddingHorizontal: Spacing.three },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 14 },
  kind: { width: 84, fontSize: 15, fontWeight: '600' },
  picked: { flex: 1, fontSize: 15 },
  chips: { paddingBottom: Spacing.three },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, fontSize: 14, minWidth: 140 },
});
