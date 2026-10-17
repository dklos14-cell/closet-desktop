import type { StyleProp, ViewStyle } from 'react-native';

import { OutfitBoard } from '@/components/outfit-board';
import { BOARD_ASPECT } from '@/lib/outfit-board';
import type { OutfitWithItems } from '@/lib/outfits';

/** An outfit's picture: your photo wearing it (if you chose to show it), else the outfit board. */
export function OutfitPicture({ outfit, style }: { outfit: OutfitWithItems; style?: StyleProp<ViewStyle> }) {
  if (outfit.show_photo && outfit.photoUrl) {
    return (
      <img
        src={outfit.photoUrl}
        alt={outfit.name ?? 'Outfit photo'}
        style={{ width: '100%', aspectRatio: String(BOARD_ASPECT), objectFit: 'cover', borderRadius: 12, display: 'block' }}
      />
    );
  }
  return <OutfitBoard items={outfit.items} style={style} />;
}
