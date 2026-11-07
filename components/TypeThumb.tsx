import React from 'react';
import { Image, ImageSourcePropType, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTypeMeta } from '../data/types';

/**
 * Real BBT book covers (Bhagavad-gita As It Is, SB First Canto, CC Adi-lila 1,
 * via Open Library). Other collections fall back to their coloured icon tile.
 */
export const COVERS: Record<string, ImageSourcePropType> = {
  'Bhagavad-gita': require('../assets/covers/bg.jpg'),
  'Srimad-Bhagavatam': require('../assets/covers/sb.jpg'),
  CC: require('../assets/covers/cc.jpg'),
};

/**
 * Square versions (whole cover centred on a blurred copy) for the media
 * notification / lock screen, which crop artwork to a square.
 */
export const NOTIFICATION_ART: Record<string, ImageSourcePropType> = {
  'Bhagavad-gita': require('../assets/covers/bg-square.jpg'),
  'Srimad-Bhagavatam': require('../assets/covers/sb-square.jpg'),
  CC: require('../assets/covers/cc-square.jpg'),
};

export function getNotificationArt(type: string): ImageSourcePropType | undefined {
  return NOTIFICATION_ART[type];
}

export function getCover(type: string): ImageSourcePropType | undefined {
  return COVERS[type];
}

interface Props {
  type: string;
  size: number;
  radius?: number;
  /** For types without a cover: show the badge text (BG/CONV…) instead of the icon. */
  showBadge?: boolean;
}

/** Square thumbnail for a recording type: cover art if we have it, else icon tile. */
export default function TypeThumb({ type, size, radius = 12, showBadge }: Props) {
  const meta = getTypeMeta(type);
  const cover = COVERS[type];
  if (cover) {
    return (
      <Image
        source={cover}
        style={{ width: size, height: size, borderRadius: radius }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      style={{
        width: size, height: size, borderRadius: radius,
        backgroundColor: meta.color + '22',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {showBadge ? (
        <Text style={{ color: meta.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }}>
          {meta.badge}
        </Text>
      ) : (
        <Ionicons name={meta.icon as any} size={Math.round(size * 0.45)} color={meta.color} />
      )}
    </View>
  );
}
