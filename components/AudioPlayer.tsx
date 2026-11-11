import React, { useCallback, useRef, useState, useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import {
  ActivityIndicator, PanResponder, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioMeta, useAudioPosition } from '../contexts/AudioContext';
import { useSettings } from '../contexts/SettingsContext';
import { nextInSection } from '../utils/nextInSection';
import { getTalk, isTalkOnly, loadTalkOnly, onTalkOnlyChange, setTalkOnly } from '../utils/talkOnly';

export const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

function formatMs(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

interface Props {
  accentColor: string;
  /** Tighter layout for the lecture screen's pinned dropdown: smaller play
   * button, less padding, and no speed row (that dropdown has its own). */
  compact?: boolean;
}

export default function AudioPlayer({ accentColor, compact = false }: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  // Split the audio subscription: the outer component reads only meta
  // (isPlaying, speed, actions), so pause/play/skip buttons don't wait behind
  // a 2 Hz re-render cycle. The ticking seek+time UI lives in inner leaves
  // that use useAudioPosition — those re-render 2×/s but a re-render of a
  // tiny leaf can't delay a touch on a sibling.
  const audio = useAudioMeta();
  const { readerFontScale: fontScale, autoPlayNext, setAutoPlayNext } = useSettings();
  const upNext = useMemo(() => (audio.recording ? nextInSection(audio.recording) : null), [audio.recording]);
  const talk = getTalk(audio.recording ? (audio.recording.pvId ?? audio.recording.id) : null);
  const [talkOn, setTalkOn] = useState(isTalkOnly());
  React.useEffect(() => {
    loadTalkOnly().then(setTalkOn);
    return onTalkOnlyChange(setTalkOn);
  }, []);
  const [tip, setTip] = useState<string | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTip = useCallback((text: string) => {
    setTip(text);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), 2200);
  }, []);
  React.useEffect(() => () => { if (tipTimer.current) clearTimeout(tipTimer.current); }, []);

  const togglePlay = () => {
    if (audio.isPlaying) audio.pause();
    else audio.resume();
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(audio.speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    audio.setSpeed(next);
  };

  const hasParts = audio.audioUrls.length > 1;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {hasParts && (
        <View style={styles.partsRow}>
          {audio.audioUrls.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => audio.playPart(i)}
              style={[
                styles.partBtn,
                audio.partIndex === i && { backgroundColor: accentColor + '33', borderColor: accentColor },
              ]}
            >
              <Text style={[styles.partText, { fontSize: 13 * fontScale }, audio.partIndex === i && { color: accentColor }]}>
                Part {i + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <SeekBar accentColor={accentColor} compact={compact} onSeek={audio.seek} />

      <TimeRow fontScale={fontScale} compact={compact} />

      <View style={styles.controls}>
        <TouchableOpacity onPress={audio.skipBackward} style={styles.skipBtn}>
          <Ionicons name="play-back" size={22} color={c.textQuinary} />
          <Text style={[styles.skipLabel, { fontSize: 9 * fontScale }]}>15</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={togglePlay}
          style={[styles.playBtn, compact && styles.playBtnCompact, { backgroundColor: accentColor }]}
        >
          {audio.isLoading ? (
            <ActivityIndicator color={c.textPrimary} size="small" />
          ) : (
            <Ionicons name={audio.isPlaying ? 'pause' : 'play'} size={compact ? 22 : 28} color={c.textPrimary} />
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={audio.skipForward} style={styles.skipBtn}>
          <Ionicons name="play-forward" size={22} color={c.textQuinary} />
          <Text style={[styles.skipLabel, { fontSize: 9 * fontScale }]}>15</Text>
        </TouchableOpacity>
      </View>

      {/* Autoplay · speed · Prabhupāda only, as icons. A tap toggles and
          briefly names what changed; a long-press just names it. */}
      <View style={[styles.optionsRow, compact && styles.optionsRowCompact]}>
        {tip ? (
          <View style={styles.tipWrap} pointerEvents="none">
            <View style={styles.tip}>
              <Text style={[styles.tipText, { fontSize: 12 * fontScale }]}>{tip}</Text>
            </View>
          </View>
        ) : null}
        {upNext && (
          <OptionIcon
            icon="play-skip-forward"
            on={autoPlayNext}
            accentColor={accentColor}
            label="Autoplay next lecture"
            onPress={() => {
              const next = !autoPlayNext;
              setAutoPlayNext(next);
              showTip(next ? `Autoplay next: on · ${upNext.title}` : 'Autoplay next: off');
            }}
            onLongPress={() => showTip(autoPlayNext ? `Autoplay next: on · ${upNext.title}` : 'Autoplay next: off')}
          />
        )}
        {!compact && (
          <TouchableOpacity onPress={cycleSpeed} style={[styles.speedBtn, { borderColor: accentColor + '66' }]}>
            <Text style={[styles.speedText, { fontSize: 13 * fontScale, color: accentColor }]}>{audio.speed}x</Text>
          </TouchableOpacity>
        )}
        {talk && (
          <OptionIcon
            icon="mic"
            on={talkOn}
            accentColor={accentColor}
            label="Play only Prabhupada speaking"
            onPress={() => {
              const next = !talkOn;
              setTalkOnly(next);
              showTip(next
                ? `Prabhupāda only: on · ${Math.round(talk.talkSec / 60)} of ${Math.round(talk.totalSec / 60)} min (skips śloka, readings, kirtan)`
                : 'Prabhupāda only: off · full recording');
            }}
            onLongPress={() => showTip(talkOn
              ? `Prabhupāda only: on · ${Math.round(talk.talkSec / 60)} of ${Math.round(talk.totalSec / 60)} min`
              : 'Prabhupāda only: off · tap to skip śloka, readings and kirtan')}
          />
        )}
      </View>

      {audio.error ? <Text style={[styles.errorText, { fontSize: 12 * fontScale }]}>{audio.error}</Text> : null}
    </View>
  );
}

/** Round on/off icon button used in the options row. */
function OptionIcon({ icon, on, accentColor, label, onPress, onLongPress }: {
  icon: string; on: boolean; accentColor: string; label: string;
  onPress: () => void; onLongPress: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.optIcon, on ? { backgroundColor: accentColor, borderColor: accentColor } : { borderColor: c.borderStrong }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Ionicons name={(on ? icon : `${icon}-outline`) as any} size={17} color={on ? c.onAccent : c.textDim} />
    </TouchableOpacity>
  );
}

// Position-subscribing leaves. Re-render on every tick — but they don't own
// any pressable, so nothing on screen has its touch handling delayed by their
// render work.

function SeekBar({ accentColor, compact, onSeek }: { accentColor: string; compact: boolean; onSeek: (ms: number) => Promise<void> }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { positionMs, durationMs } = useAudioPosition();
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;

  const seekRef = useRef<View>(null);
  const trackPageX = useRef(0);
  const trackWidth = useRef(1);
  const [seekRatio, setSeekRatio] = useState<number | null>(null);

  const onSeekLayout = useCallback(() => {
    seekRef.current?.measure((_x, _y, width, _h, pageX) => {
      trackPageX.current = pageX;
      trackWidth.current = Math.max(1, width);
    });
  }, []);
  const clamp = (pageX: number) =>
    Math.max(0, Math.min((pageX - trackPageX.current) / trackWidth.current, 1));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_e, gs) => setSeekRatio(clamp(gs.x0)),
      onPanResponderMove: (_e, gs) => setSeekRatio(clamp(gs.moveX)),
      onPanResponderRelease: (_e, gs) => {
        const ratio = clamp(gs.moveX);
        setSeekRatio(null);
        onSeek(ratio * durationRef.current);
      },
      onPanResponderTerminate: () => setSeekRatio(null),
    })
  ).current;

  const progress = seekRatio !== null
    ? seekRatio
    : durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  const pct = `${(progress * 100).toFixed(2)}%`;

  return (
    <View
      ref={seekRef}
      style={[styles.seekContainer, compact && styles.seekContainerCompact]}
      onLayout={onSeekLayout}
      {...panResponder.panHandlers}
    >
      <View style={styles.seekTrack}>
        <View style={[styles.seekFill, { width: pct, backgroundColor: accentColor }]} />
        <View style={[styles.seekThumb, { left: pct as any, backgroundColor: accentColor }]} />
      </View>
    </View>
  );
}

function TimeRow({ fontScale, compact }: { fontScale: number; compact: boolean }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { positionMs, durationMs } = useAudioPosition();
  return (
    <View style={[styles.timeRow, compact && styles.timeRowCompact]}>
      <Text style={[styles.timeText, { fontSize: 12 * fontScale }]}>{formatMs(positionMs)}</Text>
      <Text style={[styles.timeText, { fontSize: 12 * fontScale }]}>{formatMs(durationMs)}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { paddingVertical: 12, paddingHorizontal: 4 },
  containerCompact: { paddingVertical: 4 },
  partsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, justifyContent: 'center' },
  partBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: c.textFaintest },
  partText: { color: c.textMuted, fontSize: 13, fontWeight: '600' },

  seekContainer: {
    paddingVertical: 20,  // large vertical hit area
    marginBottom: 2,
  },
  seekTrack: {
    height: 4,
    backgroundColor: c.borderStrong,
    borderRadius: 2,
    position: 'relative',
    overflow: 'visible',
  },
  seekFill: {
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  seekThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    position: 'absolute',
    top: -8,
    marginLeft: -10,
    shadowColor: c.shadow,
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },

  seekContainerCompact: { paddingVertical: 14 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  timeRowCompact: { marginBottom: 8 },
  timeText: { color: c.textDim, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  skipBtn: { alignItems: 'center', position: 'relative' },
  skipLabel: { position: 'absolute', bottom: -2, right: -6, color: c.textQuinary, fontSize: 9, fontWeight: '700' },
  playBtn: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: c.shadow, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  playBtnCompact: { width: 48, height: 48, borderRadius: 24 },
  speedBtn: { paddingHorizontal: 16, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  optionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 18, marginTop: 14,
  },
  optionsRowCompact: { marginTop: 8 },
  optIcon: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  // Below the icons, so it never covers the play controls.
  tipWrap: { position: 'absolute', top: 44, left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  tip: {
    maxWidth: 300, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: c.textPrimary,
  },
  tipText: { color: c.bg, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  speedText: { fontSize: 13, fontWeight: '700' },
  errorText: { color: c.dangerAlt, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
