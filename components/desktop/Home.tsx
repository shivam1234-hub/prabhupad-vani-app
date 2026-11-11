import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useHistory, HistoryEntry } from '../../contexts/HistoryContext';
import { useAudioMeta, useAudioPosition } from '../../contexts/AudioContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { getRecordingId, getTypeMeta, Recording } from '../../data/types';
import { upcomingInSection } from '../../utils/nextInSection';
import { formatMs, formatRelativeTime } from '../../utils/time';
import {
  Cover, Empty, Icon, Page, PageHead, SectionHead, durationText, isCompleted, isInProgress,
  openCategory, openLecture, ratioOf, usePlayRecording,
} from './ui';

const RECENT_LIMIT = 12;
const CONTINUE_LIMIT = 12;
const BOOKS = new Set(['Bhagavad-gita', 'Srimad-Bhagavatam', 'CC']);

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Hare Krishna · Good night';
  if (h < 12) return 'Hare Krishna · Good morning';
  if (h < 17) return 'Hare Krishna · Good afternoon';
  return 'Hare Krishna · Good evening';
}

/**
 * Desktop Home — same content and rules as app/(tabs)/index.tsx: the live
 * player (or the newest unfinished lecture), today's unfinished lectures, and
 * recently played. No collections here (the user removed them from Home).
 */
export default function DesktopHome() {
  const c = useThemeColors();
  const { history } = useHistory();
  const { getById, all } = useAllRecordings();
  const audio = useAudioMeta();

  const nowId = audio.lecture ? getRecordingId(audio.lecture) : null;
  const inProgress = useMemo(() => history.filter(isInProgress), [history]);
  const resumeHero = !audio.lecture ? inProgress[0] : undefined;
  const continueList = inProgress
    .filter(e => isToday(e.playedAt) && e.id !== nowId && e !== resumeHero)
    .slice(0, CONTINUE_LIMIT);
  const shown = new Set([nowId, resumeHero?.id, ...continueList.map(e => e.id)]);
  const recentList = history.filter(e => !shown.has(e.id)).slice(0, RECENT_LIMIT);
  const isEmpty = history.length === 0 && !audio.lecture;

  return (
    <Page>
      <PageHead
        eyebrow={greeting()}
        title="Prabhupada Vani"
        sub={`Your listening · ${all.length.toLocaleString('en-IN')} lectures with transcripts`}
        right={
          <>
            <button className="pv-btn" onClick={() => router.navigate('/browse' as any)}>
              <Icon name="search" size={16} /> Search lectures
            </button>
            <button className="pv-btn tint" onClick={() => router.navigate('/by-length' as any)}>
              <Icon name="hourglass-outline" size={16} color={c.accent} /> Find by length
            </button>
          </>
        }
      />

      {audio.lecture ? (
        <NowPlayingHero />
      ) : resumeHero ? (
        <ResumeHero entry={resumeHero} recording={getById(resumeHero.id)} />
      ) : null}

      {continueList.length > 0 && (
        <div className="pv-section">
          <SectionHead title="Continue listening" tag="Today" count={continueList.length} />
          <div className="pv-grid" style={{ ['--min' as any]: '260px' } as React.CSSProperties}>
            {continueList.map(e => <LectureTile key={e.id} entry={e} recording={getById(e.id)} />)}
          </div>
        </div>
      )}

      {recentList.length > 0 && (
        <div className="pv-section">
          <SectionHead title="Recently played" action="See all history" onAction={() => router.navigate('/history' as any)} />
          <div className="pv-grid" style={{ ['--min' as any]: '260px' } as React.CSSProperties}>
            {recentList.map(e => <LectureTile key={e.id} entry={e} recording={getById(e.id)} />)}
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="pv-card" style={{ marginTop: 10 }}>
          <Empty
            icon="headset"
            title="Start listening"
            text="Lectures you play will appear here, so you can pick up exactly where you left off."
          >
            <button className="pv-btn primary" onClick={() => router.navigate('/library' as any)}>
              <Icon name="library" size={16} color={c.onAccent} /> Browse the library
            </button>
            <button className="pv-btn" onClick={() => router.navigate('/browse' as any)}>
              <Icon name="search" size={16} /> Search lectures
            </button>
          </Empty>
        </div>
      )}
    </Page>
  );
}

