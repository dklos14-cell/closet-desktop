import { Drawer, DrawerContentScrollView, DrawerItem, type DrawerContentComponentProps } from 'expo-router/drawer';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, StyleSheet, Text, useWindowDimensions, View, type ColorValue } from 'react-native';

import { Avatar } from '@/components/avatar';
import { MenuButton, SIDEBAR_WIDTH } from '@/components/menu-button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { startAddItem } from '@/lib/add-item';
import { useProfile } from '@/lib/profile-store';

/** The menu, top to bottom. `route` is a drawer screen; `action` runs something instead. */
const MENU: {
  label: string;
  icon: SymbolViewProps['name'];
  route?: string;
  action?: () => void;
}[] = [
  { label: 'Today', route: 'index', icon: { ios: 'sun.max', android: 'today', web: 'today' } },
  { label: 'Closet', route: 'closet', icon: { ios: 'hanger', android: 'checkroom', web: 'checkroom' } },
  { label: 'Add clothes', action: startAddItem, icon: { ios: 'camera', android: 'add_a_photo', web: 'add_a_photo' } },
  { label: 'Outfits', route: 'outfits', icon: { ios: 'tshirt', android: 'apparel', web: 'apparel' } },
  { label: 'Favorites', route: 'favorites', icon: { ios: 'heart', android: 'favorite', web: 'favorite' } },
  { label: 'Calendar', route: 'calendar', icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' } },
  { label: 'Stats', route: 'stats', icon: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' } },
  { label: 'Tags', route: 'tags', icon: { ios: 'tag', android: 'sell', web: 'sell' } },
  { label: 'Profile', route: 'profile', icon: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' } },
];

/** Sections that are stacks of screens (list → detail / editor). */
const STACKS = new Set(['closet', 'outfits', 'calendar', 'tags']);

export default function AppLayout() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const sidebar = width >= SIDEBAR_WIDTH; // wide screens: the menu stays open on the left

  return (
    <Drawer
      drawerContent={(props) => <Menu {...props} />}
      screenOptions={{
        drawerType: sidebar ? 'permanent' : 'front',
        // Swiping in from the edge clashes with swiping between days on Today (and with the
        // browser's own back-swipe), so on the website the menu opens with the ☰ button only.
        swipeEnabled: Platform.OS !== 'web',
        headerLeft: () => <MenuButton />,
        // Leaving a section closes any screen opened inside it (e.g. a half-done "New item"),
        // so coming back shows the section itself.
        popToTopOnBlur: true,
        drawerActiveTintColor: theme.tint,
        drawerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.background },
      }}>
      <Drawer.Screen name="index" options={{ title: 'Today' }} />
      {/* These have their own stacks (and menu button), so the drawer's header is hidden. */}
      <Drawer.Screen name="closet" options={{ title: 'Closet', headerShown: false }} />
      <Drawer.Screen name="outfits" options={{ title: 'Outfits', headerShown: false }} />
      <Drawer.Screen name="calendar" options={{ title: 'Calendar', headerShown: false }} />
      <Drawer.Screen name="tags" options={{ title: 'Tags', headerShown: false }} />
      <Drawer.Screen name="favorites" options={{ title: 'Favorites' }} />
      <Drawer.Screen name="stats" options={{ title: 'Stats' }} />
      <Drawer.Screen name="profile" options={{ title: 'Profile' }} />
    </Drawer>
  );
}

function Menu(props: DrawerContentComponentProps) {
  const theme = useTheme();
  const { profile } = useProfile();
  const sidebar = useWindowDimensions().width >= SIDEBAR_WIDTH;
  const current = props.state.routes[props.state.index]?.name;

  const icon = (name: SymbolViewProps['name']) => {
    function MenuIcon({ color, size }: { color: ColorValue; size: number }) {
      return <SymbolView name={name} tintColor={color} size={size} />;
    }
    return MenuIcon;
  };

  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.header}>
        <Avatar size={56} />
        <Text style={[styles.appName, { color: theme.text }]} numberOfLines={1}>
          {profile.display_name || 'My Closet'}
        </Text>
      </View>
      {MENU.map((entry) => (
        <DrawerItem
          key={entry.label}
          label={entry.label}
          icon={icon(entry.icon)}
          focused={entry.route === current}
          activeTintColor={theme.tint}
          inactiveTintColor={theme.text}
          onPress={() => {
            if (!sidebar) props.navigation.closeDrawer();
            // Always open the section's main screen, even if something was open inside it.
            if (entry.route) props.navigation.navigate(entry.route, STACKS.has(entry.route) ? { screen: 'index' } : undefined);
            else entry.action?.();
          }}
        />
      ))}
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.one, alignItems: 'flex-start' },
  appName: { fontSize: 22, fontWeight: '700' },
});
