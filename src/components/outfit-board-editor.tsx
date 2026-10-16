import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chips';
import { OutfitBoard, type BoardPiece } from '@/components/outfit-board';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Layout } from '@/lib/outfit-board';

export type OutfitBoardEditorProps = {
  items: BoardPiece[];
  layouts: Map<string, Layout>;
  onChange: (layouts: Map<string, Layout>) => void;
  onAutoArrange: () => void;
  /** Takes a piece out of the outfit (shown when a piece is selected). */
  onRemove?: (itemId: string) => void;
};

/**
 * Phone-app version: shows the arranged outfit. Dragging and resizing pieces is done on the
 * website (outfit-board-editor.web.tsx).
 */
export function OutfitBoardEditor({ items, layouts, onAutoArrange }: OutfitBoardEditorProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <OutfitBoard items={items.map((it) => ({ ...it, layout: layouts.get(it.id) }))} />
      <View style={styles.row}>
        <Chip text="Auto-arrange" selected={false} onPress={onAutoArrange} />
        <Text style={{ color: theme.textSecondary, flex: 1 }}>Move and resize pieces on the website.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
