import React, { useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import {
  Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAudioMeta, useAudioPosition } from '../contexts/AudioContext';
import { useFocusMode } from '../utils/focusMode';
import TypeThumb from './TypeThumb';

const TAB_BAR_HEIGHT = 60;

export default function MiniPlayer() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  // Meta only — pause/play button must not be behind a 2 Hz re-render cycle.
  const audio = useAudioMeta();
  const insets = useSafeAreaInsets();
  const focusMode = useFocusMode();

  // Transcript-only mode on the lecture screen hides every other control.
  if (!audio.lecture || focusMode) return null;

  const accentColor = audio.lecture.type === 'Bhagavad-gita' ? '#FF7722' : c.link;

  const handlePress = () => {
    router.push(`/lecture/${audio.lecture!.id}`);
  };

  const togglePlay = () => {
    if (audio.isPlaying) audio.pause();
    else audio.resume();
  };

  return (
    <View style={[styles.wrapper, { bottom: TAB_BAR_HEIGHT + insets.bottom + 6 }]}>
      <MiniProgressBar accentColor={accentColor} />

      <Pressable onPress={handlePress} style={styles.container}>
        {/* Cover / type thumbnail */}
        <TypeThumb type={audio.lecture.type} size={42} radius={10} showBadge />

        {/* Title area */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {audio.lecture.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {audio.lecture.location} · {audio.lecture.year}
          </Text>
        </View>

        {/* Controls */}
        <TouchableOpacity onPress={togglePlay} style={[styles.playBtn, { backgroundColor: accentColor }]}>
          <Ionicons name={audio.isPlaying ? 'pause' : 'play'} size={18} color={c.onAccent} style={!audio.isPlaying && { marginLeft: 2 }} />
        </TouchableOpacity>

        <TouchableOpacity onPress={audio.stop} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={c.textMuted} />
        </TouchableOpacity>
      </Pressable>
    </View>
  );
}

// The only ticking piece of the mini-player. It owns no pressable, so its
// 2 Hz re-render can't delay a touch on the play/pause/close buttons above.
function MiniProgressBar({ accentColor }: { accentColor: string }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { positionMs, durationMs } = useAudioPosition();
  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accentColor }]} />
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  // Floating rounded card a few px above the tab bar.
  wrapper: {
    position: 'absolute', left: 10, right: 10,
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: 1, borderColor: c.borderStrong,
    overflow: 'hidden',
    shadowColor: c.shadow, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 20,
    zIndex: 100,
  },
  progressTrack: { height: 3, backgroundColor: c.border },
  progressFill: { height: 3, borderRadius: 2 },
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 8, gap: 11,
  },
  info: { flex: 1 },
  title: { color: c.textTertiary, fontSize: 13, fontWeight: '700' },
  meta: { color: c.textDim, fontSize: 11, marginTop: 2 },
  playBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
});
