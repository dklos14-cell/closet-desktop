import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chips';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/lib/dialogs';
import { addFolder, type Folder } from '@/lib/outfits';

/** Pick the folder an outfit is filed in (or none), or make a new folder right here. */
export function FolderChooser({
  folders,
  value,
  onChange,
  onCreated,
}: {
  folders: Folder[];
  value: string | null;
  onChange: (folderId: string | null) => void;
  onCreated: (folder: Folder) => void;
}) {
  const theme = useTheme();
  const [naming, setNaming] = useState<string | null>(null);

  async function create() {
    if (!naming?.trim()) return setNaming(null);
    try {
      const folder = await addFolder(naming);
      onCreated(folder);
      onChange(folder.id);
      setNaming(null);
    } catch (e) {
      showMessage('Could not add the folder', (e as Error).message);
    }
  }

  return (
    <View style={styles.row}>
      <Chip text="No folder" selected={value === null} onPress={() => onChange(null)} />
      {folders.map((f) => (
        <Chip key={f.id} text={`📁 ${f.name}`} selected={value === f.id} onPress={() => onChange(f.id)} />
      ))}
      {naming === null ? (
        <Chip text="+ New folder" selected={false} onPress={() => setNaming('')} />
      ) : (
        <View style={styles.row}>
          <TextInput
            autoFocus
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            placeholder="Folder name"
            placeholderTextColor={theme.textSecondary}
            value={naming}
            onChangeText={setNaming}
            onSubmitEditing={create}
            onKeyPress={(e) => e.nativeEvent.key === 'Escape' && setNaming(null)}
            maxLength={40}
          />
          <Chip text="Add" selected onPress={create} />
          <Chip text="Cancel" selected={false} onPress={() => setNaming(null)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, minWidth: 160 },
});
