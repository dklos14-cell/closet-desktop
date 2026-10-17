import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { label } from '@/lib/tags';

export function Chip({
  text,
  selected,
  onPress,
}: {
  text: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ hovered }: { hovered?: boolean }) => [
        styles.chip,
        // backgroundSelected (not backgroundElement) so chips also show up inside gray cards
        { backgroundColor: selected ? theme.tint : theme.backgroundSelected },
        hovered && styles.hovered,
      ]}>
      <Text style={[styles.chipText, { color: selected ? '#fff' : theme.text }]}>{text}</Text>
    </Pressable>
  );
}

/** A titled row of chips; any number can be selected. */
export function ChipGroup<T extends string>({
  title,
  options,
  value,
  onChange,
  labelOf = label,
  scroll = false,
  children,
}: {
  title?: string;
  options: readonly T[];
  value: T[];
  onChange: (next: T[]) => void;
  /** Text shown for an option (default: the value, tidied up). */
  labelOf?: (option: T) => string;
  /** Single line that scrolls sideways (filters) instead of wrapping (forms). */
  scroll?: boolean;
  /** Extra chips after the options, e.g. "+ New". */
  children?: ReactNode;
}) {
  const theme = useTheme();
  const toggle = (option: T) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);

  const chips = options.map((option) => (
    <Chip
      key={option}
      text={labelOf(option)}
      selected={value.includes(option)}
      onPress={() => toggle(option)}
    />
  ));

  return (
    <View style={styles.group}>
      {title ? (
        <Text style={[styles.title, { color: theme.textSecondary }]}>{title}</Text>
      ) : null}
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {chips}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.row, styles.wrap]}>
          {chips}
          {children}
        </View>
      )}
    </View>
  );
}

/** Same look as ChipGroup, but exactly one option can be selected. */
export function SingleChipGroup<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: readonly T[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <ChipGroup
      title={title}
      options={options}
      value={value ? [value] : []}
      onChange={(next) => {
        const picked = next.find((v) => v !== value);
        if (picked) onChange(picked);
      }}
    />
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  title: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: Spacing.two },
  wrap: { flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  hovered: { opacity: 0.78 },
  chipText: { fontSize: 14 },
});
