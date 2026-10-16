import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Thumb } from '@/lib/images';

/** A row of small item pictures, e.g. to preview an outfit. */
export function ThumbStrip({ items, size = 56, max = 6 }: { items: Thumb[]; size?: number; max?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {items.slice(0, max).map((item) => (
        <View
          key={item.id}
          style={[styles.tile, { width: size, height: size, backgroundColor: theme.backgroundElement }]}>
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl, cacheKey: item.image_path }}
              style={styles.image}
              contentFit="contain"
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.one, flexWrap: 'wrap' },
  tile: { borderRadius: 8, padding: 4 },
  image: { flex: 1 },
});
