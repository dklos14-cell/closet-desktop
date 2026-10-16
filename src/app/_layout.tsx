import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useResolvedScheme, useTheme } from '@/hooks/use-theme';
import { InstallHint } from '@/components/install-hint';
import { getDb } from '@/lib/db';
import { isDesktop } from '@/lib/desktop';
import { ProfileProvider } from '@/lib/profile-store';
import { TagProvider } from '@/lib/tag-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // The closet is read from this computer before anything is shown.
  const [state, setState] = useState<'loading' | 'ready' | Error>('loading');
  useEffect(() => {
    // Phone / browser: keep the app's files on the device so it opens without internet.
    if (Platform.OS === 'web' && !isDesktop && !__DEV__ && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Offline mode unavailable', e));
    }
    getDb()
      .then(() => setState('ready'))
      .catch((e: Error) => setState(e))
      .finally(() => SplashScreen.hideAsync());
  }, []);

  if (state === 'loading') return null;
  if (state instanceof Error) {
    return (
      <View style={errorStyles.screen}>
        <Text style={errorStyles.title}>Could not open your closet</Text>
        <Text style={errorStyles.message}>{state.message}</Text>
      </View>
    );
  }
  return (
    <ProfileProvider>
      <TagProvider>
        <View style={{ flex: 1 }}>
          <InstallHint />
          <ThemedApp />
        </View>
      </TagProvider>
    </ProfileProvider>
  );
}

/** Light/dark + accent color from the profile, applied to headers and the menu too. */
function ThemedApp() {
  const scheme = useResolvedScheme();
  const theme = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: theme.tint } }}>
      <RootStack />
    </ThemeProvider>
  );
}

function RootStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

/**
 * If a screen crashes, show this instead of a frozen app. It first tries once by itself
 * (most hiccups are a one-off), then offers Try again / Reload.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const [triedOnce, setTriedOnce] = useState(false);
  useEffect(() => {
    if (triedOnce) return;
    const t = setTimeout(() => {
      setTriedOnce(true);
      retry();
    }, 600);
    return () => clearTimeout(t);
  }, [triedOnce, retry]);

  return (
    <View style={errorStyles.screen}>
      <Text style={errorStyles.title}>Something went wrong</Text>
      <Text style={errorStyles.message}>{error.message}</Text>
      <Pressable style={errorStyles.button} onPress={() => retry()} accessibilityRole="button">
        <Text style={errorStyles.buttonText}>Try again</Text>
      </Pressable>
      {Platform.OS === 'web' ? (
        <Pressable onPress={() => window.location.reload()} accessibilityRole="button">
          <Text style={errorStyles.link}>Reload the app</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const errorStyles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: '#000' },
  message: { color: '#60646C', textAlign: 'center' },
  button: { backgroundColor: '#208AEF', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { color: '#208AEF', fontWeight: '600', padding: 8 },
});
