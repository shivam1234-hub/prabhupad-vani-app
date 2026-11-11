import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAudioMeta, useAudioPosition } from '../../contexts/AudioContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { useDownload } from '../../contexts/DownloadContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useHistory } from '../../contexts/HistoryContext';
import { getRecordingId, getTypeMeta, Recording } from '../../data/types';
import TranscriptViewer, { TranscriptViewerHandle } from '../TranscriptViewer';
import TagManager from '../TagManager';
import AudioPlayer from '../AudioPlayer';
import WordDefinitionSheet from '../WordDefinitionSheet';
import PresentationView from '../PresentationView';
import VideoSlidesView from '../VideoSlidesView';
import { useAutoScroll, useAutoScrollSpeed } from '../AutoScroll';
import { setFocusMode, useFocusMode } from '../../utils/focusMode';
import { audioEvents } from '../../utils/audioEvents';
import { upcomingInSection } from '../../utils/nextInSection';
import { hasScreens } from '../../data/screensManifest';
import { formatDuration, getYouTubeVideos } from '../../data/youtubeVideos';
import type { TranscriptData } from '../../hooks/useTranscript';
import { formatMs } from '../../utils/time';
import {
  Cover, Icon, TextSizeStepper, durationText, isInProgress, openCategory, openLecture,
} from './ui';
import { pageTitle } from './store';

const BOOKS = new Set(['Bhagavad-gita', 'Srimad-Bhagavatam', 'CC']);

/**
 * Desktop lecture page — two panes. Left: the transcript in a comfortable
 * reading column with find (↑/↓), follow-the-spoken-line, auto-scroll, text
 * size and focus mode; double-click a word for its meaning. Right: lecture
 * info, the player, parts, Watch with slides / Presentation mode, download,
 * tags, details, links and what comes next. Same behaviour as
 * app/lecture/[id].tsx, which phones keep using.
 */
