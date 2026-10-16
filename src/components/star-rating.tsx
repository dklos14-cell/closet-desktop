import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 1-5 stars. Tapping the current rating again clears it. */
export function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.title, { color: theme.textSecondary }]}>Rating</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            hitSlop={6}
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
            onPress={() => onChange(value === n ? null : n)}>
            <Text style={[styles.star, { color: theme.tint }]}>
              {value !== null && n <= value ? '★' : '☆'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  stars: { flexDirection: 'row', gap: Spacing.two },
  star: { fontSize: 32 },
});
