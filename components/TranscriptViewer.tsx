import React, {
  useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle,
} from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import { Lecture, getRecordingId } from '../data/types';
import { useTranscript, TranscriptData } from '../hooks/useTranscript';
import { useAudioMeta, useAudioPosition } from '../contexts/AudioContext';
import { useDownload } from '../contexts/DownloadContext';
import { useSettings } from '../contexts/SettingsContext';
import { hasScreens } from '../data/screensManifest';
import { READER_FONT_FAMILY } from '../utils/readerFont';
import AudioPlayer from './AudioPlayer';
import PresentationView from './PresentationView';

interface Props {
  lecture: Lecture;
  accentColor: string;
  resumeMs?: number;
  scrollRef?: React.RefObject<ScrollView | null>;
  /** Live-updated current scroll offset of `scrollRef`'s ScrollView (see
   * app/lecture/[id].tsx's onScroll), used by jumpToLine to compute an
   * absolute target offset without relying on cross-component measureLayout. */
  scrollYRef?: React.RefObject<number>;
  /** Search query, owned by the parent screen so the search bar can be rendered
   * as a sticky element outside this component (see lecture/[id].tsx). */
  searchQuery?: string;
  currentMatchIdx?: number;
  onMatchCountChange?: (count: number) => void;
  /** "Now playing" line highlight toggle, owned by the parent screen so its
   * button can live in the sticky header (see lecture/[id].tsx). Off by
   * default. */
  highlightEnabled?: boolean;
  /** Called with the word the reader long-pressed (native) or double-clicked
   * (web/desktop), to show its offline meaning. */
  onWordLookup?: (word: string, fromVerse: boolean) => void;
  /** Transcript-only reading mode: hides the player, toolbar and play buttons
   * so nothing but the text is left. */
  focusMode?: boolean;
  /** Owner (LectureDetail) drives this via a pinned toolbar toggle. When
   * false (default) the transcript renders one <Text> per line for maximum
   * scroll perf. When true, each word gets its own long-pressable <Text> —
   * costs thousands of extra native nodes on a typical lecture, so it's the
   * reader's explicit opt-in. Off = fast; on = word lookup works. */
  wordLookupEnabled?: boolean;
  /** Desktop two-pane lecture page: the player, presentation button and
   * "Play Audio" button live in the side pane, so this renders the text
   * (with its per-part play buttons) only. Off on phones. */
  desktop?: boolean;
  /** Hands the loaded transcript (parts + audio URLs) to the owner. */
  onData?: (data: TranscriptData | null) => void;
}

export interface TranscriptViewerHandle {
  jumpToMatch: (idx: number) => void;
  /** The first line still visible below window y `topY`, and its window y.
   * With measureLine, lets the screen keep the reader's place when the chrome
   * around the text appears or disappears. */
  captureAnchor: (topY: number) => Promise<{ key: string; y: number } | null>;
  measureLine: (key: string) => Promise<number | null>;
}

type LineType = 'header' | 'sloka' | 'bullet' | 'body' | 'spacer';

interface FlatLine {
  key: string;
  globalIdx: number;
  partIdx: number;
  type: LineType;
  text: string;
  speakerName?: string;
  speakerRest?: string;
}

