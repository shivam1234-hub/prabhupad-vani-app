import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palette';
import {
  Alert, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutoScrollControl, useAutoScroll, useAutoScrollSpeed } from '../../components/AutoScroll';
import { useAudioMeta, useAudioPosition } from '../../contexts/AudioContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { useDownload } from '../../contexts/DownloadContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useSettings } from '../../contexts/SettingsContext';
import { getTypeMeta, getRecordingId } from '../../data/types';
import TranscriptViewer, { TranscriptViewerHandle } from '../../components/TranscriptViewer';
import TagManager from '../../components/TagManager';
import AudioPlayer, { SPEEDS } from '../../components/AudioPlayer';
import WordDefinitionSheet from '../../components/WordDefinitionSheet';
// Note: we intentionally do NOT auto-preload the dictionary here. Reading
// and indexing the 8.6 MB WordNet file blocks the JS thread for hundreds of
// ms right after the lecture opens, which showed up as first-open scroll
// jank. The dictionary loads lazily on the reader's first word lookup
// instead (WordDefinitionSheet awaits preloadDictionary internally).
import { setFocusMode, useFocusMode } from '../../utils/focusMode';
import { formatMs } from '../../utils/time';
import { audioEvents } from '../../utils/audioEvents';
import VideoSlidesView from '../../components/VideoSlidesView';
import { formatDuration, getYouTubeVideos } from '../../data/youtubeVideos';
import { Desktop } from '../../components/desktop';

