import { StyleSheet, TextInput } from 'react-native';

import { SingleChipGroup } from '@/components/chips';
import { StarRating } from '@/components/star-rating';
import { TagPicker } from '@/components/tag-picker';
import { useTheme } from '@/hooks/use-theme';
import { ITEM_TAG_KINDS, WARMTHS, WEAR_STATUSES, type ItemFields } from '@/lib/tags';

/** All editable fields of an item. Used when adding and when editing. */
export function ItemTagForm({
  fields,
  onChange,
}: {
  fields: ItemFields;
  onChange: (next: ItemFields) => void;
}) {
  const theme = useTheme();
  const set =
    <K extends keyof ItemFields>(key: K) =>
    (value: ItemFields[K]) =>
      onChange({ ...fields, [key]: value });

  return (
    <>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="Name (optional)"
        placeholderTextColor={theme.textSecondary}
        value={fields.name ?? ''}
        onChangeText={set('name')}
      />
      <TagPicker kinds={ITEM_TAG_KINDS} value={fields.tagIds} onChange={set('tagIds')} />
      <SingleChipGroup title="Warmth" options={WARMTHS} value={fields.warmth} onChange={set('warmth')} />
      <SingleChipGroup
        title="Status"
        options={WEAR_STATUSES}
        value={fields.wear_status}
        onChange={set('wear_status')}
      />
      <StarRating value={fields.rating} onChange={set('rating')} />
    </>
  );
}

const styles = StyleSheet.create({
  input: { borderRadius: 10, padding: 14, fontSize: 16 },
});