function HeroFrame({ type, children, side }: { type: string; children: React.ReactNode; side?: React.ReactNode }) {
  const meta = getTypeMeta(type);
  const book = BOOKS.has(type);
  return (
    <div className="pv-hero" style={{ borderColor: meta.color + '55' }}>
      <div className="pv-hero-glow" style={{ top: -120, right: 120, width: 360, height: 360, background: meta.color + '1c' }} />
      <div className="pv-hero-glow" style={{ bottom: -160, left: -80, width: 320, height: 320, background: meta.color + '10' }} />
      <div className="pv-hero-cover" onClick={() => openCategory(type)} data-tip={`Open ${meta.label}`}>
        <Cover type={type} w={book ? 150 : 180} h={book ? 225 : 180} radius={12} />
      </div>
      <div className="pv-hero-body">{children}</div>
      {side}
    </div>
  );
}

function NowPlayingHero() {
  const c = useThemeColors();
  const audio = useAudioMeta();
  const lec = audio.lecture!;
  const meta = getTypeMeta(lec.type);
  const upcoming = useMemo(() => upcomingInSection(lec, 4), [lec]);
  return (
    <HeroFrame type={lec.type} side={upcoming.length ? <UpNext list={upcoming} label={`Up next in ${meta.label}`} /> : null}>
      <div className="pv-hero-label">
        <span style={{ width: 8, height: 8, borderRadius: 4, background: audio.isPlaying ? c.success : c.textFaint }} />
        {audio.isPlaying ? 'Now playing' : 'Paused'}
        <span className="pv-badge" style={{ color: meta.color, background: meta.color + '26' }}>{meta.badge}</span>
      </div>
      <div className="pv-hero-title" onClick={() => router.push(`/lecture/${lec.id}` as any)}>{lec.title}</div>
      <div className="pv-hero-meta">{[lec.location, lec.year, lec.fullTitle !== lec.title ? lec.fullTitle : null].filter(Boolean).join(' · ')}</div>
      <LiveProgress color={meta.color} />
      <div className="pv-hero-actions">
        <button
          className="pv-play-xl"
          style={{ background: meta.color }}
          onClick={() => (audio.isPlaying ? audio.pause() : audio.resume())}
          aria-label={audio.isPlaying ? 'Pause' : 'Play'}
        >
          <Ionicons name={audio.isPlaying ? 'pause' : 'play'} size={26} color={c.onAccent} style={{ marginLeft: audio.isPlaying ? 0 : 3 }} />
        </button>
        <button className="pv-btn" onClick={() => router.push(`/lecture/${lec.id}` as any)}>
          <Icon name="reader-outline" size={16} /> Open transcript
        </button>
        <button className="pv-btn ghost" onClick={() => openCategory(lec.type)}>
          <Icon name="albums-outline" size={16} /> {meta.label}
        </button>
      </div>
    </HeroFrame>
  );
}

function LiveProgress({ color }: { color: string }) {
  const { positionMs, durationMs } = useAudioPosition();
  const pct = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxWidth: 640 }}>
      <div className="pv-track" style={{ height: 6 }}><div style={{ width: `${pct * 100}%`, background: color }} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--textDim)', fontWeight: 600 }} className="pv-tnum">
        <span>{formatMs(positionMs)}</span>
        <span>{durationMs > 0 ? `−${formatMs(Math.max(durationMs - positionMs, 0))}` : ''}</span>
      </div>
    </div>
  );
}

