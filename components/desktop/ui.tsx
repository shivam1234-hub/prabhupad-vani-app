import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAudioMeta } from '../../contexts/AudioContext';
import { useDownload } from '../../contexts/DownloadContext';
import { HistoryEntry } from '../../contexts/HistoryContext';
import { useSettings } from '../../contexts/SettingsContext';
import { getRecordingId, getTypeMeta, Recording } from '../../data/types';
import { fetchAudioUrls } from '../../utils/audioUrls';
import { durationSec, formatDuration } from '../../utils/durations';
import { formatMs } from '../../utils/time';
import { COVERS } from '../TypeThumb';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  const c = useThemeColors();
  return <Ionicons name={name as IconName} size={size} color={color ?? c.textMuted} />;
}

// ─── Watch status (same thresholds as components/WatchBadge.tsx) ────────────

export const COMPLETED_RATIO = 0.92;
// SettingsContext's exported min/max are phone pt sizes; on a wide window the
// base is 17pt, so the stepper's ends are 17 × the smallest/largest scale.
const READER_FONT_SIZE_MIN_WIDE = Math.round(17 * 0.85);
const READER_FONT_SIZE_MAX_WIDE = Math.round(17 * 1.5);
export const MIN_RESUMABLE_MS = 5000;

export function ratioOf(e: HistoryEntry) {
  return e.durationMs > 0 ? e.positionMs / e.durationMs : 0;
}
export function isInProgress(e?: HistoryEntry) {
  return !!e && e.positionMs >= MIN_RESUMABLE_MS && ratioOf(e) < COMPLETED_RATIO;
}
export function isCompleted(e?: HistoryEntry) {
  return !!e && e.positionMs >= MIN_RESUMABLE_MS && ratioOf(e) >= COMPLETED_RATIO;
}

/** Open a lecture, resuming where it was left (same rule as the phone lists). */
export function openLecture(id: string, entry?: HistoryEntry) {
  const resume = isInProgress(entry) ? `?resume=${entry!.positionMs}` : '';
  router.push(`/lecture/${id}${resume}` as any);
}

export function openCategory(type: string) {
  router.push(`/category/${type}` as any);
}

// ─── Covers ─────────────────────────────────────────────────────────────────

/**
 * Book cover for BG/SB/CC (portrait), else a coloured tile with the
 * collection's icon and badge. `w`×`h` in px.
 */
export function Cover({ type, w, h, radius = 10, badge = true }: {
  type: string; w: number; h: number; radius?: number; badge?: boolean;
}) {
  const meta = getTypeMeta(type);
  const src = COVERS[type];
  if (src) {
    return (
      <Image
        source={src}
        style={{ width: w, height: h, borderRadius: radius }}
        resizeMode="cover"
      />
    );
  }
  return (
    <div
      style={{
        width: w, height: h, borderRadius: radius, flex: 'none',
        background: `linear-gradient(145deg, ${meta.color}38, ${meta.color}12)`,
        border: `1px solid ${meta.color}40`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}
    >
      <Ionicons name={meta.icon as IconName} size={Math.round(Math.min(w, h) * 0.38)} color={meta.color} />
      {badge && Math.min(w, h) >= 56 ? (
        <span style={{ color: meta.color, fontSize: 10, fontWeight: 800, letterSpacing: 0.6 }}>{meta.badge}</span>
      ) : null}
    </div>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const meta = getTypeMeta(type);
  return (
    <span className="pv-badge" style={{ color: meta.color, background: meta.color + '22' }}>{meta.badge}</span>
  );
}

// ─── Playback helper ────────────────────────────────────────────────────────

/** Start a recording straight from a list (downloaded copy if there is one). */
export function usePlayRecording() {
  const audio = useAudioMeta();
  const { getLocalUris } = useDownload();
  const [busy, setBusy] = useState<string | null>(null);
  const play = useCallback(async (rec: Recording, entry?: HistoryEntry) => {
    const id = getRecordingId(rec);
    const isThis = audio.recording && getRecordingId(audio.recording) === id;
    if (isThis) {
      if (audio.isPlaying) audio.pause(); else audio.resume();
      return;
    }
    setBusy(rec.id);
    try {
      const local = getLocalUris(id);
      const urls = local.length ? local : await fetchAudioUrls(rec.vanisourceUrl);
      if (!urls.length) return;
      await audio.play(rec, urls, 0, local.length ? local : undefined);
      if (isInProgress(entry)) setTimeout(() => audio.seek(entry!.positionMs), 700);
    } catch {
      // Network failure: leave it; the lecture page shows the real error.
    } finally {
      setBusy(null);
    }
  }, [audio, getLocalUris]);
  return { play, busy };
}

// ─── Small cells ────────────────────────────────────────────────────────────

export function ProgressCell({ entry, color }: { entry?: HistoryEntry; color: string }) {
  const c = useThemeColors();
  if (!entry || entry.positionMs < MIN_RESUMABLE_MS) return <span style={{ color: c.textFaintest }}>—</span>;
  if (isCompleted(entry)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: c.success, fontWeight: 700, fontSize: 12.5 }}>
        <Ionicons name="checkmark-circle" size={15} color={c.success} /> Watched
      </span>
    );
  }
  const pct = Math.min(ratioOf(entry), 0.99) * 100;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      <span style={{ color, fontWeight: 700, fontSize: 12.5 }}>Resume {formatMs(entry.positionMs)}</span>
      <span className="pv-track" style={{ display: 'block', maxWidth: 110 }}>
        <div style={{ width: `${pct}%`, background: color }} />
      </span>
    </span>
  );
}