// Strip IAST diacritics (ā ī ū ṛ ṝ ḷ ḹ ṃ ḥ ṅ ñ ṭ ḍ ṇ ś ṣ, …) so searching the
// plain-ASCII spelling ("dhrtarastra") also matches the transcript's accented
// spelling ("dhṛtarāṣṭra"). Normalized per-character (not on the whole string)
// so the result stays the same length as the input — every accented Latin
// letter here decomposes to exactly one base letter plus combining marks, so
// indices found in the normalized string still line up with the original text.
function normalizeForSearch(s: string): string {
  return Array.from(s)
    .map(ch => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .join('')
    .toLowerCase();
}

// Every keystroke used to re-normalize every transcript line's text (a
// 5000-line lecture \u00d7 per-character NFD normalization = a real hitch on the
// keyboard). Cache per input string \u2014 line text is stable, so a second visit
// is a Map lookup instead of Array.from + NFD across the whole line.
const normalizedCache = new Map<string, string>();
function normalizeCached(s: string): string {
  let v = normalizedCache.get(s);
  if (v === undefined) {
    v = normalizeForSearch(s);
    if (normalizedCache.size > 20000) normalizedCache.clear();
    normalizedCache.set(s, v);
  }
  return v;
}

function buildFlatLines(text: string, partIdx: number, offset: number): FlatLine[] {
  return text.split('\n').map((line, i): FlatLine => {
    const trimmed = line.trim();
    const key = `${partIdx}-${i}`;
    const globalIdx = offset + i;
    if (!trimmed) return { key, globalIdx, partIdx, type: 'spacer', text: '' };
    if (/^──.+──$/.test(trimmed)) {
      return { key, globalIdx, partIdx, type: 'header', text: trimmed.replace(/^──\s*/, '').replace(/\s*──$/, '') };
    }
    if (line.startsWith('   ') || line.startsWith('\t')) {
      return { key, globalIdx, partIdx, type: 'sloka', text: trimmed };
    }
    if (trimmed.startsWith('•')) {
      return { key, globalIdx, partIdx, type: 'bullet', text: trimmed };
    }
    const m = trimmed.match(/^([A-Z][a-zA-Z]*(?:\s[A-Z][a-zA-Z]*)?(?:\s*\([^)]+\))?)\s*:\s*/);
    if (m) {
      return {
        key, globalIdx, partIdx, type: 'body', text: trimmed,
        speakerName: m[1], speakerRest: trimmed.slice(m[0].length),
      };
    }
    return { key, globalIdx, partIdx, type: 'body', text: trimmed };
  });
}

function matchRanges(text: string, query: string): [number, number][] {
  if (!query) return [];
  const q = normalizeForSearch(query);
  if (!q) return [];
  const lower = normalizeCached(text);
  const out: [number, number][] = [];
  let idx = lower.indexOf(q);
  while (idx !== -1) {
    out.push([idx, idx + query.length]);
    idx = lower.indexOf(q, idx + query.length);
  }
  return out;
}

/** text[from, to) with the search-match parts wrapped in highlight spans. */
function highlightSpan(
  text: string, from: number, to: number, ranges: [number, number][], hlStyle: any,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let pos = from;
  for (const [s, e] of ranges) {
    if (e <= pos) continue;
    if (s >= to) break;
    const a = Math.max(s, pos);
    const b = Math.min(e, to);
    if (a > pos) out.push(text.slice(pos, a));
    out.push(<Text key={a} style={hlStyle}>{text.slice(a, b)}</Text>);
    pos = b;
  }
  if (pos < to) out.push(text.slice(pos, to));
  return out;
}

const HAS_LETTER = /\p{L}/u;

/**
 * One line of transcript text, with search matches highlighted and, when
 * `onWord` is given, every word its own long-pressable span.
 *
 * Per-word spans are native-only: RN has no API for "which character was
 * touched", so a word has to be its own nested <Text> to know it was the one
 * pressed. On web the browser's own double-click word selection does that job
 * for free (see the dblclick listener in TranscriptViewer), so web keeps the
 * cheaper one-span-per-line rendering.
 */
function RichText({
  text, query, style, prefixNode, onWord, hlStyle,
}: {
  text: string; query: string; style: any; prefixNode?: React.ReactNode;
  onWord?: (word: string) => void; hlStyle: any;
}) {
  const ranges = matchRanges(text, query);
  if (!onWord) {
    return <Text style={style}>{prefixNode}{highlightSpan(text, 0, text.length, ranges, hlStyle)}</Text>;
  }
  const parts: React.ReactNode[] = [];
  const wordRe = /\S+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) parts.push(...highlightSpan(text, last, start, ranges, hlStyle));
    const token = m[0];
    if (HAS_LETTER.test(token)) {
      parts.push(
        <Text key={`w${start}`} onLongPress={() => onWord(token)} suppressHighlighting>
          {highlightSpan(text, start, end, ranges, hlStyle)}
        </Text>,
      );
    } else {
      parts.push(...highlightSpan(text, start, end, ranges, hlStyle));
    }
    last = end;
  }
  if (last < text.length) parts.push(...highlightSpan(text, last, text.length, ranges, hlStyle));
  return <Text style={style}>{prefixNode}{parts}</Text>;
}

interface LineProps {
  line: FlatLine;
  query: string;
  fontSize: number;
  isAudioActive: boolean;
  isCurrentMatch: boolean;
  isAnyMatch: boolean;
  onWord?: (word: string, fromVerse: boolean) => void;
  setLineRef: (key: string, r: View | null) => void;
  styles: ReturnType<typeof makeStyles>;
  fmtStyles: ReturnType<typeof makeFmtStyles>;
}

