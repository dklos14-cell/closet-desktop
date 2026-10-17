import { Stack } from 'expo-router';

import { MenuButton } from '@/components/menu-button';

// The section's list screen always sits underneath anything opened inside it, so Cancel / Back
// lands on the list, even when the screen was opened from another section (e.g. Today).
export const unstable_settings = { anchor: 'index' };

export default function ClosetLayout() {
  return (
    // Deeper screens keep the back arrow on the left and get the ☰ menu on the right.
    <Stack screenOptions={{ headerRight: () => <MenuButton /> }}>
      <Stack.Screen name="index" options={{ title: 'Closet', headerLargeTitle: true, headerLeft: () => <MenuButton /> }} />
      <Stack.Screen name="new" options={{ title: 'New item', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Item' }} />
      <Stack.Screen name="recut" options={{ title: 'Edit cut-out', presentation: 'modal' }} />
      <Stack.Screen name="angle" options={{ title: 'Add angle', presentation: 'modal' }} />
    </Stack>
  );
}