function LectureDetail() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id, resume } = useLocalSearchParams<{ id: string; resume?: string }>();
  const resumeMs = resume ? parseInt(resume, 10) : 0;
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const screenRef = useRef<View>(null);
  const scrollYRef = useRef(0);
  const transcriptRef = useRef<TranscriptViewerHandle>(null);
  const insets = useSafeAreaInsets();
  // Read the tick-immune part of the audio context here. The pinned time
  // display and the VideoSlidesView start-position both need the ticking
  // position, but they read it via useAudioPosition() inside their own
  // memoized leaves so this screen stays off the 2 Hz re-render loop while
  // audio is playing (that was the "scroll and back feel laggy" complaint).
  const audio = useAudioMeta();
  const { getById } = useAllRecordings();
  const { isDownloaded, getLocalUris, downloadRecording, deleteDownload, progress } = useDownload();
  const { isFavourite, toggleFavourite, getTagsFor } = useLibrary();
  const { readerFontScale: fontScale } = useSettings();
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [videoSlidesOpen, setVideoSlidesOpen] = useState(false);

  // Transcript search — owned here (not inside TranscriptViewer) so the search
  // bar can be a direct child of the ScrollView and use stickyHeaderIndices,
  // which is the only way to keep it pinned to the top while scrolling on
  // native (CSS `position: sticky` doesn't exist off web).
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  // "Now playing" line highlight — off by default, toggled via the sticky
  // bookmark icon so it can be switched off mid-lecture without scrolling
  // back up to TranscriptViewer's own (non-sticky) toolbar.
  const [highlightEnabled, setHighlightEnabled] = useState(false);

  // Per-word long-press-to-look-up wrapping. OFF by default because it
  // multiplies the transcript's native view count by ~15x (each word becomes
  // its own <Text onLongPress>). When the reader wants word meanings, they
  // flip this on via the pinned toolbar and accept the scroll trade-off.
  const [wordLookupEnabled, setWordLookupEnabled] = useState(false);

  // Audio / speed dropdowns hanging off the pinned bar. One at a time; search
  // is separate so a query survives opening the player to pause.
  const [openPanel, setOpenPanel] = useState<null | 'audio' | 'speed'>(null);
  const togglePanel = (panel: 'audio' | 'speed') => setOpenPanel(p => (p === panel ? null : panel));

  // Word pressed / double-clicked in the transcript, shown in the meaning sheet.
  const [lookup, setLookup] = useState<{ word: string; fromVerse: boolean } | null>(null);
  const handleWordLookup = useCallback(
    (word: string, fromVerse: boolean) => setLookup({ word, fromVerse }), [],
  );

  // Measured height of the pinned bar's button row, used as the ScrollView's
  // top padding so content starts below it. Only the row: the search box and
  // dropdowns below it overlay the text rather than pushing it down.
  const [topBarHeight, setTopBarHeight] = useState(0);

  // Transcript-only mode. Global (utils/focusMode) so the root-level
  // MiniPlayer hides too; reset on leaving the screen.
  const focusMode = useFocusMode();
  useEffect(() => () => setFocusMode(false), []);

  // Keep the reader's place across the toggle: the chrome around the text
  // appears or disappears (and the browser's own scroll anchoring may shift
  // things too), so note which line sits at the top of the view and where,
  // then scroll by however far it moved. Checked twice because the header
  // hides a beat after the content does.
  const toggleFocus = async (next: boolean) => {
    // The screen's root view, not the ScrollView: on web the ScrollView ref
    // measures its scrolled content, not the visible viewport.
    const screen = screenRef.current as any;
    const viewer = transcriptRef.current;
    let anchor: { key: string; y: number } | null = null;
    if (screen && viewer) {
      const screenTop = await new Promise<number>(res =>
        screen.measure((_x: number, _y: number, _w: number, _h: number, _px: number, py: number) => res(py)));
      anchor = await viewer.captureAnchor(screenTop + (focusMode ? insets.top : topBarHeight));
    }
    setOpenPanel(null);
    setFocusMode(next);
    if (!anchor) return;
    const correct = async () => {
      const y = await transcriptRef.current?.measureLine(anchor!.key);
      if (y == null) return;
      const d = y - anchor!.y;
      if (Math.abs(d) > 1) {
        scrollRef.current?.scrollTo({ y: Math.max(0, (scrollYRef.current ?? 0) + d), animated: false });
      }
    };
    setTimeout(correct, 80);
    setTimeout(correct, 300);
  };

  useEffect(() => {
    navigation.setOptions({ headerShown: !focusMode });
  }, [focusMode]);

  // "Back" (Android button, iOS swipe, header back) leaves focus mode first
  // instead of leaving the lecture.
  // Set when autoplay moves on to the next lecture; this screen is then
  // replaced by that lecture's screen. Lifting the focus-mode back guard first
  // lets the replace through, and focus mode itself (a global store) carries
  // over to the new screen.
  const [advancingTo, setAdvancingTo] = useState<string | null>(null);
  usePreventRemove(focusMode && !advancingTo, () => toggleFocus(false));

  // Desktop: Esc leaves focus mode.
  useEffect(() => {
    if (Platform.OS !== 'web' || !focusMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleFocus(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  const handleSearchToggle = () => {
    setSearchVisible(v => {
      const next = !v;
      if (!next) { setSearchQuery(''); setCurrentMatchIdx(0); }
      return next;
    });
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setCurrentMatchIdx(0);
  };

  const goPrevMatch = () => {
    if (!matchCount) return;
    const next = (currentMatchIdx - 1 + matchCount) % matchCount;
    setCurrentMatchIdx(next);
    transcriptRef.current?.jumpToMatch(next);
  };

  const goNextMatch = () => {
    if (!matchCount) return;
    const next = (currentMatchIdx + 1) % matchCount;
    setCurrentMatchIdx(next);
    transcriptRef.current?.jumpToMatch(next);
  };

  const recording = getById(id);
  const meta = recording ? getTypeMeta(recording.type) : null;
  const rid = recording ? getRecordingId(recording) : id;

  const downloaded = isDownloaded(rid);
  const dlProgress = progress[rid];
  const favourite = isFavourite(rid);
  const tags = getTagsFor(rid);
  const formattedDate = (() => {
    if (!recording?.date) return '';
    const d = new Date(recording.date + 'T00:00:00');
    if (isNaN(d.getTime())) return recording.date;
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  })();

  useEffect(() => {
    if (recording) navigation.setOptions({ title: recording.title });
  }, [recording]);

  // Autoplay finished this lecture and started the next one: follow it, so the
  // transcript on screen matches what is playing.
  useEffect(() => audioEvents.onAutoAdvance(({ fromId, toId }) => {
    if (fromId === rid) setAdvancingTo(toId);
  }), [rid]);

  useEffect(() => {
    if (advancingTo) router.replace(`/lecture/${advancingTo}` as any);
  }, [advancingTo]);

  // Auto-scroll: constant-speed scrolling while this lecture plays (or
  // freely, for reading, when its audio isn't loaded). Hooks stay above the
  // early return below.
  const [autoScrollOn, setAutoScrollOn] = useState(false);
  // The speed control hides itself a few seconds after the last touch, so it
  // doesn't sit over the text; a tap on the page or the toolbar button
  // brings it back.
  const [controlVisible, setControlVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControl = useCallback(() => {
    setControlVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlVisible(false), 3000);
  }, []);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const autoSpeed = useAutoScrollSpeed();
  const draggingRef = useRef(false);
  const maxYRef = useRef(0);
  const contentHRef = useRef(0);
  const viewHRef = useRef(0);
  const thisAudioLoaded = !!recording && audio.lecture?.id === recording.id;
  const autoScrollRunning = autoScrollOn && (!thisAudioLoaded || audio.isPlaying);
  useAutoScroll({
    scrollRef, scrollYRef, draggingRef, maxYRef,
    running: autoScrollRunning, level: autoSpeed.level,
  });
  const updateMaxY = () => { maxYRef.current = contentHRef.current - viewHRef.current; };

  if (!recording || !meta) {
    return (
      <View style={styles.notFound}>
        <Ionicons name="alert-circle-outline" size={48} color={c.textFaint} />
        <Text style={styles.notFoundText}>Recording not found</Text>
      </View>
    );
  }

  const accent = meta.color;

  const handleDownload = () => {
    if (dlProgress?.status === 'error') {
      downloadRecording(rid, recording.vanisourceUrl);
      return;
    }
    if (downloaded) {
      Alert.alert('Delete Download', 'Remove this recording from your device?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(rid) },
      ]);
    } else if (!dlProgress) {
      downloadRecording(rid, recording.vanisourceUrl);
    }
  };

  const handleShare = async () => {
    try {
      const url = recording.url ?? recording.vanisourceUrl;
      await Share.share({ message: `${recording.fullTitle}\n${url}`, url });
    } catch {}
  };

  const openBrowser = (url: string) =>
    WebBrowser.openBrowserAsync(url, { toolbarColor: c.bg, controlsColor: accent });

  const isThisPlaying = audio.recording?.id === recording.id && audio.isPlaying;
  // Audio for this lecture is loaded (playing or paused) — the audio and
  // speed dropdowns only make sense then.
  const isThisLoaded = audio.lecture?.id === recording.id;

  // Slide-format videos of this lecture, if any channel has published one.
  const slideVideos = getYouTubeVideos(recording.pvId);

  // Whether our current playback belongs to this lecture and is on its first
  // part; the video-slides opener reads live position only when this is true.
  // A video covers the whole lecture in one timeline, so on part 2+ our
  // position counts from the start of that part and would land in the wrong
  // place — hand it 0 in that case.
  const videoUseLivePosition =
    audio.recording?.id === recording.id && audio.partIndex === 0;

  const bottomPad = insets.bottom + (focusMode ? 40 : audio.recording ? 132 : 60);

  return (
    <View ref={screenRef} style={styles.screen}>
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={{
        paddingTop: focusMode ? insets.top + 8 : topBarHeight,
        paddingBottom: bottomPad,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
      onScrollBeginDrag={() => { draggingRef.current = true; }}
      // A quick tap anywhere (no drag) brings the hidden speed control back.
      onTouchStart={(e) => {
        const { pageX, pageY } = e.nativeEvent;
        tapStart.current = { x: pageX, y: pageY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const st = tapStart.current;
        tapStart.current = null;
        if (!autoScrollOn || !st) return;
        const { pageX, pageY } = e.nativeEvent;
        if (Date.now() - st.t < 300 && Math.abs(pageX - st.x) < 10 && Math.abs(pageY - st.y) < 10) {
          showControl();
        }
      }}
      onScrollEndDrag={() => { draggingRef.current = false; }}
      onContentSizeChange={(_w, h) => { contentHRef.current = h; updateMaxY(); }}
      onLayout={(e) => { viewHRef.current = e.nativeEvent.layout.height; updateMaxY(); }}
    >
      {!focusMode && (<>
      {/* Hero */}
      <View style={[styles.hero, { borderBottomColor: accent + '55' }]}>
        <View style={[styles.heroBadge, { backgroundColor: accent + '20', borderColor: accent + '55' }]}>
          <Text style={[styles.heroBadgeText, { color: accent, fontSize: 12 * fontScale }]}>{meta.label}</Text>
        </View>
        <Text style={[styles.heroChapter, { fontSize: 28 * fontScale }]}>{recording.title}</Text>
        <Text style={[styles.heroFull, { fontSize: 13 * fontScale }]} numberOfLines={2}>{recording.fullTitle}</Text>

        <View style={styles.heroTopRow}>
          <View style={styles.heroMeta}>
            <MetaChip icon="location-outline" text={recording.location} fontScale={fontScale} />
            <MetaChip icon="calendar-outline" text={String(recording.year)} fontScale={fontScale} />
          </View>
          <TouchableOpacity onPress={() => toggleFavourite(rid)} style={styles.favBtn} hitSlop={8}>
            <Ionicons
              name={favourite ? 'heart' : 'heart-outline'}
              size={24}
              color={favourite ? c.danger : c.textDimmer}
            />
          </TouchableOpacity>
        </View>

        {/* Download button */}
        <TouchableOpacity
          style={[
            styles.downloadBtn,
            { borderColor: dlProgress?.status === 'error' ? c.dangerAlt : downloaded ? c.success : accent + '60' },
          ]}
          onPress={handleDownload}
          activeOpacity={0.75}
        >
          {dlProgress ? (
            <View style={styles.downloadProgressWrap}>
              <View style={styles.downloadProgressRow}>
                {dlProgress.status === 'fetching' ? (
                  <>
                    <ActivityIndicator size="small" color={accent} style={{ marginRight: 8 }} />
                    <Text style={[styles.downloadBtnText, { color: accent }]}>
                      Fetching audio links…
                    </Text>
                  </>
                ) : dlProgress.status === 'error' ? (
                  <>
                    <Ionicons name="alert-circle-outline" size={16} color={c.dangerAlt} style={{ marginRight: 6 }} />
                    <Text style={[styles.downloadBtnText, { color: c.dangerAlt }]}>
                      {dlProgress.totalParts === 0 ? 'No audio available' : 'Failed · Tap to retry'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={16} color={accent} style={{ marginRight: 6 }} />
                    <Text style={[styles.downloadBtnText, { color: accent }]}>
                      {dlProgress.totalParts > 1
                        ? `${dlProgress.partsDone}/${dlProgress.totalParts} parts · `
                        : ''}
                      {dlProgress.bytesTotal > 0
                        ? `${Math.round(dlProgress.bytesWritten / dlProgress.bytesTotal * 100)}%`
                        : 'Downloading…'}
                    </Text>
                  </>
                )}
              </View>
              {dlProgress.status === 'downloading' && dlProgress.bytesTotal > 0 && (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(dlProgress.bytesWritten / dlProgress.bytesTotal * 100)}%` as any,
                        backgroundColor: accent,
                      },
                    ]}
                  />
                </View>
              )}
            </View>
          ) : downloaded ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color={c.success} />
              <Text style={[styles.downloadBtnText, { color: c.success }]}>Downloaded · Tap to delete</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={18} color={accent} />
              <Text style={[styles.downloadBtnText, { color: accent }]}>Download for offline</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Slide-format video, when a channel has published one for this
            lecture. Sits beside Download because it is the other way to
            "watch" the lecture, and it deliberately says it needs a
            connection -- it cannot be taken offline like the audio can. */}
        {slideVideos.length > 0 && (
          <TouchableOpacity
            style={[styles.watchBtn, { borderColor: accent + '60' }]}
            onPress={() => setVideoSlidesOpen(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="tv-outline" size={18} color={accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.downloadBtnText, { color: accent, fontSize: 13 * fontScale }]}>
                Watch with slides
              </Text>
              <Text style={[styles.watchBtnSub, { fontSize: 11 * fontScale }]}>
                {slideVideos.length > 1
                  ? `${slideVideos.length} sources · needs a connection`
                  : `${slideVideos[0].channel}${
                      formatDuration(slideVideos[0].durationSec)
                        ? ' · ' + formatDuration(slideVideos[0].durationSec)
                        : ''
                    } · needs a connection`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tags */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <SectionLabel text="Tags" fontScale={fontScale} />
          <TouchableOpacity onPress={() => setTagManagerOpen(true)} style={styles.addTagBtn}>
            <Ionicons name="add" size={14} color="#FF7722" />
            <Text style={[styles.addTagText, { fontSize: 12 * fontScale }]}>Manage</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.tagsWrap}>
          {tags.length > 0 ? tags.map(tag => (
            <View key={tag} style={styles.tagChip}>
              <Text style={[styles.tagText, { fontSize: 13 * fontScale }]}>{tag}</Text>
            </View>
          )) : (
            <Text style={[styles.noTagsText, { fontSize: 13 * fontScale }]}>No tags — tap Manage to add</Text>
          )}
        </View>
      </View>

      </>)}

      {/* Audio & Transcript */}
      <View style={[styles.section, focusMode && styles.sectionFocus]}>
        {!focusMode && <SectionLabel text="Audio & Transcript" fontScale={fontScale} />}
        <TranscriptViewer
          ref={transcriptRef}
          lecture={recording as any}
          accentColor={accent}
          resumeMs={resumeMs}
          scrollRef={scrollRef}
          scrollYRef={scrollYRef}
          searchQuery={searchQuery}
          currentMatchIdx={currentMatchIdx}
          onMatchCountChange={setMatchCount}
          highlightEnabled={highlightEnabled}
          onWordLookup={handleWordLookup}
          focusMode={focusMode}
          wordLookupEnabled={wordLookupEnabled}
        />
      </View>

      {!focusMode && (<>
      {/* Details */}
      <View style={styles.section}>
        <SectionLabel text="Details" fontScale={fontScale} />
        <View style={styles.detailsCard}>
          <DetailRow icon="calendar-outline" label="Date" value={formattedDate} fontScale={fontScale} />
          <DetailRow icon="location-outline" label="Location" value={recording.location} fontScale={fontScale} />
          {recording.chapter && (
            <DetailRow icon="book-outline" label="Chapter" value={recording.chapter} fontScale={fontScale} />
          )}
          <DetailRow icon="time-outline" label="Year" value={String(recording.year)} fontScale={fontScale} last />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <SectionLabel text="More" fontScale={fontScale} />
        <View style={styles.actionsCard}>
          <ActionRow
            icon="globe-outline"
            label="Open on Vanisource"
            color={c.link}
            fontScale={fontScale}
            onPress={() => openBrowser(recording.vanisourceUrl)}
          />
          {recording.url && (
            <>
              <View style={styles.divider} />
              <ActionRow
                icon="volume-high-outline"
                label="Open Prabhupada Vani Player"
                color="#FF7722"
                fontScale={fontScale}
                onPress={() => openBrowser(recording.url!)}
              />
            </>
          )}
          <View style={styles.divider} />
          <ActionRow
            icon="share-social-outline"
            label="Share"
            color={c.textMuted}
            fontScale={fontScale}
            onPress={handleShare}
          />
        </View>
      </View>
      </>)}
    </ScrollView>

    {/* Pinned top bar — an absolutely-positioned sibling of the ScrollView
        rather than a child with stickyHeaderIndices. RN implements sticky
        headers by translating the child as you scroll, and on Fabric/Android
        the shadow-tree copy of that translation lags the visual one, so
        taps on the bar stop registering once it has moved. An overlay never
        moves, so its touch target is always where it is drawn. The
        ScrollView's paddingTop (topBarHeight) reserves the space it covers. */}
    {!focusMode && (
    <View style={styles.stickyTopBar}>
      <View style={styles.stickyTopRow} onLayout={(e) => setTopBarHeight(e.nativeEvent.layout.height)}>
        <TouchableOpacity
          onPress={handleSearchToggle}
          style={[styles.toolBtn, searchVisible && { backgroundColor: accent + '22', borderColor: accent }]}
          accessibilityLabel="Search transcript"
        >
          <Ionicons name="search" size={17} color={searchVisible ? accent : c.textMuted} />
        </TouchableOpacity>

        {isThisLoaded && (
          <TouchableOpacity
            onPress={() => togglePanel('audio')}
            style={[styles.toolBtn, styles.toolBtnWide, openPanel === 'audio' && { backgroundColor: accent + '22', borderColor: accent }]}
            accessibilityLabel="Audio controls"
          >
            <Ionicons
              name={audio.isPlaying ? 'pause-circle-outline' : 'play-circle-outline'}
              size={17}
              color={openPanel === 'audio' ? accent : c.textMuted}
            />
            <PinnedTimeReadout style={[styles.toolBtnText, openPanel === 'audio' && { color: accent }]} />
            <Ionicons name={openPanel === 'audio' ? 'chevron-up' : 'chevron-down'} size={13} color={c.textDim} />
          </TouchableOpacity>
        )}

        {isThisLoaded && (
          <TouchableOpacity
            onPress={() => togglePanel('speed')}
            style={[styles.toolBtn, styles.toolBtnWide, openPanel === 'speed' && { backgroundColor: accent + '22', borderColor: accent }]}
            accessibilityLabel="Playback speed"
          >
            <Text style={[styles.toolBtnText, { fontWeight: '700' }, openPanel === 'speed' && { color: accent }]}>
              {audio.speed}x
            </Text>
            <Ionicons name={openPanel === 'speed' ? 'chevron-up' : 'chevron-down'} size={13} color={c.textDim} />
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          onPress={() => setWordLookupEnabled(v => !v)}
          style={[styles.toolBtn, wordLookupEnabled && { backgroundColor: accent + '22', borderColor: accent }]}
          accessibilityLabel="Enable word meanings on long-press"
        >
          <Ionicons name="book-outline" size={17} color={wordLookupEnabled ? accent : c.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            // On but its control hidden: just show the control again.
            if (autoScrollOn && !controlVisible) { showControl(); return; }
            const next = !autoScrollOn;
            setAutoScrollOn(next);
            if (next) showControl(); else setControlVisible(false);
            // Following the spoken line would fight a constant-speed scroll.
            setHighlightEnabled(false);
          }}
          style={[styles.toolBtn, autoScrollOn && { backgroundColor: accent + '22', borderColor: accent }]}
          accessibilityLabel="Auto-scroll the transcript"
        >
          <Ionicons name="arrow-down-circle-outline" size={18} color={autoScrollOn ? accent : c.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { setHighlightEnabled(v => !v); setAutoScrollOn(false); }}
          style={[styles.toolBtn, highlightEnabled && { backgroundColor: accent + '22', borderColor: accent }]}
          accessibilityLabel="Follow the spoken line"
        >
          <Ionicons name="bookmark" size={17} color={highlightEnabled ? accent : c.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => toggleFocus(true)}
          style={styles.toolBtn}
          accessibilityLabel="Transcript only"
        >
          <Ionicons name="expand-outline" size={17} color={c.textMuted} />
        </TouchableOpacity>
      </View>

      {searchVisible && (
        <View style={styles.searchBarRow}>
          <Ionicons name="search-outline" size={15} color={c.textDim} style={{ marginLeft: 10 }} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search transcript…"
            placeholderTextColor={c.textFaint}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={goNextMatch}
          />
          {!!searchQuery && (
            <>
              <Text style={styles.matchCount}>
                {matchCount ? `${currentMatchIdx + 1}/${matchCount}` : '0'}
              </Text>
              <TouchableOpacity onPress={goPrevMatch} style={styles.searchNavBtn} disabled={!matchCount}>
                <Ionicons name="chevron-up" size={18} color={matchCount ? c.textQuinary : c.textFaintest} />
              </TouchableOpacity>
              <TouchableOpacity onPress={goNextMatch} style={styles.searchNavBtn} disabled={!matchCount}>
                <Ionicons name="chevron-down" size={18} color={matchCount ? c.textQuinary : c.textFaintest} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchNavBtn}>
                <Ionicons name="close" size={18} color={c.textDim} />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {openPanel === 'audio' && isThisLoaded && (
        <View style={styles.dropdown}>
          <AudioPlayer accentColor={accent} compact />
        </View>
      )}

      {openPanel === 'speed' && isThisLoaded && (
        <View style={[styles.dropdown, styles.speedDropdown]}>
          {SPEEDS.map(sp => (
            <TouchableOpacity
              key={sp}
              onPress={() => { audio.setSpeed(sp); setOpenPanel(null); }}
              style={[styles.speedChip, audio.speed === sp && { backgroundColor: accent + '22', borderColor: accent }]}
            >
              <Text style={[styles.speedChipText, audio.speed === sp && { color: accent }]}>{sp}x</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
    )}

    {/* Transcript-only mode: the single control left on screen is the way
        back out (Back / Esc also work). */}
    {focusMode && (
      <>
        <StatusBar hidden />
        <TouchableOpacity
          onPress={() => toggleFocus(false)}
          style={[styles.exitFocusBtn, { top: insets.top + 8 }]}
          accessibilityLabel="Exit transcript-only mode"
          hitSlop={8}
        >
          <Ionicons name="contract-outline" size={18} color={c.textMuted} />
        </TouchableOpacity>
      </>
    )}

    {autoScrollOn && controlVisible && (
      <AutoScrollControl
        level={autoSpeed.level}
        max={autoSpeed.max}
        onChange={(n) => { autoSpeed.setLevel(n); showControl(); }}
        onClose={() => { setAutoScrollOn(false); setControlVisible(false); }}
        waiting={!autoScrollRunning}
        accent={accent}
        bottom={insets.bottom + (audio.recording && !focusMode ? 156 : 20)}
      />
    )}

    <WordDefinitionSheet
      word={lookup?.word ?? null}
      sanskritFirst={lookup?.fromVerse}
      accentColor={accent}
      onClose={() => setLookup(null)}
    />

    <TagManager
      recordingId={rid}
      visible={tagManagerOpen}
      onClose={() => setTagManagerOpen(false)}
    />

    {slideVideos.length > 0 && (
      <VideoSlidesGate
        visible={videoSlidesOpen}
        onClose={() => setVideoSlidesOpen(false)}
        videos={slideVideos}
        accentColor={accent}
        useLivePosition={videoUseLivePosition}
      />
    )}
    </View>
  );
}

/**
 * Live time counter for the pinned bar. Extracted so it can subscribe to
 * useAudioPosition() (which ticks twice a second) without dragging the whole
 * LectureDetail render tree along with it — that was the source of the scroll
 * jank while audio was playing.
 */
function PinnedTimeReadout({ style }: { style: any }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { positionMs, durationMs } = useAudioPosition();
  return (
    <Text style={[styles.toolBtnText, style]} numberOfLines={1}>
      {formatMs(positionMs)} / {formatMs(durationMs)}
    </Text>
  );
}

/**
 * Only pays the position-subscription cost while the video-slides modal is
 * open — when it's closed, this component renders nothing and doesn't touch
 * useAudioPosition at all, so the parent lecture screen stays tick-free.
 */
function VideoSlidesGate(props: {
  visible: boolean; onClose: () => void; videos: ReturnType<typeof getYouTubeVideos>;
  accentColor: string; useLivePosition: boolean;
}) {
  if (!props.visible) return null;
  return <VideoSlidesGateOpen {...props} />;
}

function VideoSlidesGateOpen({
  visible, onClose, videos, accentColor, useLivePosition,
}: {
  visible: boolean; onClose: () => void; videos: ReturnType<typeof getYouTubeVideos>;
  accentColor: string; useLivePosition: boolean;
}) {
  const { positionMs } = useAudioPosition();
  const startSec = useLivePosition ? Math.floor(positionMs / 1000) : 0;
  return (
    <VideoSlidesView
      visible={visible}
      onClose={onClose}
      videos={videos}
      startSec={startSec}
      accentColor={accentColor}
    />
  );
}

function SectionLabel({ text, fontScale = 1 }: { text: string; fontScale?: number }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return <Text style={[styles.sectionLabel, { fontSize: 11 * fontScale }]}>{text}</Text>;
}

function MetaChip({ icon, text, fontScale = 1 }: { icon: string; text: string; fontScale?: number }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon as any} size={13} color={c.textDim} />
      <Text style={[styles.metaChipText, { fontSize: 12 * fontScale }]}>{text}</Text>
    </View>
  );
}

function DetailRow({ icon, label, value, last = false, fontScale = 1 }: {
  icon: string; label: string; value: string; last?: boolean; fontScale?: number;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[styles.detailRow, !last && styles.detailRowBorder]}>
      <Ionicons name={icon as any} size={16} color={c.textDimmer} style={{ marginRight: 10 }} />
      <Text style={[styles.detailLabel, { fontSize: 13 * fontScale }]}>{label}</Text>
      <Text style={[styles.detailValue, { fontSize: 14 * fontScale }]}>{value}</Text>
    </View>
  );
}

function ActionRow({ icon, label, color, onPress, fontScale = 1 }: {
  icon: string; label: string; color: string; onPress: () => void; fontScale?: number;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.actionLabel, { fontSize: 14 * fontScale }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
    </TouchableOpacity>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  container: { flex: 1, backgroundColor: c.bg },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { color: c.textDimmer, fontSize: 16 },

  stickyTopBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    // Above the ScrollView in both paint and hit-test order (Android orders
    // touch dispatch by zIndex too, so this is what keeps the bar tappable).
    zIndex: 20,
    backgroundColor: c.bg,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  stickyTopRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: 8,
  },
  toolBtn: {
    padding: 7, borderRadius: 8, borderWidth: 1, borderColor: c.borderStrong,
    alignItems: 'center', justifyContent: 'center', marginRight: 6,
    minHeight: 34,
  },
  toolBtnWide: { flexDirection: 'row', gap: 5, paddingHorizontal: 9 },
  toolBtnText: { color: c.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  dropdown: {
    backgroundColor: c.card,
    borderTopWidth: 1, borderTopColor: c.border,
    paddingHorizontal: 16, paddingVertical: 6,
    shadowColor: c.shadow, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  speedDropdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  speedChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: c.borderStrong, minWidth: 56, alignItems: 'center',
  },
  speedChipText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
  exitFocusBtn: {
    position: 'absolute', right: 12, zIndex: 20,
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.borderStrong,
    opacity: 0.85,
  },
  searchBarRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.card, minHeight: 44, paddingRight: 4,
  },
  searchInput: {
    flex: 1, color: c.textQuaternary, fontSize: 14, paddingHorizontal: 8, paddingVertical: 10,
    // The browser draws its own focus ring round a focused <input>; the row's
    // background already shows where you are typing.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
  },
  matchCount: { color: c.textDim, fontSize: 12, marginRight: 2 },
  // Icons alone are ~18px; padding brings the tappable box up toward the
  // ~44dp minimum comfortable touch target so up/down/close don't get
  // missed when they're packed tightly next to each other in this row.
  searchNavBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
  },

  hero: {
    padding: 20, paddingTop: 24,
    borderBottomWidth: 1,
    backgroundColor: c.surfaceAlt2,
    marginBottom: 8,
    gap: 0,
  },
  heroBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, marginBottom: 12,
  },
  heroBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  heroChapter: { color: c.textPrimary, fontSize: 28, fontWeight: '800', letterSpacing: 0.3, marginBottom: 6 },
  heroFull: { color: c.textDim, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  heroMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', flex: 1 },
  favBtn: { paddingLeft: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addTagBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addTagText: { color: '#FF7722', fontSize: 12, fontWeight: '600' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    backgroundColor: '#FF772218', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: '#FF772235',
  },
  tagText: { color: '#FF7722', fontSize: 13, fontWeight: '600' },
  noTagsText: { color: c.textFaint, fontSize: 13, fontStyle: 'italic' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.border, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  metaChipText: { color: c.textDim, fontSize: 12 },

  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  downloadBtnText: { fontSize: 13, fontWeight: '600' },
  watchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 10,
  },
  watchBtnSub: { color: c.textDim, fontSize: 11, marginTop: 2 },
  downloadProgressWrap: { gap: 8, flex: 1 },
  downloadProgressRow: { flexDirection: 'row', alignItems: 'center' },
  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden', width: 180,
  },
  progressFill: { height: 4, borderRadius: 2 },

  section: { marginHorizontal: 16, marginTop: 20 },
  sectionFocus: { marginTop: 36 },
  sectionLabel: {
    color: c.textFaint, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10,
  },
  detailsCard: { backgroundColor: c.card, borderRadius: 14, overflow: 'hidden' },
  detailRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
  detailLabel: { width: 80, color: c.textDimmer, fontSize: 13 },
  detailValue: { flex: 1, color: c.textQuinary, fontSize: 14, fontWeight: '500' },

  actionsCard: { backgroundColor: c.card, borderRadius: 14, overflow: 'hidden' },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, color: c.textQuinary, fontSize: 14, fontWeight: '500' },
  divider: { height: 1, backgroundColor: c.border, marginLeft: 64 },
});

// Windows desktop build (Electron over the web export): the wide-window
// layout. Phones get null here and keep the screen above unchanged.
export default function LectureDetailRoute() {
  return Desktop ? <Desktop.Lecture /> : <LectureDetail />;
}