export default function DesktopLecture() {
  const c = useThemeColors();
  const { id, resume } = useLocalSearchParams<{ id: string; resume?: string }>();
  const resumeMs = resume ? parseInt(resume, 10) : 0;
  const { getById } = useAllRecordings();
  const audio = useAudioMeta();
  const { readerFontScale: fontScale } = useSettings();
  const { historyMap } = useHistory();

  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const transcriptRef = useRef<TranscriptViewerHandle>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [autoScrollOn, setAutoScrollOn] = useState(false);
  const [lookup, setLookup] = useState<{ word: string; fromVerse: boolean } | null>(null);
  const [data, setData] = useState<TranscriptData | null>(null);

  const focusMode = useFocusMode();
  useEffect(() => () => setFocusMode(false), []);

  const recording = getById(id);
  const meta = recording ? getTypeMeta(recording.type) : null;
  const rid = recording ? getRecordingId(recording) : id;

  useEffect(() => {
    pageTitle.set(recording?.title ?? '');
    return () => pageTitle.set('');
  }, [recording?.title]);

  // Autoplay moved on to the next lecture: follow it.
  useEffect(() => audioEvents.onAutoAdvance(({ fromId, toId }) => {
    if (fromId === rid) router.replace(`/lecture/${toId}` as any);
  }), [rid]);

  // Esc leaves focus mode; Ctrl+F (from the shell) focuses find.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) setFocusMode(false);
    };
    const onFind = () => { searchInputRef.current?.focus(); searchInputRef.current?.select(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pv-find', onFind);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pv-find', onFind); };
  }, [focusMode]);

  // A new lecture in the same screen (autoplay replace) starts at the top.
  useEffect(() => {
    setSearchQuery(''); setMatchIdx(0); setData(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [id]);

  const goMatch = (dir: 1 | -1) => {
    if (!matchCount) return;
    const next = (matchIdx + dir + matchCount) % matchCount;
    setMatchIdx(next);
    transcriptRef.current?.jumpToMatch(next);
  };

  // Auto-scroll.
  const autoSpeed = useAutoScrollSpeed();
  const draggingRef = useRef(false);
  const maxYRef = useRef(0);
  const contentHRef = useRef(0);
  const viewHRef = useRef(0);
  const thisLoaded = !!recording && audio.lecture?.id === recording.id;
  const autoRunning = autoScrollOn && (!thisLoaded || audio.isPlaying);
  useAutoScroll({ scrollRef, scrollYRef, draggingRef, maxYRef, running: autoRunning, level: autoSpeed.level });
  const updateMaxY = () => { maxYRef.current = contentHRef.current - viewHRef.current; };

  const handleWordLookup = useCallback((word: string, fromVerse: boolean) => setLookup({ word, fromVerse }), []);

  if (!recording || !meta) {
    return (
      <div className="pv-page"><div className="pv-empty"><Icon name="alert-circle-outline" size={44} /><div className="pv-empty-title">Recording not found</div></div></div>
    );
  }
  const accent = meta.color;
  const entry = historyMap.get(rid);

  return (
    <div className={`pv-lecture ${focusMode ? 'focus' : ''}`} style={{ ['--tint' as any]: accent } as React.CSSProperties}>
      <div className="pv-lec-left">
        {!focusMode ? (
          <div className="pv-lec-toolbar">
            <label className="pv-tsearch">
              <Icon name="search" size={15} color={c.textDim} />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setMatchIdx(0); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'F3') { e.preventDefault(); goMatch(e.shiftKey ? -1 : 1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); goMatch(1); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); goMatch(-1); }
                  if (e.key === 'Escape') { setSearchQuery(''); (e.target as HTMLInputElement).blur(); }
                }}
                placeholder="Find in transcript  (Ctrl+F)"
                spellCheck={false}
              />
              {searchQuery ? (
                <>
                  <span className="pv-mc">{matchCount ? `${matchIdx + 1} / ${matchCount}` : 'No matches'}</span>
                  <button className="pv-icon-btn sm" onClick={() => goMatch(-1)} disabled={!matchCount} data-tip="Previous (Shift+Enter)" data-tip-pos="bottom"><Icon name="chevron-up" size={17} /></button>
                  <button className="pv-icon-btn sm" onClick={() => goMatch(1)} disabled={!matchCount} data-tip="Next (Enter)" data-tip-pos="bottom"><Icon name="chevron-down" size={17} /></button>
                  <button className="pv-icon-btn sm" onClick={() => setSearchQuery('')} data-tip="Clear" data-tip-pos="bottom"><Icon name="close" size={16} /></button>
                </>
              ) : null}
            </label>
            <span className="pv-tool-sep" />
            <button
              className={`pv-icon-btn ${highlightEnabled ? 'on' : ''}`}
              onClick={() => { setHighlightEnabled(v => !v); setAutoScrollOn(false); }}
              data-tip={highlightEnabled ? 'Following the spoken line' : 'Follow the spoken line'}
              data-tip-pos="bottom"
              aria-pressed={highlightEnabled}
            >
              <Icon name={highlightEnabled ? 'bookmark' : 'bookmark-outline'} size={17} color={highlightEnabled ? accent : undefined} />
            </button>
            {autoScrollOn ? (
              <span className="pv-auto">
                <button className="pv-icon-btn sm" onClick={() => setAutoScrollOn(false)} data-tip="Stop auto-scroll" data-tip-pos="bottom"><Icon name="arrow-down-circle" size={17} color={accent} /></button>
                <button className="pv-icon-btn sm" onClick={() => autoSpeed.setLevel(autoSpeed.level - 1)} disabled={autoSpeed.level <= 1} aria-label="Slower"><Icon name="remove" size={15} color={accent} /></button>
                <span style={{ minWidth: 56, textAlign: 'center' }}>{autoRunning ? `Speed ${autoSpeed.level}` : 'Waiting…'}</span>
                <button className="pv-icon-btn sm" onClick={() => autoSpeed.setLevel(autoSpeed.level + 1)} disabled={autoSpeed.level >= autoSpeed.max} aria-label="Faster"><Icon name="add" size={15} color={accent} /></button>
              </span>
            ) : (
              <button
                className="pv-icon-btn"
                onClick={() => { setAutoScrollOn(true); setHighlightEnabled(false); }}
                data-tip="Auto-scroll the transcript"
                data-tip-pos="bottom"
              >
                <Icon name="arrow-down-circle-outline" size={19} />
              </button>
            )}
            <span className="pv-tool-sep" />
            <TextSizeStepper compact />
            <span className="pv-hint" style={{ marginLeft: 6, padding: 8 }} data-tip="Double-click any word for its meaning" data-tip-pos="bottom"><Icon name="book-outline" size={17} color={c.textDim} /></span>
            <span style={{ flex: 1 }} />
            <button className="pv-btn sm" onClick={() => setFocusMode(true)} data-tip="Transcript only (Esc to leave)" data-tip-pos="bottom">
              <Icon name="expand-outline" size={15} /> Focus
            </button>
          </div>
        ) : (
          <button className="pv-btn sm pv-exit-focus" onClick={() => setFocusMode(false)} data-tip="Leave focus mode (Esc)" data-tip-pos="bottom">
            <Icon name="contract-outline" size={15} /> Exit focus
          </button>
        )}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80 }}
          onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          onContentSizeChange={(_w, h) => { contentHRef.current = h; updateMaxY(); }}
          onLayout={e => { viewHRef.current = e.nativeEvent.layout.height; updateMaxY(); }}
        >
          <View style={{ width: '100%', maxWidth: focusMode ? 820 : 780, alignSelf: 'center', paddingHorizontal: 40, paddingTop: focusMode ? 56 : 30 }}>
            {!focusMode ? (
              <div style={{ marginBottom: 26, paddingBottom: 20, borderBottom: `1px solid ${accent}40` }}>
                <span className="pv-badge" style={{ color: accent, background: accent + '20', border: `1px solid ${accent}55`, fontSize: 11 * fontScale }}>{meta.label}</span>
                <div style={{ fontSize: 30 * fontScale, fontWeight: 800, color: c.textPrimary, lineHeight: 1.2, marginTop: 10 }}>{recording.title}</div>
                {recording.fullTitle && recording.fullTitle !== recording.title ? (
                  <div style={{ fontSize: 14 * fontScale, color: c.textDim, marginTop: 6, lineHeight: 1.45 }}>{recording.fullTitle}</div>
                ) : null}
              </div>
            ) : null}
            <TranscriptViewer
              ref={transcriptRef}
              lecture={recording as any}
              accentColor={accent}
              resumeMs={resumeMs}
              scrollRef={scrollRef}
              scrollYRef={scrollYRef}
              searchQuery={searchQuery}
              currentMatchIdx={matchIdx}
              onMatchCountChange={setMatchCount}
              highlightEnabled={highlightEnabled}
              onWordLookup={handleWordLookup}
              focusMode={focusMode}
              desktop
              onData={setData}
            />
          </View>
        </ScrollView>
      </div>

      <aside className="pv-lec-side">
        <SidePane recording={recording} rid={rid} accent={accent} data={data} resumeEntryMs={isInProgress(entry) ? entry!.positionMs : 0} />
      </aside>

      <WordDefinitionSheet
        word={lookup?.word ?? null}
        sanskritFirst={lookup?.fromVerse}
        accentColor={accent}
        onClose={() => setLookup(null)}
      />
    </div>
  );
}

