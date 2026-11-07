import React, { useEffect, useState, useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import {
  Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudio } from '../contexts/AudioContext';
import { YouTubeVideo, formatDuration, youtubeEmbedUrl } from '../data/youtubeVideos';

interface Props {
  visible: boolean;
  onClose: () => void;
  videos: YouTubeVideo[];
  startSec?: number;
  accentColor: string;
}

/**
 * Web build of the slide-video viewer.
 *
 * `react-native-webview` has no web implementation — importing it here would
 * break the bundle — and on web the thing it wraps is just an iframe, so this
 * variant embeds YouTube directly. Metro resolves `.web.tsx` ahead of `.tsx`,
 * so native keeps the WebView version and neither platform sees the other's
 * dependency. Behaviour is otherwise kept in step with the native file.
 */
export default function VideoSlidesView({
  visible, onClose, videos, startSec = 0, accentColor,
}: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const audio = useAudio();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [pick, setPick] = useState(0);

  const video = videos[Math.min(pick, videos.length - 1)];

  // Hand the ears over to the video while it is on screen.
  useEffect(() => {
    if (visible && audio.isPlaying) audio.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible) setPick(0);
  }, [visible]);

  if (!video) return null;

  const chromeHeight = insets.top + insets.bottom + (videos.length > 1 ? 170 : 130);
  const stageWidth = Math.min(width, Math.max(240, (height - chromeHeight) * (16 / 9)));
  const stageHeight = stageWidth * (9 / 16);

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          hitSlop={8}
        >
          <Ionicons name="close" size={26} color={c.textQuinary} />
        </TouchableOpacity>

        <View style={styles.stageArea}>
          <View style={{ width: stageWidth, height: stageHeight }}>
            <iframe
              key={video.videoId}
              title={video.ytTitle}
              src={youtubeEmbedUrl(video.videoId, startSec)}
              style={{ width: '100%', height: '100%', border: 0, background: c.videoBg }}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.title} numberOfLines={2}>{video.ytTitle}</Text>
          <Text style={styles.credit}>
            {video.channel}
            {formatDuration(video.durationSec) ? ` · ${formatDuration(video.durationSec)}` : ''}
            {' · played on YouTube'}
          </Text>

          {videos.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.sourceRow}
              contentContainerStyle={styles.sourceRowContent}
            >
              {videos.map((v, i) => (
                <TouchableOpacity
                  key={v.videoId}
                  onPress={() => setPick(i)}
                  style={[
                    styles.sourceChip,
                    i === pick && { backgroundColor: accentColor + '22', borderColor: accentColor },
                  ]}
                >
                  <Text
                    style={[styles.sourceChipText, i === pick && { color: accentColor }]}
                    numberOfLines={1}
                  >
                    {v.channel}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bgDeep },
  closeBtn: {
    position: 'absolute', right: 16, zIndex: 10,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.overlaySubtle,
  },
  stageArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: {
    borderTopWidth: 1, borderTopColor: c.border,
    paddingTop: 12, paddingHorizontal: 20,
  },
  title: { color: c.paper, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  credit: { color: c.textDimmer, fontSize: 11, marginTop: 5 },
  sourceRow: { marginTop: 12, marginHorizontal: -20 },
  sourceRowContent: { paddingHorizontal: 20, gap: 8 },
  sourceChip: {
    borderWidth: 1, borderColor: c.elevatedStrong, borderRadius: 16,
    paddingVertical: 7, paddingHorizontal: 14,
    maxWidth: 220,
  },
  sourceChipText: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
});
