import React, { useEffect, useMemo, useState } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudio } from '../contexts/AudioContext';
import { loadScreens, Screen, ScreensFile } from '../data/screensManifest';
import { READER_FONT_FAMILY } from '../utils/readerFont';
import AudioPlayer from './AudioPlayer';
import FullscreenToggle from './FullscreenToggle';

// Desktop (web) windows are big: larger slide text and a centred player.
const WIDE = Platform.OS === 'web';

interface Props {
  visible: boolean;
  onClose: () => void;
  recordingId: string;
  accentColor: string;
}

function findActiveScreen(screens: Screen[], positionSec: number): number {
  let lo = 0, hi = screens.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (screens[mid].start <= positionSec) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export default function PresentationView({ visible, onClose, recordingId, accentColor }: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const audio = useAudio();
  const insets = useSafeAreaInsets();
  const [screensFile, setScreensFile] = useState<ScreensFile | null>(null);

  useEffect(() => {
    setScreensFile(loadScreens(recordingId, audio.partIndex));
  }, [recordingId, audio.partIndex]);

  const screens = screensFile?.screens ?? [];
  const activeIndex = useMemo(
    () => (screens.length ? findActiveScreen(screens, audio.positionMs / 1000) : -1),
    [screens, audio.positionMs]
  );
  const activeScreen = activeIndex >= 0 ? screens[activeIndex] : null;

  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    opacity.value = 0;
    translateY.value = 6;
    opacity.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
    // Only the slide identity should retrigger the transition, not every position tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={26} color={c.textQuinary} />
        </TouchableOpacity>
        {WIDE && <FullscreenToggle color={c.textQuinary} style={[styles.closeBtn, { top: insets.top + 12, right: 64 }]} />}

        <View style={styles.slideArea}>
          {activeScreen ? (
            <Animated.View style={animatedStyle}>
              {activeScreen.lines.map((line, i) => (
                <Text key={i} style={styles.line}>{line}</Text>
              ))}
            </Animated.View>
          ) : (
            <Text style={styles.fallback}>No synced captions for this part yet</Text>
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <View style={WIDE ? { width: '100%', maxWidth: 720, alignSelf: 'center' } : undefined}>
            <AudioPlayer accentColor={accentColor} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bgDeep },
  closeBtn: {
    position: 'absolute', right: 16, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.overlaySubtle,
  },
  slideArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28,
  },
  line: {
    color: c.paper,
    fontSize: WIDE ? 42 : 24,
    lineHeight: WIDE ? 64 : 36,
    textAlign: 'center',
    fontFamily: READER_FONT_FAMILY as any,
    marginVertical: 4,
  },
  fallback: {
    color: c.textDim,
    fontSize: 15,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 4,
  },
});
