import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { isDesktop } from '@/lib/desktop';

/**
 * On an iPhone/iPad, opened in Safari (not from the home screen): explain how to install it.
 * The home-screen app keeps its own closet, separate from Safari's, so install first.
 */
export function InstallHint() {
  const [hidden, setHidden] = useState(false);
  if (hidden || !shouldShow()) return null;
  return (
    <View style={styles.bar}>
      <Text style={styles.text}>
        <Text style={styles.bold}>Install Closet first: </Text>tap Share (the square with the arrow), then
        &quot;Add to Home Screen&quot;, and open Closet from its icon. A closet started here in Safari
        stays in Safari.
      </Text>
      <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide">
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

function shouldShow(): boolean {
  if (Platform.OS !== 'web' || isDesktop) return false;
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return apple && !installed;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF4D6',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  text: { flex: 1, color: '#3D2E00', fontSize: 14, lineHeight: 19 },
  bold: { fontWeight: '700' },
  close: { color: '#3D2E00', fontSize: 18, padding: 4 },
});
