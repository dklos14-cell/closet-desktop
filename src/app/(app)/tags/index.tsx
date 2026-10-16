import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/chips';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/lib/dialogs';
import { fetchItems } from '@/lib/items';
import { useTags } from '@/lib/tag-store';
import { TAG_KIND_TITLES, TAG_KINDS } from '@/lib/tags';

/** All tags with how many items use each. Tap one to see those items in the Closet. */
export default function TagsScreen() {
  const theme = useTheme();
  const { ofKind } = useTags();
  const [counts, setCounts] = useState<Map<string, number> | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchItems()
        .then((items) => {
          const c = new Map<string, number>();
          for (const item of items) for (const id of item.tagIds) c.set(id, (c.get(id) ?? 0) + 1);
          setCounts(c);
        })
        .catch((e) => showMessage('Could not load tags', e.message));
    }, []),
  );

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/tags/manage')} hitSlop={10} accessibilityLabel="Edit tags">
              <Text style={[styles.headerButton, { color: theme.tint }]}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <Text style={{ color: theme.textSecondary }}>
        Tap a tag to see its items in your closet. Use Edit to add, rename or delete tags.
      </Text>
      {TAG_KINDS.map((kind) => (
        <View key={kind} style={styles.group}>
          <Text style={[styles.title, { color: theme.textSecondary }]}>{TAG_KIND_TITLES[kind]}</Text>
          <View style={styles.row}>
            {ofKind(kind).map((tag) => (
              <Chip
                key={tag.id}
                text={counts ? `${tag.name} · ${counts.get(tag.id) ?? 0}` : tag.name}
                selected={false}
                onPress={() => router.push({ pathname: '/closet', params: { tag: tag.id } })}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  headerButton: { fontSize: 17, fontWeight: '600' },
});
