import { useEffect, useEffectEvent } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showMessage } from '@/lib/dialogs';
import { canRemoveBackground, cutOut } from '@/lib/items';

export type CutoutStepProps = {
  photoUri: string;
  /** Web only: a previous cut-out's mask, to keep editing it ("Edit cut-out again"). */
  initialMaskUri?: string;
  /** Called with the finished transparent picture, and (web) the mask, for editing it again later. */
  onDone: (pngUri: string, maskUri?: string) => void;
  onCancel: () => void;
};

/**
 * Phones: automatic on-device cut-out (Apple Vision / Google ML Kit), no editing.
 * The web version (cutout-step.web.tsx) is the custom subtractor with manual brushes.
 */
export function CutoutStep({ photoUri, onDone, onCancel }: CutoutStepProps) {
  const theme = useTheme();
  // Effect events always see the latest props without re-running the effect.
  const done = useEffectEvent(onDone);
  const cancel = useEffectEvent(onCancel);

  useEffect(() => {
    let cancelled = false;
    cutOut(photoUri)
      .then((png) => {
        if (!cancelled) done(png);
      })
      .catch((e) => {
        if (cancelled) return;
        const code = (e as { code?: string }).code;
        showMessage(
          'Could not remove the background',
          code === 'NO_SUBJECT_FOUND'
            ? 'No clothing item was found. Try a photo with the item clearly in view.'
            : code === 'SEGMENTATION_FAILED' && Platform.OS === 'android'
              ? 'The cut-out model may still be downloading via Google Play services. ' +
                'Stay on Wi-Fi and try again in a minute.'
              : (e as Error).message,
        );
        cancel();
      });
    return () => {
      cancelled = true;
    };
  }, [photoUri]);

  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
      <ActivityIndicator />
      <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
        {canRemoveBackground
          ? 'Removing background…'
          : 'Preview mode (Expo Go): the background is not removed. Install the development build for cut-outs.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.three },
});