export function DownloadCell({ rec, accent }: { rec: Recording; accent: string }) {
  const c = useThemeColors();
  const { isDownloaded, progress, downloadRecording, deleteDownload } = useDownload();
  const id = getRecordingId(rec);
  const p = progress[id];
  const done = isDownloaded(id);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (p) {
    if (p.status === 'fetching') {
      return <span className="pv-dl" data-tip="Fetching audio links"><ActivityIndicator size="small" color={accent} /></span>;
    }
    if (p.status === 'error') {
      return (
        <button className="pv-dl" data-tip="Failed — retry" onClick={e => { stop(e); downloadRecording(id, rec.vanisourceUrl); }}>
          <Ionicons name="alert-circle-outline" size={18} color={c.dangerAlt} />
        </button>
      );
    }
    const pct = p.bytesTotal > 0 ? Math.round((p.bytesWritten / p.bytesTotal) * 100) : 0;
    return (
      <span className="pv-dl" style={{ flexDirection: 'column', gap: 3 }} data-tip={p.totalParts > 1 ? `${p.partsDone}/${p.totalParts} parts` : 'Downloading'}>
        <span style={{ color: accent, fontSize: 10.5, fontWeight: 800 }}>{pct}%</span>
        <span className="pv-track" style={{ display: 'block', width: 34, height: 3 }}><div style={{ width: `${pct}%`, background: accent }} /></span>
      </span>
    );
  }
  if (done) {
    return (
      <button
        className="pv-dl"
        data-tip="Downloaded — click to delete"
        onClick={e => {
          stop(e);
          Alert.alert('Delete download', `Remove "${rec.title}" from this computer?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(id) },
          ]);
        }}
      >
        <Ionicons name="checkmark-circle" size={19} color={c.success} />
      </button>
    );
  }
  return (
    <button className="pv-dl" data-tip="Download for offline" onClick={e => { stop(e); downloadRecording(id, rec.vanisourceUrl); }}>
      <Ionicons name="arrow-down-circle-outline" size={19} color={c.textDim} />
    </button>
  );
}

export function durationText(rec: Recording): string {
  const s = durationSec(rec);
  return s ? formatDuration(s) : '';
}

export function formatDate(date: string): string {
  if (!date || date.endsWith('-00-00')) return date?.slice(0, 4) ?? '';
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Lecture table ──────────────────────────────────────────────────────────

export type SortKey = 'sequence' | 'title' | 'place' | 'date' | 'duration';
export interface SortState { key: SortKey; dir: 1 | -1 }

export function sortRows(list: Recording[], sort: SortState, sequence: (l: Recording[]) => Recording[]) {
  if (sort.key === 'sequence') {
    const s = sequence(list);
    return sort.dir === 1 ? s : s.reverse();
  }
  const key = (r: Recording): string | number => {
    switch (sort.key) {
      case 'title': return r.title.toLowerCase();
      case 'place': return (r.location || '').toLowerCase();
      case 'date': return r.date || '';
      case 'duration': return durationSec(r) ?? -1;
    }
    return 0;
  };
  return [...list].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * sort.dir;
  });
}

export function LectureTable({
  rows, historyMap, sort, onSort, recentId, showType, showFav, isFav, onToggleFav,
  tint, numbered = true, scrollToRecent, getTags, extraCol,
}: {
  rows: Recording[];
  historyMap: Map<string, HistoryEntry>;
  sort?: SortState;
  onSort?: (key: SortKey) => void;
  recentId?: string;
  showType?: boolean;
  showFav?: boolean;
  isFav?: (id: string) => boolean;
  onToggleFav?: (id: string) => void;
  tint?: string;
  numbered?: boolean;
  scrollToRecent?: boolean;
  getTags?: (id: string) => string[];
  extraCol?: { title: string; width: number; render: (r: Recording) => React.ReactNode };
}) {
  const c = useThemeColors();
  const audio = useAudioMeta();
  const { play, busy } = usePlayRecording();
  const playingId = audio.recording ? getRecordingId(audio.recording) : null;
  const recentRef = useRef<HTMLTableRowElement | null>(null);
  const didScroll = useRef(false);

  // Opening a collection jumps to the lecture last played in it (as on mobile).
  useEffect(() => {
    if (!scrollToRecent || didScroll.current || !recentRef.current) return;
    didScroll.current = true;
    const el = recentRef.current;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  }, [scrollToRecent, recentId, rows]);

  const th = (key: SortKey | null, label: string, cls = '', style?: React.CSSProperties) => {
    const sorted = !!sort && !!key && sort.key === key;
    return (
      <th
        className={`${key && onSort ? 'sortable' : ''} ${sorted ? 'sorted' : ''} ${cls}`}
        style={style}
        onClick={key && onSort ? () => onSort(key) : undefined}
      >
        {label}
        {sorted ? <span style={{ marginLeft: 4 }}>{sort!.dir === 1 ? '▲' : '▼'}</span> : null}
      </th>
    );
  };

  return (
    <table className="pv-table" style={tint ? ({ ['--tint' as any]: tint } as React.CSSProperties) : undefined}>
      <colgroup>
        <col style={{ width: 56 }} />
        {showType ? <col style={{ width: 70 }} /> : null}
        <col />
        <col className="pv-col-place" style={{ width: '17%' }} />
        <col style={{ width: 120 }} />
        <col className="pv-col-dur" style={{ width: 86 }} />
        {extraCol ? <col style={{ width: extraCol.width }} /> : null}
        <col style={{ width: 150 }} />
        {showFav ? <col style={{ width: 46 }} /> : null}
        <col style={{ width: 56 }} />
      </colgroup>
      <thead>
        <tr>
          {th(numbered ? 'sequence' : null, '#', '', { textAlign: 'center' })}
          {showType ? th(null, 'Type') : null}
          {th('title', 'Title')}
          {th('place', 'Place', 'pv-col-place')}
          {th('date', 'Date')}
          {th('duration', 'Length', 'pv-col-dur')}
          {extraCol ? th(null, extraCol.title) : null}
          {th(null, 'Progress')}
          {showFav ? th(null, '') : null}
          {th(null, '', '', { textAlign: 'center' })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const id = getRecordingId(r);
          const meta = getTypeMeta(r.type);
          const entry = historyMap.get(id);
          const isRecent = recentId === id;
          const isPlayingRow = playingId === id;
          const tags = getTags?.(id) ?? [];
          return (
            <tr
              key={r.id + ':' + i}
              ref={isRecent ? recentRef : undefined}
              className={`${isRecent ? 'recent' : ''} ${isPlayingRow ? 'playing' : ''}`}
              style={!tint ? ({ ['--tint' as any]: meta.color } as React.CSSProperties) : undefined}
              onClick={() => openLecture(r.id, entry)}
              title={r.fullTitle || r.title}
            >
              <td className="pv-cell-num">
                <span className="pv-num">{i + 1}</span>
                <button
                  className="pv-row-play"
                  style={{ background: meta.color, display: undefined }}
                  aria-label={isPlayingRow && audio.isPlaying ? 'Pause' : 'Play'}
                  onClick={e => { e.stopPropagation(); play(r, entry); }}
                >
                  {busy === r.id
                    ? <ActivityIndicator size="small" color={c.onAccent} />
                    : <Ionicons name={isPlayingRow && audio.isPlaying ? 'pause' : 'play'} size={14} color={c.onAccent} style={{ marginLeft: isPlayingRow && audio.isPlaying ? 0 : 2 }} />}
                </button>
              </td>
              {showType ? <td><TypeBadge type={r.type} /></td> : null}
              <td className="pv-cell-title">
                {isRecent ? (
                  <span className="pv-recent-pill" style={{ color: meta.color, display: 'flex' }}>
                    <Ionicons name="return-down-forward" size={11} color={meta.color} /> Continue where you left off
                  </span>
                ) : null}
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                {tags.length ? (
                  <span className="pv-sub">{tags.slice(0, 4).map(t => `#${t}`).join('  ')}</span>
                ) : r.fullTitle && r.fullTitle !== r.title ? (
                  <span className="pv-sub">{r.fullTitle}</span>
                ) : null}
              </td>
              <td className="pv-col-place">{r.location}</td>
              <td className="pv-tnum">{formatDate(r.date)}</td>
              <td className="pv-col-dur pv-tnum">{durationText(r)}</td>
              {extraCol ? <td>{extraCol.render(r)}</td> : null}
              <td><ProgressCell entry={entry} color={meta.color} /></td>
              {showFav ? (
                <td className="pv-td-icon">
                  <button
                    className={`pv-dl pv-row-fav ${isFav?.(id) ? 'on' : ''}`}
                    data-tip={isFav?.(id) ? 'Remove from favourites' : 'Add to favourites'}
                    onClick={e => { e.stopPropagation(); onToggleFav?.(id); }}
                  >
                    <Ionicons name={isFav?.(id) ? 'heart' : 'heart-outline'} size={17} color={isFav?.(id) ? c.danger : c.textDim} />
                  </button>
                </td>
              ) : null}
              <td className="pv-td-icon"><DownloadCell rec={r} accent={meta.color} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Page scaffolding ──────────────────────────────────────────────────────

export function Page({ children, inner = true, pageRef }: {
  children: React.ReactNode; inner?: boolean; pageRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div className="pv-page" ref={pageRef}>
      {inner ? <div className="pv-page-inner">{children}</div> : children}
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, right }: {
  eyebrow?: string; title: string; sub?: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div className="pv-page-head">
      <div className="pv-grow">
        {eyebrow ? <div className="pv-h-eyebrow">{eyebrow}</div> : null}
        <div className="pv-h-title">{title}</div>
        {sub ? <div className="pv-h-sub">{sub}</div> : null}
      </div>
      {right ? <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div> : null}
    </div>
  );
}

export function SectionHead({ title, tag, count, action, onAction }: {
  title: string; tag?: string; count?: number; action?: string; onAction?: () => void;
}) {
  const c = useThemeColors();
  return (
    <div className="pv-section-head">
      <div className="pv-section-title">{title}</div>
      {tag ? <div className="pv-section-tag">{tag}</div> : null}
      {count ? <div className="pv-count">{count}</div> : null}
      {action ? (
        <button className="pv-link" onClick={onAction}>
          {action} <Ionicons name="chevron-forward" size={14} color={c.accent} />
        </button>
      ) : null}
    </div>
  );
}

export function Empty({ icon, title, text, children, color }: {
  icon: string; title: string; text?: string; children?: React.ReactNode; color?: string;
}) {
  const c = useThemeColors();
  return (
    <div className="pv-empty">
      <div className="pv-empty-icon" style={color ? { background: color + '1f' } : undefined}>
        <Ionicons name={icon as IconName} size={38} color={color ?? c.accent} />
      </div>
      <div className="pv-empty-title">{title}</div>
      {text ? <div style={{ maxWidth: 420, lineHeight: 1.5 }}>{text}</div> : null}
      {children ? <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>{children}</div> : null}
    </div>
  );
}

/** Click-outside-to-close popover state. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

/** Lecture-page text size (A−/A+), the same setting as the phone's stepper. */
export function TextSizeStepper({ compact = false }: { compact?: boolean }) {
  const c = useThemeColors();
  const {
    readerFontSize, increaseReaderFontSize, decreaseReaderFontSize, resetReaderFontSize,
  } = useSettings();
  const atMin = readerFontSize <= READER_FONT_SIZE_MIN_WIDE;
  const atMax = readerFontSize >= READER_FONT_SIZE_MAX_WIDE;
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, height: compact ? 34 : 38, padding: '0 4px',
        borderRadius: 10, border: `1px solid ${c.borderStrong}`, background: compact ? 'transparent' : c.card,
      }}
      data-tip="Lecture page text size"
      data-tip-pos="bottom"
    >
      {!compact ? <span style={{ fontSize: 12.5, fontWeight: 700, color: c.textDim, padding: '0 6px 0 8px' }}>Text size</span> : null}
      <button className="pv-icon-btn sm" onClick={decreaseReaderFontSize} disabled={atMin} aria-label="Decrease lecture text size">
        <span style={{ fontWeight: 800, fontSize: 12, color: c.accent }}>A−</span>
      </button>
      <button
        onClick={resetReaderFontSize}
        style={{ border: 0, background: 'transparent', cursor: 'pointer', minWidth: 26, fontWeight: 700, fontSize: 12.5, color: c.textQuinary }}
        aria-label="Reset text size"
      >
        {readerFontSize}
      </button>
      <button className="pv-icon-btn sm" onClick={increaseReaderFontSize} disabled={atMax} aria-label="Increase lecture text size">
        <span style={{ fontWeight: 800, fontSize: 14, color: c.accent }}>A+</span>
      </button>
    </div>
  );
}
