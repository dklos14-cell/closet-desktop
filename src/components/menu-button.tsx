import { useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, useWindowDimensions } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** At this width and above the menu is a sidebar that's always open (laptops, tablets sideways). */
export const SIDEBAR_WIDTH = 1000;

/**
 * The ☰ button that opens the side menu. Hidden when the menu is already a permanent sidebar.
 *
 * On iPhone Safari one tap arrives as a touch *and*, a moment later, a "click" at the same spot.
 * If the menu opened on the touch, that click would land on the dimmed background that just
 * appeared and close the menu again. Opening a moment later lets that click pass harmlessly.
 */
export function MenuButton() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  if (width >= SIDEBAR_WIDTH) return null;

  return (
    <Pressable
      onPress={() => setTimeout(() => navigation.dispatch({ type: 'OPEN_DRAWER' }), Platform.OS === 'web' ? 120 : 0)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Show navigation menu"
      style={styles.button}>
      <SymbolView name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }} tintColor={theme.text} size={26} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 12, paddingVertical: 6 },
});
