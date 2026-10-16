import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const textColor = primary ? '#fff' : variant === 'danger' ? theme.danger : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      onPress={onPress}
      style={[
        styles.button,
        // backgroundSelected so secondary buttons also show up inside gray cards
        { backgroundColor: primary ? theme.tint : theme.backgroundSelected },
        (busy || disabled) && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 10, padding: 14, alignItems: 'center' },
  dimmed: { opacity: 0.6 },
  text: { fontSize: 16, fontWeight: '600' },
});