// ─── Right pane ─────────────────────────────────────────────────────────────

function SidePane({ recording, rid, accent, data, resumeEntryMs }: {
  recording: Recording; rid: string; accent: string; data: TranscriptData | null; resumeEntryMs: number;
}) {
  const c = useThemeColors();
  const audio = useAudioMeta();
  const { isDownloaded, getLocalUris, downloadRecording, deleteDownload, progress } = useDownload();
  const { isFavourite, toggleFavourite, getTagsFor } = useLibrary();
  const { readerFontScale: fs } = useSettings();
  const [tagOpen, setTagOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [presOpen, setPresOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const meta = getTypeMeta(recording.type);
  const downloaded = isDownloaded(rid);
  const dl = progress[rid];
  const fav = isFavourite(rid);
  const tags = getTagsFor(rid);
  const isLoaded = audio.lecture?.id === recording.id;
  const slideVideos = getYouTubeVideos(recording.pvId);
  const presAvailable = isLoaded && hasScreens(rid, audio.partIndex);
  const presExists = hasScreens(rid, 0) || hasScreens(rid, 1);
  const upcoming = useMemo(() => upcomingInSection(recording, 6), [recording]);
  const localUris = downloaded ? getLocalUris(rid) : undefined;
  const parts = data?.parts.filter(p => p.audioUrl) ?? [];
  const hasAudio = !!data?.audioUrls.length || !!localUris?.length;

  const formattedDate = (() => {
    if (!recording.date) return '';
    const d = new Date(recording.date + 'T00:00:00');
    if (isNaN(d.getTime())) return recording.date;
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  })();

  const start = async (partIdx = 0, seekMs = 0) => {
    const urls = data?.audioUrls.length ? data.audioUrls : localUris ?? [];
    if (!urls.length) return;
    setStarting(true);
    try {
      await audio.play(recording, urls, partIdx, localUris);
      if (seekMs > 0) setTimeout(() => audio.seek(seekMs), 700);
    } finally { setStarting(false); }
  };

  const handleDownload = () => {
    if (dl?.status === 'error') { downloadRecording(rid, recording.vanisourceUrl); return; }
    if (downloaded) {
      Alert.alert('Delete Download', 'Remove this recording from this computer?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(rid) },
      ]);
    } else if (!dl) downloadRecording(rid, recording.vanisourceUrl);
  };

  const copyLink = async () => {
    const url = recording.url ?? recording.vanisourceUrl;
    try { await navigator.clipboard.writeText(`${recording.fullTitle}\n${url}`); Alert.alert('Link copied', url); } catch {}
  };

  const book = BOOKS.has(recording.type);
  const dlPct = dl && dl.bytesTotal > 0 ? Math.round((dl.bytesWritten / dl.bytesTotal) * 100) : 0;

  return (
    <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ cursor: 'pointer', flex: 'none', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 22px rgba(0,0,0,.3)' }} onClick={() => openCategory(recording.type)} data-tip={`Open ${meta.label}`}>
          <Cover type={recording.type} w={book ? 84 : 96} h={book ? 126 : 96} radius={8} />
        </div>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="pv-badge" style={{ color: accent, background: accent + '22', alignSelf: 'flex-start' }}>{meta.badge}</span>
          <div style={{ fontWeight: 800, fontSize: 18 * fs, lineHeight: 1.25, color: c.textPrimary }}>{recording.title}</div>
          <div style={{ display: 'flex', gap: 12, color: c.textDim, fontSize: 12.5 * fs, flexWrap: 'wrap' }}>
            {recording.location ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="location-outline" size={13} color={c.textDim} />{recording.location}</span> : null}
            {recording.year ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="calendar-outline" size={13} color={c.textDim} />{recording.year}</span> : null}
            {durationText(recording) ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon name="time-outline" size={13} color={c.textDim} />{durationText(recording)}</span> : null}
          </div>
        </div>
        <button className="pv-icon-btn" onClick={() => toggleFavourite(rid)} data-tip={fav ? 'Remove from favourites' : 'Add to favourites'} data-tip-pos="bottom">
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? c.danger : c.textDimmer} />
        </button>
      </div>

      {/* Player */}
      <div className="pv-side-card" style={{ borderColor: accent + '40', padding: isLoaded ? '6px 14px 10px' : 16 }}>
        {isLoaded ? (
          <AudioPlayer accentColor={accent} />
        ) : !data && !localUris?.length ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: c.textDim, fontSize: 13 }}>
            <ActivityIndicator size="small" color={accent} /> Loading audio…
          </div>
        ) : !hasAudio ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: c.textDimmer, fontSize: 13 }}>
            <Icon name="musical-notes-outline" size={18} color={c.textDimmer} /> No audio available for this lecture
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="pv-btn primary" style={{ background: accent, borderColor: accent, height: 46, justifyContent: 'center', fontSize: 15 }} onClick={() => start(0, resumeEntryMs)} disabled={starting}>
              {starting ? <ActivityIndicator size="small" color={c.onAccent} /> : <Ionicons name="play" size={18} color={c.onAccent} />}
              {resumeEntryMs > 0 ? `Resume at ${formatMs(resumeEntryMs)}` : 'Play audio'}
            </button>
            {resumeEntryMs > 0 ? (
              <button className="pv-btn sm ghost" style={{ justifyContent: 'center' }} onClick={() => start(0)}>Play from the beginning</button>
            ) : null}
          </div>
        )}
      </div>

      {parts.length > 1 && !isLoaded ? (
        <div className="pv-side-card" style={{ padding: 10 }}>
          <div className="pv-side-label" style={{ padding: '4px 6px 0' }}>Parts · {parts.length}</div>
          {data!.parts.map((p, i) => p.audioUrl ? (
            <div key={i} className="pv-part" onClick={() => start(i)}>
              <Ionicons name="play-circle-outline" size={20} color={accent} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.title || `Part ${i + 1}`}</span>
            </div>
          ) : null)}
        </div>
      ) : null}

      {/* Watch / present / download */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slideVideos.length > 0 ? (
          <button className="pv-action" onClick={() => setVideoOpen(true)} style={{ borderColor: accent + '55' }}>
            <Icon name="tv-outline" size={20} color={accent} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pv-action-title" style={{ color: accent }}>Watch with slides</div>
              <div className="pv-action-sub">
                {slideVideos.length > 1
                  ? `${slideVideos.length} sources · needs a connection`
                  : `${slideVideos[0].channel}${formatDuration(slideVideos[0].durationSec) ? ' · ' + formatDuration(slideVideos[0].durationSec) : ''} · needs a connection`}
              </div>
            </div>
            <Icon name="chevron-forward" size={16} color={c.textFaint} />
          </button>
        ) : null}
        {presExists ? (
          <button className="pv-action" disabled={!presAvailable} onClick={() => setPresOpen(true)} style={{ opacity: presAvailable ? 1 : 0.6 }}>
            <Icon name="easel-outline" size={20} color={presAvailable ? accent : c.textDim} />
            <div style={{ flex: 1 }}>
              <div className="pv-action-title" style={{ color: presAvailable ? accent : undefined }}>Presentation mode</div>
              <div className="pv-action-sub">{presAvailable ? 'Slides in time with the audio, full window' : 'Start the audio to present it as slides'}</div>
            </div>
          </button>
        ) : null}
        <button className="pv-action" onClick={handleDownload} style={{ borderColor: dl?.status === 'error' ? c.dangerAlt : downloaded ? c.success + '88' : undefined }}>
          {dl ? (
            dl.status === 'fetching' ? <ActivityIndicator size="small" color={accent} />
              : dl.status === 'error' ? <Icon name="alert-circle-outline" size={20} color={c.dangerAlt} />
                : <Icon name="cloud-download-outline" size={20} color={accent} />
          ) : downloaded ? <Icon name="checkmark-circle" size={20} color={c.success} /> : <Icon name="cloud-download-outline" size={20} color={accent} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pv-action-title" style={{ color: dl?.status === 'error' ? c.dangerAlt : downloaded ? c.success : undefined }}>
              {dl ? (dl.status === 'fetching' ? 'Fetching audio links…' : dl.status === 'error' ? (dl.totalParts === 0 ? 'No audio available' : 'Download failed · click to retry')
                : `Downloading ${dl.totalParts > 1 ? `${dl.partsDone}/${dl.totalParts} parts · ` : ''}${dl.bytesTotal > 0 ? dlPct + '%' : ''}`)
                : downloaded ? 'Downloaded · click to delete' : 'Download for offline'}
            </div>
            {dl?.status === 'downloading' && dl.bytesTotal > 0 ? (
              <div className="pv-track" style={{ marginTop: 6 }}><div style={{ width: `${dlPct}%`, background: accent }} /></div>
            ) : <div className="pv-action-sub">{downloaded ? 'Audio and transcript are on this computer' : 'Audio + transcript, plays and reads offline'}</div>}
          </div>
        </button>
      </div>

      {/* Tags */}
      <div className="pv-side-card">
        <div className="pv-side-label">
          Tags
          <button className="pv-link" style={{ fontSize: 12 }} onClick={() => setTagOpen(true)}><Icon name="add" size={13} color={c.accent} /> Manage</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.length ? tags.map(t => <span key={t} className="pv-tag" style={{ fontSize: 12 * fs }}>{t}</span>)
            : <span style={{ color: c.textDim, fontSize: 12.5 * fs }}>No tags — click Manage to add</span>}
        </div>
      </div>

      {/* Details */}
      <div className="pv-side-card">
        <div className="pv-side-label">Details</div>
        {[
          ['Date', formattedDate],
          ['Location', recording.location],
          ['Chapter', recording.chapter],
          ['Year', recording.year ? String(recording.year) : ''],
          ['Length', durationText(recording)],
        ].filter(([, v]) => !!v).map(([k, v]) => (
          <div key={k} className="pv-detail" style={{ fontSize: 13 * fs }}><span>{k}</span><span>{v}</span></div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="pv-btn sm" onClick={() => window.open(recording.vanisourceUrl, '_blank')}><Icon name="globe-outline" size={14} color={c.link} /> Vanisource</button>
          {recording.url ? <button className="pv-btn sm" onClick={() => window.open(recording.url!, '_blank')}><Icon name="volume-high-outline" size={14} color={c.accent} /> PV player</button> : null}
          <button className="pv-btn sm" onClick={copyLink}><Icon name="link-outline" size={14} /> Copy link</button>
        </div>
      </div>

      {/* Next in collection */}
      {upcoming.length > 0 ? (
        <div className="pv-side-card" style={{ padding: 10 }}>
          <div className="pv-side-label" style={{ padding: '4px 6px 0' }}>Next in {meta.label}</div>
          {upcoming.map(r => (
            <div key={r.id} className="pv-upnext-row" onClick={() => openLecture(r.id)}>
              <Cover type={r.type} w={BOOKS.has(r.type) ? 26 : 34} h={34} radius={5} badge={false} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="pv-tile-title" style={{ WebkitLineClamp: 1, fontSize: 13 }}>{r.title}</div>
                <div className="pv-tile-meta" style={{ fontSize: 11.5 }}>{[r.location, r.year, durationText(r)].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <TagManager recordingId={rid} visible={tagOpen} onClose={() => setTagOpen(false)} />
      {presOpen ? (
        <PresentationView visible={presOpen} onClose={() => setPresOpen(false)} recordingId={rid} accentColor={accent} />
      ) : null}
      {videoOpen && slideVideos.length > 0 ? (
        <VideoGate
          videos={slideVideos}
          accent={accent}
          useLive={audio.recording?.id === recording.id && audio.partIndex === 0}
          onClose={() => setVideoOpen(false)}
        />
      ) : null}
    </>
  );
}

function VideoGate({ videos, accent, useLive, onClose }: {
  videos: ReturnType<typeof getYouTubeVideos>; accent: string; useLive: boolean; onClose: () => void;
}) {
  const { positionMs } = useAudioPosition();
  const [startSec] = useState(() => (useLive ? Math.floor(positionMs / 1000) : 0));
  return <VideoSlidesView visible onClose={onClose} videos={videos} startSec={startSec} accentColor={accent} />;
}