// Memoized because TranscriptViewer re-renders on every audio progress tick
// (~500ms); with a span per word, re-rendering every line each tick would be
// thousands of components. Now only lines whose highlight actually changed do.
const TranscriptLine = React.memo(function TranscriptLine({
  line, query, fontSize, isAudioActive, isCurrentMatch, isAnyMatch,
  onWord, setLineRef, styles, fmtStyles,
}: LineProps) {
  const hl = styles.searchHighlight;
  const isVerse = line.type === 'sloka';
  const onLineWord = useMemo(
    () => (onWord ? (w: string) => onWord(w, isVerse) : undefined),
    [onWord, isVerse],
  );
  return (
    <View
      ref={(r: View | null) => setLineRef(line.key, r)}
      // Web: lets the dblclick handler tell a verse word from prose.
      {...(isVerse ? ({ dataSet: { sloka: '1' } } as any) : null)}
      style={[
        styles.lineWrap,
        isAudioActive && styles.audioHighlightBg,
        isCurrentMatch && styles.currentMatchBg,
        !isCurrentMatch && isAnyMatch && styles.anyMatchBg,
      ]}
    >
      {line.type === 'header' && (
        <RichText
          text={line.text}
          query={query}
          hlStyle={hl}
          onWord={onLineWord}
          style={[fmtStyles.header, { fontSize: Math.max(10, fontSize - 2) }]}
        />
      )}
      {line.type === 'sloka' && (
        <RichText
          text={line.text}
          query={query}
          hlStyle={hl}
          onWord={onLineWord}
          style={[fmtStyles.sloka, { fontSize, lineHeight: fontSize * 1.7 }]}
        />
      )}
      {line.type === 'bullet' && (
        <RichText
          text={line.text}
          query={query}
          hlStyle={hl}
          onWord={onLineWord}
          style={[fmtStyles.bullet, { fontSize, lineHeight: fontSize * 1.6 }]}
        />
      )}
      {line.type === 'body' && (
        <RichText
          text={line.speakerName ? (line.speakerRest ?? '') : line.text}
          query={query}
          hlStyle={hl}
          onWord={onLineWord}
          style={[fmtStyles.body, { fontSize, lineHeight: fontSize * 1.85 }]}
          prefixNode={
            line.speakerName
              ? <Text style={[fmtStyles.speaker, { fontSize }]}>{line.speakerName}: </Text>
              : undefined
          }
        />
      )}
    </View>
  );
});