function ResumeHero({ entry, recording }: { entry: HistoryEntry; recording?: Recording }) {
  const c = useThemeColors();
  const meta = getTypeMeta(entry.type);
  const pct = Math.min(ratioOf(entry), 0.99);
  const remaining = entry.durationMs > 0 ? entry.durationMs - entry.positionMs : 0;
  const { play, busy } = usePlayRecording();
  const upcoming = useMemo(() => (recording ? upcomingInSection(recording, 4) : []), [recording]);
  return (
    <HeroFrame type={entry.type} side={upcoming.length ? <UpNext list={upcoming} label="Next in this collection" /> : null}>
      <div className="pv-hero-label">
        <Ionicons name="play-back-circle-outline" size={15} color={c.accent} />
        Pick up where you left off
        <span className="pv-badge" style={{ color: meta.color, background: meta.color + '26' }}>{meta.badge}</span>
      </div>
      <div className="pv-hero-title" onClick={() => openLecture(entry.id, entry)}>{entry.title}</div>
      <div className="pv-hero-meta">
        {[recording?.location, recording?.year, formatRelativeTime(entry.playedAt)].filter(Boolean).join(' · ')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxWidth: 640 }}>
        <div className="pv-track" style={{ height: 6 }}><div style={{ width: `${pct * 100}%`, background: meta.color }} /></div>
        <div className="pv-tnum" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--textDim)', fontWeight: 600 }}>
          <span>{formatMs(entry.positionMs)}</span>
          <span>{remaining > 0 ? `${formatMs(remaining)} left` : ''}</span>
        </div>
      </div>
      <div className="pv-hero-actions">
        <button
          className="pv-play-xl"
          style={{ background: meta.color }}
          onClick={() => recording && play(recording, entry)}
          aria-label="Resume"
          data-tip={`Resume at ${formatMs(entry.positionMs)}`}
        >
          {busy ? <Icon name="ellipsis-horizontal" size={24} color={c.onAccent} />
            : <Ionicons name="play" size={26} color={c.onAccent} style={{ marginLeft: 3 }} />}
        </button>
        <button className="pv-btn" onClick={() => openLecture(entry.id, entry)}>
          <Icon name="reader-outline" size={16} /> Open with transcript
        </button>
      </div>
    </HeroFrame>
  );
}

function UpNext({ list, label }: { list: Recording[]; label: string }) {
  return (
    <div className="pv-upnext">
      <div className="pv-side-label" style={{ marginBottom: 4 }}>{label}</div>
      {list.map(r => (
        <div key={r.id} className="pv-upnext-row" onClick={() => openLecture(r.id)}>
          <Cover type={r.type} w={BOOKS.has(r.type) ? 30 : 40} h={40} radius={6} badge={false} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="pv-tile-title" style={{ WebkitLineClamp: 1, fontSize: 13.5 }}>{r.title}</div>
            <div className="pv-tile-meta">{[r.location, r.year, durationText(r)].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LectureTile({ entry, recording }: { entry: HistoryEntry; recording?: Recording }) {
  const c = useThemeColors();
  const meta = getTypeMeta(entry.type);
  const audio = useAudioMeta();
  const { play } = usePlayRecording();
  const done = isCompleted(entry);
  const going = isInProgress(entry);
  const pct = Math.min(ratioOf(entry), 0.99);
  const remaining = entry.durationMs > 0 ? entry.durationMs - entry.positionMs : 0;
  const isThis = !!audio.recording && getRecordingId(audio.recording) === entry.id;
  return (
    <div className="pv-tile" onClick={() => openLecture(entry.id, entry)} title={recording?.fullTitle ?? entry.title}>
      <div className="pv-tile-top">
        <Cover type={entry.type} w={BOOKS.has(entry.type) ? 48 : 64} h={64} radius={8} badge={false} />
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="pv-badge" style={{ color: meta.color, background: meta.color + '22', alignSelf: 'flex-start' }}>{meta.badge}</span>
          <div className="pv-tile-title">{entry.title}</div>
        </div>
      </div>
      <div className="pv-tile-meta">
        {[recording?.location, recording?.year, formatRelativeTime(entry.playedAt)].filter(Boolean).join(' · ')}
      </div>
      {going ? (
        <>
          <div className="pv-track" style={{ marginRight: 52 }}><div style={{ width: `${pct * 100}%`, background: meta.color }} /></div>
          <div style={{ fontSize: 12, color: 'var(--textMuted)', fontWeight: 600 }}>
            {remaining > 0 ? `${formatMs(remaining)} left` : `At ${formatMs(entry.positionMs)}`}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 600, color: done ? c.success : 'var(--textDim)', display: 'flex', alignItems: 'center', gap: 5 }}>
          {done ? <><Ionicons name="checkmark-circle" size={14} color={c.success} /> Watched</> : (recording ? durationText(recording) : '')}
        </div>
      )}
      <button
        className="pv-tile-play"
        style={{ background: meta.color }}
        onClick={e => { e.stopPropagation(); if (recording) play(recording, entry); }}
        aria-label={isThis && audio.isPlaying ? 'Pause' : 'Play'}
      >
        <Ionicons name={isThis && audio.isPlaying ? 'pause' : 'play'} size={18} color={c.onAccent} style={{ marginLeft: isThis && audio.isPlaying ? 0 : 2 }} />
      </button>
    </div>
  );
}
