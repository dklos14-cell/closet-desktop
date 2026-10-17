import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { autoLayout, BOARD_ASPECT, type Layout } from '@/lib/outfit-board';
import type { Tag } from '@/lib/tags';
import { useTags } from '@/lib/tag-store';

export type BoardPiece = {
  id: string;
  imageUrl: string | null;
  image_path: string;
  tagIds: string[];
  layout?: Layout | null;
  /** The item's photos: main, then extra angles (Layout.angle picks one). */
  angleUrls?: string[];
};

/** The picture a piece shows on the board: its chosen angle, else the main photo. */
export function pictureOf(item: BoardPiece, layout: Layout | undefined): string | null {
  return item.angleUrls?.[layout?.angle ?? 0] ?? item.imageUrl;
}

/** Saved positions where they exist; automatic ones for items never placed by hand. */
export function resolveLayouts(
  items: BoardPiece[],
  tagById: Map<string, Tag>,
  saved?: Map<string, Layout>,
): Map<string, Layout> {
  const auto = autoLayout(items, tagById);
  return new Map(items.map((it) => [it.id, saved?.get(it.id) ?? it.layout ?? auto.get(it.id)!]));
}

/** The whole outfit as one picture: each item placed, sized and rotated on a 3:4 board. */
export function OutfitBoard({ items, style }: { items: BoardPiece[]; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const { byId } = useTags();
  const [width, setWidth] = useState(0);
  const layouts = useMemo(() => resolveLayouts(items, byId), [items, byId]);
  const height = width / BOARD_ASPECT;
  const ordered = [...items].sort((a, b) => layouts.get(a.id)!.z - layouts.get(b.id)!.z);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.board, { backgroundColor: theme.backgroundElement }, style]}>
      {width > 0
        ? ordered.map((item) => {
            const l = layouts.get(item.id)!;
            const size = l.scale * width;
            return (
              <View
                key={item.id}
                style={{
                  position: 'absolute',
                  left: l.x * width - size / 2,
                  top: l.y * height - size / 2,
                  width: size,
                  height: size,
                  transform: [{ rotate: `${l.rotation}deg` }, { scaleX: l.flip ? -1 : 1 }],
                }}>
                {pictureOf(item, l) ? (
                  <Image source={{ uri: pictureOf(item, l)! }} style={styles.image} contentFit="contain" />
                ) : null}
              </View>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { width: '100%', aspectRatio: BOARD_ASPECT, borderRadius: 16, overflow: 'hidden' },
  image: { flex: 1 },
});
