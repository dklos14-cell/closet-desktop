import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** A "Cancel" text button for the top-left of a screen's header. */
export function HeaderCancel({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.button}>
      <Text style={[styles.text, { color: theme.tint }]}>Cancel</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 12, paddingVertical: 6 },
  text: { fontSize: 17 },
});
