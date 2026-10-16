import { Stack } from 'expo-router';

import { MenuButton } from '@/components/menu-button';

// The section's list screen always sits underneath anything opened inside it, so Cancel / Back
// lands on the list, even when the screen was opened from another section (e.g. Today).
export const unstable_settings = { anchor: 'index' };

export default function OutfitsLayout() {
  return (
    // Deeper screens keep the back arrow on the left and get the ☰ menu on the right.
    <Stack screenOptions={{ headerRight: () => <MenuButton /> }}>
      <Stack.Screen name="index" options={{ title: 'Outfits', headerLargeTitle: true, headerLeft: () => <MenuButton /> }} />
      <Stack.Screen name="edit" options={{ title: 'Outfit', presentation: 'modal' }} />
    </Stack>
  );
}
