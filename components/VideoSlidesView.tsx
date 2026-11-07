import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import {
  ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAudioMeta } from '../contexts/AudioContext';
import {
  YOUTUBE_EMBED_ORIGIN, YouTubeVideo, formatDuration, youtubeEmbedHtml,
  youtubeWatchUrl,
} from '../data/youtubeVideos';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Primary video first; any further entries are offered as alternate sources. */
  videos: YouTubeVideo[];
  /** Where to open the video, in seconds. Ignored when 0. */
  startSec?: number;
  accentColor: string;
}

/**
 * Full-screen viewer for slide-style lecture videos, played through YouTube's
 * official embedded player inside a WebView.
 *
 * The slides here are burned into the video by the publisher, so unlike our own
 * Presentation mode there is nothing to align — the text on screen is always in
 * step with the voice. The trade-offs are that this needs a live connection and
 * cannot take part in offline downloads.
 */
export default function VideoSlidesView({
  visible, onClose, videos, startSec = 0, accentColor,
}: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const audio = useAudioMeta();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [pick, setPick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const video = videos[Math.min(pick, videos.length - 1)];

  // Two audio streams at once is never what anyone wants: hand the ears over
  // to the video for as long as it is on screen.
  useEffect(() => {
    if (visible && audio.isPlaying) audio.pause();
    // Intentionally not re-running when isPlaying flips later — the user may
    // legitimately restart our own player from the mini player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setFailed(false);
    }
  }, [visible, video?.videoId]);

  useEffect(() => {
    if (visible) setPick(0);
    if (!visible) setFullscreen(false);
  }, [visible]);

  // The activity is pinned to portrait in AndroidManifest.xml, so the player's
  // own expand button can never rotate the phone by itself — that is why it
  // needed the device rotate toggle. A runtime lock overrides the manifest,
  // and only for as long as the video is expanded.
  useEffect(() => {
    if (!visible) return;
    ScreenOrientation.lockAsync(
      fullscreen
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
  }, [visible, fullscreen]);

  // Whatever happens, the rest of the app goes back to portrait when this
  // screen goes away — including on an unmount that skips the close button.
  useEffect(() => () => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .catch(() => {});
  }, []);

  // `onError` only covers the wrapper document, which always loads. If the
  // iframe inside it never reports back — no connection, or YouTube hanging —
  // fall through to the "Open in YouTube" escape hatch rather than spinning
  // for ever.
  useEffect(() => {
    if (!visible || !loading) return;
    const t = setTimeout(() => { setLoading(false); setFailed(true); }, 15000);
    return () => clearTimeout(t);
  }, [visible, loading, video?.videoId]);

  // --- Zoom -------------------------------------------------------------
  // Done here rather than by letting the WebView zoom its own page: the page
  // holds a cross-origin iframe that handles its own touches, so page zoom is
  // unreliable, and leaving the page pannable is what pushed the picture off
  // centre. Scaling the view that hosts the WebView sidesteps both.
  //
  // Every gesture is two-finger, so single taps still reach the player's own
  // controls untouched.
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    startScale.value = 1;
    startTx.value = 0;
    startTy.value = 0;
  }, [scale, tx, ty, startScale, startTx, startTy]);

  // A zoom that survived into a different layout would be disorienting.
  useEffect(() => { resetZoom(); }, [fullscreen, visible, video?.videoId, resetZoom]);

  const pinch = Gesture.Pinch()
    .onStart(() => { startScale.value = scale.value; })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      scale.value = Math.min(Math.max(next, 1), 4);
    })
    .onEnd(() => {
      if (scale.value <= 1.02) runOnJS(resetZoom)();
    });

  // Two fingers to move the zoomed picture around; one finger stays the
  // player's, for its scrubber and controls.
  const pan = Gesture.Pan()
    .minPointers(2)
    .onStart(() => { startTx.value = tx.value; startTy.value = ty.value; })
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = startTx.value + e.translationX;
      ty.value = startTy.value + e.translationY;
    });

  const zoomGesture = Gesture.Simultaneous(pinch, pan);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  if (!video) return null;

  // Letterbox a 16:9 stage inside whatever space we have, so rotating the phone
  // gives a genuinely bigger picture instead of a stretched one.
  const chromeHeight = insets.top + insets.bottom + (videos.length > 1 ? 170 : 130);
  const stageWidth = Math.min(width, Math.max(240, (height - chromeHeight) * (16 / 9)));
  const stageHeight = stageWidth * (9 / 16);

  // Expanded, the player takes the parent exactly as measured. Sizing it from
  // `useWindowDimensions()` instead put it off centre: that width ignores the
  // display cutout, so in landscape the bars came out uneven.
  const stage = fullscreen
    ? StyleSheet.absoluteFillObject
    : { width: stageWidth, height: stageHeight };


  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}
    >
      {/* RNGH does not reach across a Modal boundary: without a root of its
          own in here, the app-level one in _layout.tsx never sees these. */}
      <GestureHandlerRootView style={styles.container}>
        {!fullscreen && (
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { top: insets.top + 12 }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={26} color={c.textQuinary} />
          </TouchableOpacity>
        )}

        <View style={styles.stageArea}>
          {failed ? (
            <View style={styles.fallbackBox}>
              <Ionicons name="cloud-offline-outline" size={34} color={c.textDimmer} />
              <Text style={styles.fallbackText}>
                Couldn't load the video. Check your connection, or watch it on YouTube.
              </Text>
              <TouchableOpacity
                style={[styles.fallbackBtn, { borderColor: accentColor }]}
                onPress={() => Linking.openURL(youtubeWatchUrl(video.videoId, startSec))}
              >
                <Text style={[styles.fallbackBtnText, { color: accentColor }]}>
                  Open in YouTube
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <GestureDetector gesture={zoomGesture}>
              <Animated.View style={[stage, zoomStyle]}>
              <WebView
                key={video.videoId}
                style={styles.webview}
                // Not `{ uri: embedUrl }`: as a top-level document the embed
                // carries no Referer and YouTube answers "Video player
                // configuration error". The iframe wrapper gives it one.
                source={{
                  html: youtubeEmbedHtml(video.videoId, startSec),
                  baseUrl: YOUTUBE_EMBED_ORIGIN,
                }}
                originWhitelist={['https://*']}
                // The embed is a video player, so it needs to be allowed to
                // start playing without a second tap inside the WebView.
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
                setSupportMultipleWindows={false}
                // No WebView-level zoom: it left the page pannable, which is
                // what drifted the picture off centre. Zoom is a React Native
                // gesture on the hosting view instead.
                scalesPageToFit={false}
                setBuiltInZoomControls={false}
                // The wrapper document loads instantly, so its own load event
                // says nothing about the player. Wait for the iframe instead.
                onMessage={({ nativeEvent }) => {
                  const msg = nativeEvent.data;
                  if (msg === 'ready') setLoading(false);
                  if (msg === 'error') { setLoading(false); setFailed(true); }
                  if (msg === 'fullscreen:on') setFullscreen(true);
                  if (msg === 'fullscreen:off') setFullscreen(false);
                }}
                onError={() => { setLoading(false); setFailed(true); }}
                onHttpError={({ nativeEvent }) => {
                  // A 4xx on the embed document itself means the video is gone
                  // or embedding is disabled; media sub-requests 4xx harmlessly.
                  if (nativeEvent.url?.includes('/embed/')) {
                    setLoading(false);
                    setFailed(true);
                  }
                }}
                // Keep the WebView on the embed. Taps on the YouTube logo,
                // channel name or "Watch later" would otherwise navigate this
                // view into the full YouTube site, which we don't want to host.
                onShouldStartLoadWithRequest={(req) => {
                  // Anything that is still the player, or the page hosting it,
                  // stays in the WebView.
                  if (req.url.includes('/embed/')) return true;
                  if (req.url === YOUTUBE_EMBED_ORIGIN
                    || req.url === `${YOUTUBE_EMBED_ORIGIN}/`
                    || req.url.startsWith('about:')
                    || req.url.startsWith('data:')) return true;

                  // Everything else is the user leaving for YouTube — the logo,
                  // the channel name, "Watch on YouTube" — so hand it to the
                  // YouTube app or the browser.
                  //
                  // This deliberately does NOT test `navigationType === 'click'`:
                  // that field is iOS-only and is always 'other' on Android, so
                  // the old check silently blocked every one of these taps
                  // instead of opening them.
                  Linking.openURL(req.url).catch(() => {});
                  return false;
                }}
              />
              {loading && (
                <View style={styles.loadingOverlay} pointerEvents="none">
                  <ActivityIndicator color={accentColor} />
                </View>
              )}
              </Animated.View>
            </GestureDetector>
          )}
        </View>

        {!fullscreen && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>{video.ytTitle}</Text>
            {/* A dependable way out to YouTube, next to the in-player links
                that only work when the WebView lets the tap through. */}
            <TouchableOpacity
              onPress={() => Linking.openURL(youtubeWatchUrl(video.videoId, startSec)).catch(() => {})}
              style={styles.openBtn}
              hitSlop={8}
            >
              <Ionicons name="logo-youtube" size={20} color={c.danger} />
              <Text style={styles.openBtnText}>Open</Text>
            </TouchableOpacity>
          </View>
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
        )}
      </GestureHandlerRootView>
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
  stageArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    // Zoomed-in, the scaled player must be cropped by the stage rather than
    // spilling over our chrome.
    overflow: 'hidden',
  },
  webview: { flex: 1, backgroundColor: c.videoBg },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.videoBg,
  },
  fallbackBox: { alignItems: 'center', gap: 14, paddingHorizontal: 36 },
  fallbackText: { color: c.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  fallbackBtn: {
    borderWidth: 1, borderRadius: 22,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  fallbackBtnText: { fontSize: 14, fontWeight: '600' },
  footer: {
    borderTopWidth: 1, borderTopColor: c.border,
    paddingTop: 12, paddingHorizontal: 20,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { color: c.paper, fontSize: 15, fontWeight: '600', lineHeight: 21, flex: 1 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: c.elevatedStrong, borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 11,
  },
  openBtnText: { color: c.textQuinary, fontSize: 12, fontWeight: '600' },
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
