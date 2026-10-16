/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Accents, Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProfile } from '@/lib/profile-store';

/** 'light' or 'dark': the user's choice in Profile, or the phone's setting. */
export function useResolvedScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const { profile } = useProfile();
  if (profile.theme !== 'system') return profile.theme;
  return system === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  const scheme = useResolvedScheme();
  const { profile } = useProfile();
  return { ...Colors[scheme], tint: Accents[profile.accent][scheme] };
}