const TranscriptViewer = forwardRef<TranscriptViewerHandle, Props>(function TranscriptViewer({
  lecture, accentColor, resumeMs = 0, scrollRef, scrollYRef,
  searchQuery = '', currentMatchIdx = 0,
  onMatchCountChange, highlightEnabled = false,
  onWordLookup, focusMode = false, wordLookupEnabled = false,
  desktop = false, onData,
}, ref) {
  const c = useThemeColors();
  const fmtStyles = useMemo(() => makeFmtStyles(c), [c]);
  const styles = useMemo(() => makeStyles(c), [c]);
  const { loading, data, error, fetchTranscript } = useTranscript();
  // Meta only — the transcript screen must never re-render on the 2 Hz
  // position tick. The follow-along highlight is handled by a child observer
  // (AudioFollowObserver) that mounts only when highlightEnabled is on, so
  // when the reader hasn't opted into follow-along, this component sees zero
  // audio-related re-renders.
  const audio = useAudioMeta();
  const { isDownloaded, getLocalUris } = useDownload();
  const { readerFontSize: fontSize } = useSettings();
  const [activePartIdx, setActivePartIdx] = useState(0);
  const didResume = useRef(false);

  const [presentationVisible, setPresentationVisible] = useState(false);

  const lineRefs = useRef<Map<string, View>>(new Map());
  const setLineRef = useCallback((key: string, r: View | null) => {
    if (r) lineRefs.current.set(key, r);
    else lineRefs.current.delete(key);
  }, []);

  // Web/desktop: double-clicking a word makes the browser select exactly that
  // word, so read the selection instead of rendering a span per word.
  const bodyRef = useRef<View>(null);
  const onWordLookupRef = useRef(onWordLookup);
  onWordLookupRef.current = onWordLookup;

  const recordingId = getRecordingId(lecture);
  const localUris = isDownloaded(recordingId) ? getLocalUris(recordingId) : undefined;
  const isThisLecturePlaying = audio.lecture?.id === lecture.id;

  useEffect(() => {
    fetchTranscript(lecture.vanisourceUrl, recordingId);
  }, [lecture.vanisourceUrl, recordingId]);

  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  useEffect(() => { onDataRef.current?.(data); }, [data]);

  useEffect(() => {
    if (!data || resumeMs <= 0 || didResume.current || isThisLecturePlaying) return;
    didResume.current = true;
    const urls = data.audioUrls;
    if (!urls.length) return;
    audio.play(lecture, urls, 0, localUris).then(() => {
      setTimeout(() => audio.seek(resumeMs), 800);
    });
  }, [data, resumeMs]);

  // Build flat line array, grouped by part
  const linesByPart = useMemo(() => {
    if (!data) return [];
    const result: FlatLine[][] = [];
    let offset = 0;
    data.parts.forEach((part, partIdx) => {
      const lines = buildFlatLines(part.text, partIdx, offset);
      result.push(lines);
      offset += lines.length;
    });
    return result;
  }, [data]);

  const allLines = useMemo(() => linesByPart.flat(), [linesByPart]);

  // Search matches (list of globalIdx values). Uses the cached normalizer so
  // consecutive keystrokes hit a Map instead of re-running NFD across every
  // line — that was what made typing in the search box feel laggy.
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = normalizeForSearch(searchQuery);
    return allLines
      .filter(l => l.type !== 'spacer' && normalizeCached(l.text).includes(q))
      .map(l => l.globalIdx);
  }, [allLines, searchQuery]);

  useEffect(() => {
    onMatchCountChange?.(searchMatches.length);
  }, [searchMatches.length, onMatchCountChange]);

  // Proportional audio highlight — distributes duration across lines by char
  // count. The value is state so it can be pushed here from the observer
  // child; TranscriptViewer never subscribes to position itself, so it
  // re-renders only when this idx actually changes (roughly once every N
  // seconds as playback crosses a line boundary), not every tick.
  const [audioActiveGlobalIdx, setAudioActiveGlobalIdx] = useState(-1);
  const textLines = useMemo(
    () => allLines.filter(l => l.type !== 'spacer' && l.text.length > 0),
    [allLines],
  );
  // Reset when the follow-along toggle switches off or playback moves to a
  // different lecture — otherwise a stale highlight sticks on screen.
  useEffect(() => {
    if (!highlightEnabled || !isThisLecturePlaying) setAudioActiveGlobalIdx(-1);
  }, [highlightEnabled, isThisLecturePlaying]);

  const jumpToLine = useCallback((key: string) => {
    const ref = lineRefs.current.get(key) as any;
    const scrollView = scrollRef?.current as any;
    if (!ref || !scrollView) return;
    try {
      // Use measure() (absolute window coordinates) instead of measureLayout()
      // (position relative to another ref). measureLayout requires the
      // "relative to" ref to satisfy a strict `instanceof ReactFabricHostComponent`
      // check on the New Architecture (Fabric, enabled via newArchEnabled=true) —
      // ScrollView's exposed ref is a native host node with extra methods
      // Object.assign-ed onto it, and in practice that combination doesn't always
      // pass the check on real devices, so measureLayout silently no-ops (neither
      // onSuccess nor onFail fires) with only a dev-only console.error. measure()
      // has no such cross-ref requirement, so it's reliable on Fabric, the old
      // architecture, and web alike.
      ref.measure((_x: number, _y: number, _w: number, _h: number, _pageX: number, pageY: number) => {
        scrollView.measure((_sx: number, _sy: number, _sw: number, _sh: number, _spageX: number, scrollPageY: number) => {
          const currentOffset = scrollYRef?.current ?? 0;
          const targetY = currentOffset + (pageY - scrollPageY) - 120;
          scrollView.scrollTo({ y: Math.max(0, targetY), animated: true });
        });
      });
    } catch {}
  }, [scrollRef, scrollYRef]);

  const prevAudioLine = useRef(-1);

  // Switching the toggle ON is itself a "take me to the highlight" gesture,
  // so jump straight away instead of waiting for the effect below. That one
  // only fires when playback crosses into a *different* line, which can be
  // many seconds away — and never, if audio is paused or the toggle is
  // switched off and back on without the line changing in between.
  useEffect(() => {
    if (!highlightEnabled) {
      // Playback keeps advancing while the highlight is off, so forget the
      // last followed line — otherwise re-enabling on the same line would be
      // treated as "no change" by the follow effect.
      prevAudioLine.current = -1;
      return;
    }
    // -1 means there is nothing to jump to yet (no audio loaded for this
    // lecture, or duration not known). The follow effect picks it up once
    // playback starts.
    if (audioActiveGlobalIdx < 0) return;
    prevAudioLine.current = audioActiveGlobalIdx;
    const line = allLines[audioActiveGlobalIdx];
    if (line) jumpToLine(line.key);
  }, [highlightEnabled]);

  // Auto-scroll to the audio-highlighted line as it advances — opt-in via the
  // bookmark toggle (highlightEnabled), off by default. Suppressed while a
  // search is active so it doesn't fight the user's manual arrow-driven jumps.
  useEffect(() => {
    if (!highlightEnabled || searchQuery) return;
    if (audioActiveGlobalIdx < 0 || audioActiveGlobalIdx === prevAudioLine.current) return;
    prevAudioLine.current = audioActiveGlobalIdx;
    const line = allLines[audioActiveGlobalIdx];
    if (line) jumpToLine(line.key);
  }, [audioActiveGlobalIdx, allLines, jumpToLine, searchQuery, highlightEnabled]);

  const jumpToMatch = useCallback((idx: number) => {
    if (!searchMatches.length) return;
    const globalIdx = searchMatches[idx];
    const line = allLines[globalIdx];
    if (line) jumpToLine(line.key);
  }, [searchMatches, allLines, jumpToLine]);

  const measureKey = useCallback((key: string) => new Promise<{ y: number; h: number } | null>(res => {
    const node = lineRefs.current.get(key) as any;
    if (!node) return res(null);
    node.measure((_x: number, _y: number, _w: number, h: number, _px: number, pageY: number) => res({ y: pageY, h }));
  }), []);

  useImperativeHandle(ref, () => ({
    jumpToMatch,
    captureAnchor: async (topY) => {
      // Lines are laid out in order, so binary-search the first one whose
      // bottom is below topY: ~12 measures instead of one per line.
      const keys = allLines.filter(l => l.type !== 'spacer').map(l => l.key);
      let lo = 0, hi = keys.length - 1, found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const m = await measureKey(keys[mid]);
        if (!m) return null;
        if (m.y + m.h > topY) { found = mid; hi = mid - 1; } else lo = mid + 1;
      }
      if (found < 0) return null;
      const m = await measureKey(keys[found]);
      return m ? { key: keys[found], y: m.y } : null;
    },
    measureLine: async (key) => (await measureKey(key))?.y ?? null,
  }), [jumpToMatch, allLines, measureKey]);

  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

  // Per-word <Text onLongPress> wrappers (native word-lookup) are expensive:
  // a typical lecture wraps thousands of words, and each nested Text is a
  // real native view + gesture handler. That inflates the view tree ~15x,
  // which slows every subsequent scroll for the life of the screen — timer-
  // based deferrals just moved the hit around instead of removing it.
  // The reader opts in via LectureDetail's pinned toolbar; when off (default)
  // this stays undefined and the transcript renders one <Text> per line.
  const nativeWordLookup = Platform.OS === 'web' || !wordLookupEnabled ? undefined : onWordLookup;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = bodyRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onDblClick = () => {
      const sel = window.getSelection();
      const word = sel?.toString().trim();
      if (!word || !HAS_LETTER.test(word)) return;
      const fromVerse = !!sel?.anchorNode?.parentElement?.closest('[data-sloka]');
      sel?.removeAllRanges();
      onWordLookupRef.current?.(word, fromVerse);
    };
    node.addEventListener('dblclick', onDblClick);
    return () => node.removeEventListener('dblclick', onDblClick);
  }, [data]);

  const handlePlayPart = (partIdx: number) => {
    if (!data) return;
    const urls = data.audioUrls;
    if (!urls.length) return;
    if (isThisLecturePlaying) {
      audio.playPart(partIdx);
    } else {
      audio.play(lecture, urls, partIdx, localUris);
    }
    setActivePartIdx(partIdx);
  };

  // The audio is right there on disk — a slow or failing network-only
  // transcript fetch should never block playback of a downloaded lecture, and
  // shouldn't even hide the play button behind a spinner. Whenever we've
  // downloaded the audio but don't yet have (or can't get) the transcript,
  // show a play-only card immediately.
  const hasLocalAudio = !!localUris && localUris.length > 0;
  if (!data && hasLocalAudio) {
    return (
      <View style={styles.container}>
        {desktop ? null : isThisLecturePlaying && !focusMode ? (
          <View style={[styles.playerCard, { borderColor: accentColor + '33' }]}>
            <AudioPlayer accentColor={accentColor} />
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.playAllBtn, { backgroundColor: accentColor }]}
            onPress={() => audio.play(lecture, localUris!, 0, localUris)}
          >
            <Ionicons name="play" size={18} color={c.textPrimary} />
            <Text style={styles.playAllText}>Play Audio</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.noAudioBox, { marginTop: 12 }]}>
          {loading ? (
            <>
              <ActivityIndicator size="small" color={c.textDimmer} />
              <Text style={styles.noAudioText}>Loading transcript…</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-offline-outline" size={20} color={c.textDimmer} />
              <Text style={styles.noAudioText}>
                Transcript unavailable{error ? ' — offline' : ''}. Audio plays from your device.
              </Text>
            </>
          )}
        </View>
        {error && !loading && (
          <TouchableOpacity style={[styles.retryBtn, { alignSelf: 'flex-start', marginTop: 10 }]} onPress={() => fetchTranscript(lecture.vanisourceUrl, recordingId)}>
            <Text style={[styles.retryText, { color: accentColor }]}>Retry loading transcript</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centeredBox}>
        <ActivityIndicator color={accentColor} size="large" />
        <Text style={styles.loadingText}>Loading transcript…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredBox}>
        <Ionicons name="warning-outline" size={32} color={c.dangerAlt} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchTranscript(lecture.vanisourceUrl, recordingId)}>
          <Text style={[styles.retryText, { color: accentColor }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data) return null;

  const hasAudio = data.audioUrls.length > 0;

  return (
    <View style={styles.container}>
      {/* Audio Player */}
      {hasAudio && isThisLecturePlaying && !focusMode && !desktop && (
        <View style={[styles.playerCard, { borderColor: accentColor + '33' }]}>
          <AudioPlayer accentColor={accentColor} />
        </View>
      )}

      <PresentationView
        visible={presentationVisible}
        onClose={() => setPresentationVisible(false)}
        recordingId={recordingId}
        accentColor={accentColor}
      />

      {highlightEnabled && isThisLecturePlaying && (
        <AudioFollowObserver textLines={textLines} onIdxChange={setAudioActiveGlobalIdx} />
      )}

      {!hasAudio && !focusMode && (
        <View style={styles.noAudioBox}>
          <Ionicons name="musical-notes-outline" size={20} color={c.textDimmer} />
          <Text style={styles.noAudioText}>No audio available for this lecture</Text>
        </View>
      )}

      {/* Toolbar: presentation mode. Search moved to the screen's pinned bar
          (lecture/[id].tsx) so it stays reachable while scrolling. */}
      {!focusMode && !desktop && isThisLecturePlaying && hasScreens(recordingId, audio.partIndex) && (
        <View style={styles.toolbar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => setPresentationVisible(true)}
            style={styles.toolBtn}
          >
            <Ionicons name="tv-outline" size={17} color={c.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Parts */}
      <View ref={bodyRef}>
      {data.parts.map((part, partIdx) => (
        <View key={partIdx} style={styles.partSection}>
          <View style={styles.partHeader}>
            <Text style={[styles.partTitle, { color: accentColor }]}>{part.title}</Text>
            {part.audioUrl && !focusMode && (
              <TouchableOpacity
                style={[
                  styles.partPlayBtn,
                  { borderColor: accentColor },
                  isThisLecturePlaying && audio.partIndex === partIdx && { backgroundColor: accentColor },
                ]}
                onPress={() => handlePlayPart(partIdx)}
              >
                <Ionicons
                  name={isThisLecturePlaying && audio.partIndex === partIdx && audio.isPlaying ? 'pause' : 'play'}
                  size={14}
                  color={isThisLecturePlaying && audio.partIndex === partIdx ? c.textPrimary : accentColor}
                />
              </TouchableOpacity>
            )}
          </View>

          <View style={{ gap: 2 }}>
            {linesByPart[partIdx]?.map((line) => {
              if (line.type === 'spacer') return <View key={line.key} style={{ height: 6 }} />;
              const isCurrentMatch = searchMatches[currentMatchIdx] === line.globalIdx;
              return (
                <TranscriptLine
                  key={line.key}
                  line={line}
                  query={searchQuery}
                  fontSize={fontSize}
                  isAudioActive={line.globalIdx === audioActiveGlobalIdx}
                  isCurrentMatch={isCurrentMatch}
                  isAnyMatch={searchMatchSet.has(line.globalIdx)}
                  onWord={nativeWordLookup}
                  setLineRef={setLineRef}
                  styles={styles}
                  fmtStyles={fmtStyles}
                />
              );
            })}
          </View>
        </View>
      ))}
      </View>

      {hasAudio && !isThisLecturePlaying && !focusMode && !desktop && (
        <TouchableOpacity
          style={[styles.playAllBtn, { backgroundColor: accentColor }]}
          onPress={() => handlePlayPart(0)}
        >
          <Ionicons name="play" size={18} color={c.textPrimary} />
          <Text style={styles.playAllText}>Play Audio</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default TranscriptViewer;

/**
 * Mounted only while the reader has follow-along ON and audio is playing.
 * Subscribes to useAudioPosition so IT re-renders on every position tick, but
 * it returns null and does no view work — the only side effect is calling
 * onIdxChange when playback crosses into a new line. TranscriptViewer itself
 * does not tick, so the transcript body isn't rebuilt twice a second.
 */
function AudioFollowObserver({
  textLines, onIdxChange,
}: {
  textLines: FlatLine[];
  onIdxChange: (idx: number) => void;
}) {
  const { positionMs, durationMs } = useAudioPosition();
  const prevIdx = useRef(-1);
  useEffect(() => {
    if (durationMs <= 0 || textLines.length === 0) return;
    const ratio = Math.min(positionMs / durationMs, 0.9999);
    let totalChars = 0;
    for (const l of textLines) totalChars += l.text.length;
    if (totalChars === 0) return;
    let cum = 0;
    let idx = textLines[textLines.length - 1].globalIdx;
    for (const line of textLines) {
      const start = cum / totalChars;
      const end = start + line.text.length / totalChars;
      if (ratio >= start && ratio < end) { idx = line.globalIdx; break; }
      cum += line.text.length;
    }
    if (idx !== prevIdx.current) {
      prevIdx.current = idx;
      onIdxChange(idx);
    }
  }, [positionMs, durationMs, textLines, onIdxChange]);
  return null;
}

const makeFmtStyles = (c: ThemeColors) => StyleSheet.create({
  header: {
    color: c.headerGold,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  sloka: {
    color: c.gold,
    fontStyle: 'italic',
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: c.goldBorder,
    marginVertical: 2,
  },
  bullet: {
    color: c.textBullet,
  },
  speaker: {
    color: c.speaker,
    fontWeight: '700',
  },
  body: {
    color: c.textBody,
    fontFamily: READER_FONT_FAMILY as any,
  },
});

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { gap: 0 },
  centeredBox: { alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { color: c.textDim, fontSize: 14 },
  errorText: { color: c.dangerAlt, fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: c.textFaintest },
  retryText: { fontSize: 14, fontWeight: '600' },
  playerCard: {
    backgroundColor: c.card, borderRadius: 16, borderWidth: 1,
    padding: 16, marginBottom: 20,
  },
  noAudioBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, backgroundColor: c.surfaceSunken, borderRadius: 10, marginBottom: 16,
  },
  noAudioText: { color: c.textDimmer, fontSize: 13 },
  partSection: { marginBottom: 24 },
  partHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  partTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  partPlayBtn: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  playAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 8,
  },
  playAllText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },

  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, marginBottom: 10,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.border,
  },
  toolBtn: {
    padding: 7, borderRadius: 8, borderWidth: 1, borderColor: c.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },

  lineWrap: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 },
  audioHighlightBg: { backgroundColor: c.elevatedAlt3 },
  currentMatchBg: { backgroundColor: c.warnBg },
  anyMatchBg: { backgroundColor: c.warnBgDim },
  searchHighlight: { backgroundColor: c.highlightBg, color: c.highlightText },
});
