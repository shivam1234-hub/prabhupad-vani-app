import React, { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { useDownload } from '../../contexts/DownloadContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { getRecordingId, getTypeMeta, Recording } from '../../data/types';
import { sortRecordings } from '../../hooks/useSearch';
import { durationSec } from '../../utils/durations';
import {
  Cover, Empty, Icon, LectureTable, Page, SortKey, SortState, isCompleted, isInProgress,
  sortRows, usePlayRecording,
} from './ui';

type Status = 'all' | 'unplayed' | 'progress' | 'watched' | 'downloaded' | 'favourites';
const LEN_BUCKETS: { key: string; label: string; test: (s?: number) => boolean }[] = [
  { key: 'any', label: 'Any length', test: () => true },
  { key: 's', label: 'Under 20 min', test: s => !!s && s < 20 * 60 },
  { key: 'm', label: '20–40 min', test: s => !!s && s >= 20 * 60 && s < 40 * 60 },
  { key: 'l', label: '40–60 min', test: s => !!s && s >= 40 * 60 && s < 60 * 60 },
  { key: 'xl', label: 'Over an hour', test: s => !!s && s >= 60 * 60 },
];

/**
 * Desktop collection page: header with cover + stats + Download all, a filter
 * bar (chapter/canto, year, place, length, status, text filter) and a
 * sortable table with watched/resume badges, download state and a hover play
 * button. Same data and "jump to last played" behaviour as
 * app/category/[slug].tsx.
 */
export default function DesktopCategory() {
  const c = useThemeColors();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { byType } = useAllRecordings();
  const { isDownloaded, downloadBatch, progress } = useDownload();
  const { historyMap, getMostRecentForType } = useHistory();
  const { isFavourite, toggleFavourite, getTagsFor } = useLibrary();
  const { play } = usePlayRecording();
  const meta = getTypeMeta(slug);
  const all = byType[slug] ?? [];

  const [sort, setSort] = useState<SortState>({ key: 'sequence', dir: 1 });
  const [chapter, setChapter] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [place, setPlace] = useState<string>('');
  const [len, setLen] = useState('any');
  const [status, setStatus] = useState<Status>('all');
  const [text, setText] = useState('');

  const chapters = useMemo(() => {
    if (slug !== 'Bhagavad-gita' && slug !== 'Srimad-Bhagavatam') return [];
    const nums = new Set<number>();
    for (const r of all) { const m = r.title.match(/(\d+)\./); if (m) nums.add(parseInt(m[1], 10)); }
    return [...nums].sort((a, b) => a - b);
  }, [all, slug]);
  const years = useMemo(() => [...new Set(all.map(r => r.year).filter(Boolean))].sort((a, b) => a - b), [all]);
  const places = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) if (r.location) m.set(r.location, (m.get(r.location) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);

  const recordings = useMemo(() => {
    const q = text.trim().toLowerCase();
    const bucket = LEN_BUCKETS.find(b => b.key === len) ?? LEN_BUCKETS[0];
    const list = all.filter(r => {
      if (chapter !== null) {
        const m = r.title.match(/(\d+)\./);
        if (!m || parseInt(m[1], 10) !== chapter) return false;
      }
      if (year !== null && r.year !== year) return false;
      if (place && r.location !== place) return false;
      if (len !== 'any' && !bucket.test(durationSec(r))) return false;
      const id = getRecordingId(r);
      const e = historyMap.get(id);
      if (status === 'unplayed' && e && e.positionMs >= 5000) return false;
      if (status === 'progress' && !isInProgress(e)) return false;
      if (status === 'watched' && !isCompleted(e)) return false;
      if (status === 'downloaded' && !isDownloaded(id)) return false;
      if (status === 'favourites' && !isFavourite(id)) return false;
      if (q && !(`${r.title} ${r.fullTitle} ${r.location} ${r.date}`.toLowerCase().includes(q))) return false;
      return true;
    });
    return sortRows(list, sort, l => sortRecordings(l, 'sequence'));
  }, [all, chapter, year, place, len, status, text, sort, historyMap, isDownloaded, isFavourite]);

  const recentEntry = useMemo(() => getMostRecentForType(slug), [getMostRecentForType, slug]);

  const undownloaded = useMemo(() => recordings.filter(r => {
    const id = getRecordingId(r);
    const p = progress[id];
    return !isDownloaded(id) && (p == null || p.status === 'error');
  }), [recordings, isDownloaded, progress]);
  const failedCount = useMemo(() => recordings.filter(r => progress[getRecordingId(r)]?.status === 'error').length, [recordings, progress]);
  const downloadedCount = useMemo(() => all.filter(r => isDownloaded(getRecordingId(r))).length, [all, isDownloaded]);
  const watchedCount = useMemo(() => all.filter(r => isCompleted(historyMap.get(getRecordingId(r)))).length, [all, historyMap]);
  const isBatch = Object.values(progress).some(p => p.status === 'fetching' || p.status === 'downloading');
  const totalHours = useMemo(() => Math.round(all.reduce((s, r) => s + (durationSec(r) ?? 0), 0) / 3600), [all]);

  const onSort = useCallback((key: SortKey) => {
    setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'date' || key === 'duration' ? 1 : 1 }));
  }, []);

  const filtersOn = chapter !== null || year !== null || !!place || len !== 'any' || status !== 'all' || !!text;
  const clear = () => { setChapter(null); setYear(null); setPlace(''); setLen('any'); setStatus('all'); setText(''); };

  if (all.length === 0) {
    return <Page><Empty icon="albums-outline" title={`No recordings found for "${slug}"`} /></Page>;
  }

  const book = slug === 'Bhagavad-gita' || slug === 'Srimad-Bhagavatam' || slug === 'CC';
  const recentRec = recentEntry ? all.find(r => getRecordingId(r) === recentEntry.id) : undefined;

  const dlLabel = undownloaded.length === 0
    ? 'All downloaded'
    : failedCount > 0 && undownloaded.length === failedCount
      ? `Retry failed (${failedCount})`
      : failedCount > 0
        ? `Download + retry (${undownloaded.length})`
        : `Download ${filtersOn ? 'these' : 'all'} (${undownloaded.length})`;

  return (
    <Page>
      <div className="pv-cat-head">
        <div className="pv-cat-cover">
          <Cover type={slug} w={book ? 140 : 170} h={book ? 210 : 170} radius={10} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="pv-h-eyebrow" style={{ color: meta.color }}>Collection · {meta.badge}</span>
          <div className="pv-h-title" style={{ fontSize: 36 }}>{meta.label}</div>
          <div style={{ display: 'flex', gap: 30, marginTop: 4, flexWrap: 'wrap' }}>
            <div className="pv-stat"><b>{all.length.toLocaleString()}</b><span>Recordings</span></div>
            {totalHours > 0 ? <div className="pv-stat"><b>{totalHours.toLocaleString()} h</b><span>Of audio</span></div> : null}
            <div className="pv-stat"><b>{watchedCount}</b><span>Watched</span></div>
            <div className="pv-stat"><b>{downloadedCount}</b><span>Offline</span></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {recentRec ? (
              <button className="pv-btn primary" style={{ background: meta.color, borderColor: meta.color }} onClick={() => play(recentRec, recentEntry)}>
                <Ionicons name="play" size={16} color={c.onAccent} /> Continue · {recentRec.title}
              </button>
            ) : recordings[0] ? (
              <button className="pv-btn primary" style={{ background: meta.color, borderColor: meta.color }} onClick={() => play(recordings[0])}>
                <Ionicons name="play" size={16} color={c.onAccent} /> Play first
              </button>
            ) : null}
            <button
              className="pv-btn tint"
              style={{ ['--tint' as any]: meta.color } as React.CSSProperties}
              disabled={undownloaded.length === 0}
              onClick={() => downloadBatch(undownloaded.map(r => ({ id: getRecordingId(r), vanisourceUrl: r.vanisourceUrl })))}
            >
              <Icon name={failedCount > 0 && undownloaded.length === failedCount ? 'refresh-outline' : 'cloud-download-outline'} size={16} color={meta.color} />
              {dlLabel}
            </button>
            {isBatch ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 }}>
                <div className="pv-track" style={{ flex: 1 }}><div style={{ width: `${(downloadedCount / all.length) * 100}%`, background: meta.color }} /></div>
                <span style={{ fontSize: 12, color: 'var(--textMuted)' }}>{downloadedCount} / {all.length}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pv-filterbar">
        <div className="pv-tsearch" style={{ width: 240, height: 32 }}>
          <Icon name="filter" size={14} color={c.textDim} />
          <input value={text} onChange={e => setText(e.target.value)} placeholder={`Filter ${meta.badge} lectures…`} />
        </div>
        {chapters.length > 0 ? (
          <select className="pv-select" value={chapter ?? ''} onChange={e => setChapter(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{slug === 'Srimad-Bhagavatam' ? 'All cantos' : 'All chapters'}</option>
            {chapters.map(ch => <option key={ch} value={ch}>{slug === 'Srimad-Bhagavatam' ? `Canto ${ch}` : `Chapter ${ch}`}</option>)}
          </select>
        ) : null}
        <select className="pv-select" value={year ?? ''} onChange={e => setYear(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="pv-select" value={place} onChange={e => setPlace(e.target.value)}>
          <option value="">All places</option>
          {places.map(([p, n]) => <option key={p} value={p}>{p} ({n})</option>)}
        </select>
        <select className="pv-select" value={len} onChange={e => setLen(e.target.value)}>
          {LEN_BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <select className="pv-select" value={status} onChange={e => setStatus(e.target.value as Status)}>
          <option value="all">Any status</option>
          <option value="unplayed">Not played</option>
          <option value="progress">In progress</option>
          <option value="watched">Watched</option>
          <option value="downloaded">Downloaded</option>
          <option value="favourites">Favourites</option>
        </select>
        <select
          className="pv-select"
          value={`${sort.key}:${sort.dir}`}
          onChange={e => { const [k, d] = e.target.value.split(':'); setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 }); }}
          aria-label="Sort"
        >
          <option value="sequence:1"># Order</option>
          <option value="date:1">Date (oldest)</option>
          <option value="date:-1">Date (newest)</option>
          <option value="title:1">A → Z</option>
          <option value="title:-1">Z → A</option>
          <option value="duration:1">Shortest</option>
          <option value="duration:-1">Longest</option>
          <option value="place:1">Place</option>
        </select>
        {filtersOn ? <button className="pv-btn ghost sm" onClick={clear}><Icon name="close-circle" size={15} /> Clear</button> : null}
        <span style={{ marginLeft: 'auto' }} className="pv-filter-label">
          {recordings.length.toLocaleString()} {filtersOn ? `of ${all.length.toLocaleString()}` : ''} lectures
        </span>
      </div>

      {recordings.length === 0 ? (
        <Empty icon="search-outline" title="Nothing matches these filters" color={meta.color}>
          <button className="pv-btn" onClick={clear}>Clear filters</button>
        </Empty>
      ) : (
        <LectureTable
          rows={recordings}
          historyMap={historyMap}
          sort={sort}
          onSort={onSort}
          recentId={recentEntry?.id}
          scrollToRecent={!filtersOn}
          tint={meta.color}
          showFav
          isFav={isFavourite}
          onToggleFav={toggleFavourite}
          getTags={getTagsFor}
        />
      )}
    </Page>
  );
}

export type { Recording };
