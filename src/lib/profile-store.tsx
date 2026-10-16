import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Accent } from '@/constants/theme';
import { clearCache } from '@/lib/cache';
import { getDb, monthlyCleanup, saveDb } from '@/lib/db';
import { photoUrl } from '@/lib/desktop';
import { deletePictures, storePicture } from '@/lib/images';

// Keep these in sync with the CHECK constraints on public.profiles.
export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEMES)[number];

export type Profile = {
  display_name: string | null;
  avatar_emoji: string | null;
  avatar_path: string | null;
  accent: Accent;
  theme: ThemeChoice;
  /** 0 = Sunday, 1 = Monday */
  week_start: 0 | 1;
  /** Where the Today screen's weather is for (null = not set yet). */
  weather_place: string | null;
  weather_lat: number | null;
  weather_lon: number | null;
  temp_unit: 'fahrenheit' | 'celsius';
};

export type ProfileFields = Partial<Profile>;

const DEFAULT_PROFILE: Profile = {
  display_name: null,
  avatar_emoji: null,
  avatar_path: null,
  accent: 'blue',
  theme: 'system',
  week_start: 1,
  weather_place: null,
  weather_lat: null,
  weather_lon: null,
  temp_unit: 'fahrenheit',
};

type ProfileStore = {
  profile: Profile;
  /** Signed URL of the profile photo, if there is one. */
  avatarUrl: string | null;
  /** Saves immediately (the screen updates first, so it feels instant). */
  update: (fields: ProfileFields) => Promise<void>;
  uploadAvatar: (photoUri: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileStore>({
  profile: DEFAULT_PROFILE,
  avatarUrl: null,
  update: async () => {},
  uploadAvatar: async () => {},
});

/** Loads the profile (name, picture, color, theme, week start). */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const avatarUrl = profile.avatar_path ? photoUrl(profile.avatar_path) : null;

  useEffect(() => {
    getDb().then((db) => {
      const { last_cleanup: _, ...saved } = db.profile;
      setProfile({ ...DEFAULT_PROFILE, ...saved });
      // Once a month: clear last month's one-off calendar days and outfits.
      // Items, favorites and repeating events stay.
      monthlyCleanup()
        .then((ran) => {
          if (ran) clearCache(); // screens reload without the cleared days
        })
        .catch((e) => console.warn('Monthly clean-up failed', e));
    });
  }, []);

  const update = useCallback(async (fields: ProfileFields) => {
    setProfile((p) => ({ ...p, ...fields }));
    const db = await getDb();
    Object.assign(db.profile, fields);
    await saveDb();
  }, []);

  /** Shrinks the photo to a 256px square-ish PNG and keeps it in the photos folder. */
  const uploadAvatar = useCallback(
    async (photoUri: string) => {
      const context = ImageManipulator.manipulate(photoUri);
      context.resize({ width: 256 });
      const png = await (await context.renderAsync()).saveAsync({ format: SaveFormat.PNG });
      const path = await storePicture(png.uri, `avatar-${Date.now()}`);
      const old = profile.avatar_path;
      await update({ avatar_path: path });
      await deletePictures([old]);
    },
    [profile.avatar_path, update],
  );

  const value = useMemo(() => ({ profile, avatarUrl, update, uploadAvatar }), [profile, avatarUrl, update, uploadAvatar]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileStore {
  return useContext(ProfileContext);
}
