import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/lib/profile-store';

/** The user's picture: their photo, else their emoji, else the first letter of their name. */
export function Avatar({ size = 48 }: { size?: number }) {
  const theme = useTheme();
  const { profile, avatarUrl } = useProfile();
  const letter = (profile.display_name || '?').charAt(0).toUpperCase();

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.tint }]}>
      {profile.avatar_path && avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : profile.avatar_emoji ? (
        <Text style={{ fontSize: size * 0.55 }}>{profile.avatar_emoji}</Text>
      ) : (
        <Text style={{ fontSize: size * 0.45, color: '#fff', fontWeight: '700' }}>{letter}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
