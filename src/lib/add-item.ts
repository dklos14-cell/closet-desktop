import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

import { showMessage } from '@/lib/dialogs';
import { pickPhoto } from '@/lib/items';

/** "Add clothes": choose or take a photo, then open the cut-out + tag screen. */
export function startAddItem() {
  const start = async (source: 'camera' | 'library') => {
    try {
      const photoUri = await pickPhoto(source);
      if (photoUri) router.push({ pathname: '/closet/new', params: { photoUri } }, { withAnchor: true });
    } catch (e) {
      showMessage('Could not get photo', (e as Error).message);
    }
  };
  if (Platform.OS === 'web') {
    // Phone browsers already offer "Take photo" inside the file picker.
    start('library');
    return;
  }
  Alert.alert('Add item', undefined, [
    { text: 'Take photo', onPress: () => start('camera') },
    { text: 'Choose from library', onPress: () => start('library') },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
